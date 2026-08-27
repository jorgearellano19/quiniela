import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { competition, competitionParticipant } from "./competition";
import { round } from "./round";

export const paymentEventAction = pgEnum("payment_event_action", [
  "RECORDED",
  "CORRECTED",
]);

export const prizeType = pgEnum("prize_type", [
  "ROUND_WINNER",
  "LEAGUE_WINNER",
  "LEAGUE_PHASE_WINNER",
  "PLAYOFF_CHAMPION",
]);

export const paymentObligation = pgTable(
  "payment_obligation",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    competitionParticipantId: text("competition_participant_id").notNull(),
    roundId: text("round_id").notNull(),
    amount: integer("amount").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("payment_obligation_participant_round_unique").on(
      table.competitionParticipantId,
      table.roundId,
    ),
    index("payment_obligation_competition_idx").on(table.competitionId),
    foreignKey({
      name: "payment_obligation_participant_competition_fk",
      columns: [table.competitionParticipantId, table.competitionId],
      foreignColumns: [competitionParticipant.id, competitionParticipant.competitionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_obligation_round_competition_fk",
      columns: [table.roundId, table.competitionId],
      foreignColumns: [round.id, round.competitionId],
    }).onDelete("restrict"),
    check("payment_obligation_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    competitionParticipantId: text("competition_participant_id")
      .notNull()
      .references(() => competitionParticipant.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    recordedByUserId: text("recorded_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("payment_participant_paid_at_idx").on(
      table.competitionParticipantId,
      table.paidAt,
    ),
    check("payment_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const paymentEvent = pgTable(
  "payment_event",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payment.id, { onDelete: "restrict" }),
    action: paymentEventAction("action").notNull(),
    beforeAmount: integer("before_amount"),
    beforePaidAt: timestamp("before_paid_at", { withTimezone: true }),
    afterAmount: integer("after_amount").notNull(),
    afterPaidAt: timestamp("after_paid_at", { withTimezone: true }).notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("payment_event_payment_time_idx").on(table.paymentId, table.createdAt),
    check(
      "payment_event_shape_valid",
      sql`(${table.action} = 'RECORDED' and ${table.beforeAmount} is null and ${table.beforePaidAt} is null) or (${table.action} = 'CORRECTED' and ${table.beforeAmount} > 0 and ${table.beforePaidAt} is not null and (${table.beforeAmount} <> ${table.afterAmount} or ${table.beforePaidAt} <> ${table.afterPaidAt}))`,
    ),
    check("payment_event_after_amount_positive", sql`${table.afterAmount} > 0`),
  ],
);

export const prizeConfiguration = pgTable(
  "prize_configuration",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    type: prizeType("type").notNull(),
    amount: integer("amount").notNull(),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("prize_configuration_competition_type_unique").on(
      table.competitionId,
      table.type,
    ),
    check("prize_configuration_amount_positive", sql`${table.amount} > 0`),
  ],
);
