import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
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
export const competition = pgTable(
  "competition",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: competitionType("type").notNull(),
    status: competitionStatus("status").default("DRAFT").notNull(),
    currency: text("currency").default("MXN").notNull(),
    rulesNote: text("rules_note"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("competition_creator_idx").on(table.createdByUserId),
    check("competition_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("competition_currency_mxn", sql`${table.currency} = 'MXN'`),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("competition_participant_competition_user_unique").on(
      table.competitionId,
      table.userId,
    ),
    index("competition_participant_user_idx").on(table.userId),
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
