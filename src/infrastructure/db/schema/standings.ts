import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { competition, competitionParticipant } from "./competition";
import { round } from "./round";

export const rankingResolutionScope = pgEnum("ranking_resolution_scope", [
  "LEAGUE_STANDINGS",
  "ROUND_WINNER",
]);
export const rankingResolutionAction = pgEnum("ranking_resolution_action", [
  "CREATED",
  "CORRECTED",
]);

export const manualRankingResolution = pgTable(
  "manual_ranking_resolution",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    scope: rankingResolutionScope("scope").notNull(),
    roundId: text("round_id").references(() => round.id, { onDelete: "restrict" }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    tieFingerprint: text("tie_fingerprint").notNull(),
    revision: integer("revision").notNull(),
    supersedesResolutionId: text("supersedes_resolution_id"),
    action: rankingResolutionAction("action").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "manual_ranking_resolution_supersedes_fk",
      columns: [table.supersedesResolutionId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    uniqueIndex("manual_ranking_resolution_supersedes_unique")
      .on(table.supersedesResolutionId)
      .where(sql`${table.supersedesResolutionId} is not null`),
    uniqueIndex("manual_ranking_resolution_league_revision_unique")
      .on(
        table.competitionId,
        table.scope,
        table.sourceFingerprint,
        table.tieFingerprint,
        table.revision,
      )
      .where(sql`${table.roundId} is null`),
    uniqueIndex("manual_ranking_resolution_round_revision_unique")
      .on(
        table.roundId,
        table.scope,
        table.sourceFingerprint,
        table.tieFingerprint,
        table.revision,
      )
      .where(sql`${table.roundId} is not null`),
    index("manual_ranking_resolution_scope_idx").on(
      table.competitionId,
      table.scope,
      table.roundId,
    ),
    check(
      "manual_ranking_resolution_scope_shape",
      sql`(${table.scope} = 'LEAGUE_STANDINGS' and ${table.roundId} is null) or (${table.scope} = 'ROUND_WINNER' and ${table.roundId} is not null)`,
    ),
    check("manual_ranking_resolution_revision_positive", sql`${table.revision} > 0`),
    check(
      "manual_ranking_resolution_fingerprints_valid",
      sql`length(${table.sourceFingerprint}) = 64 and length(${table.tieFingerprint}) = 64`,
    ),
    check(
      "manual_ranking_resolution_action_valid",
      sql`(${table.action} = 'CREATED' and ${table.revision} = 1 and ${table.supersedesResolutionId} is null) or (${table.action} = 'CORRECTED' and ${table.revision} > 1 and ${table.supersedesResolutionId} is not null)`,
    ),
  ],
);

export const manualRankingResolutionEntry = pgTable(
  "manual_ranking_resolution_entry",
  {
    resolutionId: text("resolution_id")
      .notNull()
      .references(() => manualRankingResolution.id, { onDelete: "restrict" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => competitionParticipant.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.resolutionId, table.participantId] }),
    uniqueIndex("manual_ranking_resolution_entry_position_unique").on(
      table.resolutionId,
      table.position,
    ),
    check(
      "manual_ranking_resolution_entry_position_positive",
      sql`${table.position} > 0`,
    ),
  ],
);
