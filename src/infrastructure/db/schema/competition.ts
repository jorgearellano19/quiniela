import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const competitionType = pgEnum("competition_type", [
  "LEAGUE",
  "LEAGUE_PLAYOFFS",
  "GROUP_PLAYOFFS",
]);
export const competitionStatus = pgEnum("competition_status", [
  "DRAFT",
  "STARTED",
  "COMPLETED",
]);
export const membershipStatus = pgEnum("competition_participant_status", [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "REMOVED",
]);
export const membershipEventType = pgEnum("competition_participant_event_type", [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "REMOVED",
  "LEFT",
]);
export const competition = pgTable(
  "competition",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: competitionType("type").notNull(),
    status: competitionStatus("status").default("DRAFT").notNull(),
    currency: text("currency").default("MXN").notNull(),
    rulesNote: text("rules_note"),
    invitationTokenHash: text("invitation_token_hash"),
    invitationInvalidatedAt: timestamp("invitation_invalidated_at", {
      withTimezone: true,
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    defaultMatchExactScorePoints: integer("default_match_exact_score_points")
      .default(3)
      .notNull(),
    defaultMatchGoalDifferencePoints: integer(
      "default_match_goal_difference_points",
    ).default(2),
    defaultMatchNormalResultPoints: integer("default_match_normal_result_points")
      .default(1)
      .notNull(),
    defaultClosestValuePoints: integer("default_closest_value_points")
      .default(1)
      .notNull(),
    defaultOptionsPoints: integer("default_options_points").default(1).notNull(),
    defaultOpenTextPoints: integer("default_open_text_points").default(1).notNull(),
    defaultExactValuePoints: integer("default_exact_value_points").default(1).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("competition_creator_idx").on(table.createdByUserId),
    uniqueIndex("competition_invitation_token_hash_unique")
      .on(table.invitationTokenHash)
      .where(sql`${table.invitationTokenHash} is not null`),
    check("competition_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("competition_currency_mxn", sql`${table.currency} = 'MXN'`),
    check(
      "competition_default_scoring_valid",
      sql`${table.defaultMatchExactScorePoints} between 1 and 100 and ${table.defaultMatchNormalResultPoints} between 1 and 100 and (${table.defaultMatchGoalDifferencePoints} is null or ${table.defaultMatchGoalDifferencePoints} between 1 and 100) and ${table.defaultMatchExactScorePoints} > coalesce(${table.defaultMatchGoalDifferencePoints}, ${table.defaultMatchNormalResultPoints}) and (${table.defaultMatchGoalDifferencePoints} is null or ${table.defaultMatchGoalDifferencePoints} > ${table.defaultMatchNormalResultPoints}) and ${table.defaultClosestValuePoints} between 1 and 100 and ${table.defaultOptionsPoints} between 1 and 100 and ${table.defaultOpenTextPoints} between 1 and 100 and ${table.defaultExactValuePoints} between 1 and 100`,
    ),
  ],
);

export const competitionParticipant = pgTable(
  "competition_participant",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    isAdmin: boolean("is_admin").default(false).notNull(),
    status: membershipStatus("status").default("PENDING").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("competition_participant_competition_user_unique").on(
      table.competitionId,
      table.userId,
    ),
    index("competition_participant_user_idx").on(table.userId),
    index("competition_participant_competition_status_idx").on(
      table.competitionId,
      table.status,
    ),
  ],
);

export const competitionParticipantEvent = pgTable(
  "competition_participant_event",
  {
    id: text("id").primaryKey(),
    membershipId: text("membership_id")
      .notNull()
      .references(() => competitionParticipant.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    type: membershipEventType("type").notNull(),
    previousStatus: membershipStatus("previous_status"),
    nextStatus: membershipStatus("next_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("competition_participant_event_membership_idx").on(
      table.membershipId,
      table.createdAt,
    ),
  ],
);

export const competitionRelations = relations(competition, ({ many }) => ({
  memberships: many(competitionParticipant),
}));
export const competitionParticipantRelations = relations(
  competitionParticipant,
  ({ one }) => ({
    competition: one(competition, {
      fields: [competitionParticipant.competitionId],
      references: [competition.id],
    }),
    user: one(user, {
      fields: [competitionParticipant.userId],
      references: [user.id],
    }),
  }),
);
