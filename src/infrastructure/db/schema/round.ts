import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { competition, competitionParticipant } from "./competition";
export const roundStatus = pgEnum("round_status", [
  "DRAFT",
  "PUBLISHED",
  "ACTIVE",
  "FINISHED",
  "FINALIZED",
]);
export const questionType = pgEnum("question_type", [
  "MATCH_SCORE",
  "CLOSEST_VALUE",
  "OPTIONS",
  "OPEN_TEXT",
  "EXACT_VALUE",
]);
export const questionDeadlineMode = pgEnum("question_deadline_mode", [
  "ROUND_START",
  "CUSTOM",
]);
const audit = {
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  updatedByUserId: text("updated_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};
export const round = pgTable(
  "round",
  {
    id: text("id").primaryKey(),
    competitionId: text("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    status: roundStatus("status").default("DRAFT").notNull(),
    unansweredPenalty: integer("unanswered_penalty").default(-1).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    uniqueIndex("round_competition_sequence_unique").on(t.competitionId, t.sequence),
    uniqueIndex("round_competition_name_unique").on(
      t.competitionId,
      sql`lower(trim(${t.name}))`,
    ),
    index("round_competition_status_idx").on(t.competitionId, t.status),
    check("round_sequence_positive", sql`${t.sequence} > 0`),
    check("round_name_valid", sql`length(trim(${t.name})) between 1 and 120`),
    check("round_unanswered_penalty_valid", sql`${t.unansweredPenalty} in (-1, 0)`),
  ],
);
export const question = pgTable(
  "question",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id")
      .notNull()
      .references(() => round.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    type: questionType("type").notNull(),
    prompt: text("prompt"),
    deadlineMode: questionDeadlineMode("deadline_mode").default("ROUND_START").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    usesDefaultScoring: boolean("uses_default_scoring").default(true).notNull(),
    ...audit,
  },
  (t) => [
    uniqueIndex("question_round_sequence_unique").on(t.roundId, t.sequence),
    check("question_sequence_positive", sql`${t.sequence} > 0`),
    check(
      "question_prompt_valid",
      sql`(${t.type} = 'MATCH_SCORE' and ${t.prompt} is null) or (${t.type} <> 'MATCH_SCORE' and length(trim(${t.prompt})) between 1 and 500)`,
    ),
    check(
      "question_deadline_shape_valid",
      sql`(${t.deadlineMode} = 'ROUND_START' and ${t.deadlineAt} is null) or (${t.deadlineMode} = 'CUSTOM' and ${t.deadlineAt} is not null)`,
    ),
  ],
);
export const questionScoring = pgTable(
  "question_scoring",
  {
    questionId: text("question_id")
      .primaryKey()
      .references(() => question.id, { onDelete: "cascade" }),
    points: integer("points"),
    exactScorePoints: integer("exact_score_points"),
    goalDifferencePoints: integer("goal_difference_points"),
    normalResultPoints: integer("normal_result_points"),
    againstRival: boolean("against_rival"),
  },
  (t) => [
    check(
      "question_scoring_points_range",
      sql`(${t.points} is null or ${t.points} between 1 and 100) and (${t.exactScorePoints} is null or ${t.exactScorePoints} between 1 and 100) and (${t.goalDifferencePoints} is null or ${t.goalDifferencePoints} between 1 and 100) and (${t.normalResultPoints} is null or ${t.normalResultPoints} between 1 and 100)`,
    ),
    check(
      "question_scoring_shape_valid",
      sql`(${t.points} is null and ${t.exactScorePoints} is not null and ${t.normalResultPoints} is not null and ${t.againstRival} is null and ${t.exactScorePoints} > coalesce(${t.goalDifferencePoints}, ${t.normalResultPoints}) and (${t.goalDifferencePoints} is null or ${t.goalDifferencePoints} > ${t.normalResultPoints})) or (${t.points} is not null and ${t.exactScorePoints} is null and ${t.goalDifferencePoints} is null and ${t.normalResultPoints} is null)`,
    ),
  ],
);
export const matchQuestionConfig = pgTable(
  "match_question_config",
  {
    questionId: text("question_id")
      .primaryKey()
      .references(() => question.id, { onDelete: "cascade" }),
    homeLabel: text("home_label").notNull(),
    awayLabel: text("away_label").notNull(),
  },
  (t) => [
    check(
      "match_question_labels_valid",
      sql`length(trim(${t.homeLabel})) between 1 and 120 and length(trim(${t.awayLabel})) between 1 and 120 and lower(trim(${t.homeLabel})) <> lower(trim(${t.awayLabel}))`,
    ),
  ],
);
export const questionOption = pgTable(
  "question_option",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    label: text("label").notNull(),
  },
  (t) => [
    uniqueIndex("question_option_question_sequence_unique").on(t.questionId, t.sequence),
    uniqueIndex("question_option_id_question_unique").on(t.id, t.questionId),
    uniqueIndex("question_option_question_label_unique").on(
      t.questionId,
      sql`lower(trim(${t.label}))`,
    ),
    check("question_option_sequence_positive", sql`${t.sequence} > 0`),
    check("question_option_label_valid", sql`length(trim(${t.label})) between 1 and 120`),
  ],
);
export const answer = pgTable(
  "answer",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id, { onDelete: "restrict" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => competitionParticipant.id, { onDelete: "restrict" }),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    numericValue: numeric("numeric_value", { precision: 18, scale: 6 }),
    optionId: text("option_id"),
    textValue: text("text_value"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("answer_question_participant_unique").on(t.questionId, t.participantId),
    index("answer_participant_submitted_idx").on(t.participantId, t.submittedAt),
    foreignKey({
      name: "answer_option_question_fk",
      columns: [t.optionId, t.questionId],
      foreignColumns: [questionOption.id, questionOption.questionId],
    }).onDelete("restrict"),
    check(
      "answer_value_shape_valid",
      sql`(
        (${t.homeScore} is not null and ${t.awayScore} is not null and ${t.numericValue} is null and ${t.optionId} is null and ${t.textValue} is null) or
        (${t.homeScore} is null and ${t.awayScore} is null and ${t.numericValue} is not null and ${t.optionId} is null and ${t.textValue} is null) or
        (${t.homeScore} is null and ${t.awayScore} is null and ${t.numericValue} is null and ${t.optionId} is not null and ${t.textValue} is null) or
        (${t.homeScore} is null and ${t.awayScore} is null and ${t.numericValue} is null and ${t.optionId} is null and ${t.textValue} is not null)
      )`,
    ),
    check(
      "answer_match_score_valid",
      sql`${t.homeScore} is null or (${t.homeScore} between 0 and 999 and ${t.awayScore} between 0 and 999)`,
    ),
    check(
      "answer_text_value_valid",
      sql`${t.textValue} is null or length(trim(${t.textValue})) between 1 and 500`,
    ),
  ],
);
export const roundRelations = relations(round, ({ many }) => ({
  questions: many(question),
}));
export const questionRelations = relations(question, ({ one, many }) => ({
  round: one(round, { fields: [question.roundId], references: [round.id] }),
  scoring: one(questionScoring),
  match: one(matchQuestionConfig),
  options: many(questionOption),
  answers: many(answer),
}));
export const answerRelations = relations(answer, ({ one }) => ({
  question: one(question, { fields: [answer.questionId], references: [question.id] }),
  participant: one(competitionParticipant, {
    fields: [answer.participantId],
    references: [competitionParticipant.id],
  }),
  option: one(questionOption, {
    fields: [answer.optionId],
    references: [questionOption.id],
  }),
}));
