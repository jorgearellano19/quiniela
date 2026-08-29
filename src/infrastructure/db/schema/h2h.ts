import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { competition, competitionParticipant } from "./competition";
import { round } from "./round";

export const h2hPhaseConfiguration = pgTable(
  "h2h_phase_configuration",
  {
    competitionId: text("competition_id")
      .primaryKey()
      .references(() => competition.id, { onDelete: "restrict" }),
    leagueRoundCount: integer("league_round_count"),
    qualifierCount: integer("qualifier_count"),
    groupSize: integer("group_size"),
    advancersPerGroup: integer("advancers_per_group"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    generatedByUserId: text("generated_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    check(
      "h2h_phase_configuration_shape",
      sql`(${table.leagueRoundCount} is not null and ${table.qualifierCount} in (2,4,8,16) and ${table.groupSize} is null and ${table.advancersPerGroup} is null) or (${table.leagueRoundCount} is null and ${table.qualifierCount} is null and ${table.groupSize} in (4,8) and ${table.advancersPerGroup} in (1,2))`,
    ),
    check(
      "h2h_phase_configuration_rounds_positive",
      sql`${table.leagueRoundCount} is null or ${table.leagueRoundCount} > 0`,
    ),
  ],
);

export const h2hDrawParticipant = pgTable(
  "h2h_draw_participant",
  {
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    participantId: text("participant_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.competitionId, table.participantId] }),
    uniqueIndex("h2h_draw_competition_position_unique").on(
      table.competitionId,
      table.position,
    ),
    foreignKey({
      name: "h2h_draw_participant_competition_fk",
      columns: [table.participantId, table.competitionId],
      foreignColumns: [competitionParticipant.id, competitionParticipant.competitionId],
    }).onDelete("restrict"),
    check("h2h_draw_position_positive", sql`${table.position} > 0`),
  ],
);

export const competitionGroup = pgTable(
  "competition_group",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
    confirmedByUserId: text("confirmed_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("competition_group_competition_position_unique").on(
      table.competitionId,
      table.position,
    ),
    uniqueIndex("competition_group_id_competition_unique").on(
      table.id,
      table.competitionId,
    ),
    check("competition_group_position_positive", sql`${table.position} > 0`),
  ],
);

export const competitionGroupParticipant = pgTable(
  "competition_group_participant",
  {
    groupId: text("group_id").notNull(),
    competitionId: text("competition_id").notNull(),
    participantId: text("participant_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.participantId] }),
    uniqueIndex("competition_group_participant_competition_unique").on(
      table.competitionId,
      table.participantId,
    ),
    uniqueIndex("competition_group_participant_position_unique").on(
      table.groupId,
      table.position,
    ),
    foreignKey({
      name: "competition_group_participant_group_fk",
      columns: [table.groupId, table.competitionId],
      foreignColumns: [competitionGroup.id, competitionGroup.competitionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "competition_group_participant_member_fk",
      columns: [table.participantId, table.competitionId],
      foreignColumns: [competitionParticipant.id, competitionParticipant.competitionId],
    }).onDelete("restrict"),
    check("competition_group_participant_position_positive", sql`${table.position} > 0`),
  ],
);

export const h2hMatchup = pgTable(
  "h2h_matchup",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id").notNull(),
    roundId: text("round_id").notNull(),
    groupId: text("group_id"),
    participantAId: text("participant_a_id").notNull(),
    participantBId: text("participant_b_id"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("h2h_matchup_round_position_unique").on(table.roundId, table.position),
    index("h2h_matchup_competition_round_idx").on(table.competitionId, table.roundId),
    index("h2h_matchup_group_idx").on(table.groupId, table.roundId),
    foreignKey({
      name: "h2h_matchup_round_competition_fk",
      columns: [table.roundId, table.competitionId],
      foreignColumns: [round.id, round.competitionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "h2h_matchup_group_competition_fk",
      columns: [table.groupId, table.competitionId],
      foreignColumns: [competitionGroup.id, competitionGroup.competitionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "h2h_matchup_participant_a_fk",
      columns: [table.participantAId, table.competitionId],
      foreignColumns: [competitionParticipant.id, competitionParticipant.competitionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "h2h_matchup_participant_b_fk",
      columns: [table.participantBId, table.competitionId],
      foreignColumns: [competitionParticipant.id, competitionParticipant.competitionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "h2h_matchup_group_participant_a_fk",
      columns: [table.groupId, table.participantAId],
      foreignColumns: [
        competitionGroupParticipant.groupId,
        competitionGroupParticipant.participantId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "h2h_matchup_group_participant_b_fk",
      columns: [table.groupId, table.participantBId],
      foreignColumns: [
        competitionGroupParticipant.groupId,
        competitionGroupParticipant.participantId,
      ],
    }).onDelete("restrict"),
    check("h2h_matchup_position_positive", sql`${table.position} > 0`),
    check(
      "h2h_matchup_distinct_participants",
      sql`${table.participantBId} is null or ${table.participantAId} <> ${table.participantBId}`,
    ),
  ],
);
