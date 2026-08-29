import { randomUUID } from "node:crypto";
import { and, asc, count, eq, exists, inArray, sql } from "drizzle-orm";
import type { RoundRepository, RoundAggregate } from "@/application/round/use-cases";
import {
  createQuestion as validateQuestion,
  type CompetitionScoringDefaults,
  type Question,
  type Round,
} from "@/domain/round/round";
import { db } from "@/infrastructure/db/client";
import {
  competition,
  competitionParticipant,
  matchQuestionConfig,
  question,
  questionOption,
  questionScoring,
  round,
  paymentObligation,
} from "@/infrastructure/db/schema";

export function scoringDefaults(
  row: typeof competition.$inferSelect,
): CompetitionScoringDefaults {
  return {
    matchScore: {
      exactScorePoints: row.defaultMatchExactScorePoints,
      goalDifferencePoints: row.defaultMatchGoalDifferencePoints,
      normalResultPoints: row.defaultMatchNormalResultPoints,
    },
    closestValuePoints: row.defaultClosestValuePoints,
    optionsPoints: row.defaultOptionsPoints,
    openTextPoints: row.defaultOpenTextPoints,
    exactValuePoints: row.defaultExactValuePoints,
  };
}
export async function loadQuestions(
  database: typeof db,
  roundValue: Round,
  defaults: CompetitionScoringDefaults,
): Promise<Question[]> {
  const roundId = roundValue.id;
  const rows = await database
    .select({ q: question, s: questionScoring, m: matchQuestionConfig })
    .from(question)
    .leftJoin(questionScoring, eq(questionScoring.questionId, question.id))
    .leftJoin(matchQuestionConfig, eq(matchQuestionConfig.questionId, question.id))
    .where(eq(question.roundId, roundId))
    .orderBy(asc(question.sequence));
  const optionRows = await database
    .select()
    .from(questionOption)
    .where(
      sql`${questionOption.questionId} in (select ${question.id} from ${question} where ${question.roundId} = ${roundId})`,
    )
    .orderBy(asc(questionOption.sequence));
  return rows.map(({ q, s, m }) => {
    if (!s) throw new Error(`Question persistence is incomplete: ${q.id}.`);
    const inheritsDefaults = roundValue.status === "DRAFT" && q.usesDefaultScoring;
    const base = {
      ...q,
      deadlineAt: q.deadlineMode === "ROUND_START" ? roundValue.startsAt : q.deadlineAt!,
    };
    let value: Question;
    if (q.type === "MATCH_SCORE") {
      if (
        !m ||
        s.exactScorePoints === null ||
        s.normalResultPoints === null ||
        s.points !== null ||
        s.againstRival !== null
      )
        throw new Error(`Match Question persistence is invalid: ${q.id}.`);
      value = {
        ...base,
        type: q.type,
        homeLabel: m.homeLabel,
        awayLabel: m.awayLabel,
        exactScorePoints: inheritsDefaults
          ? defaults.matchScore.exactScorePoints
          : s.exactScorePoints,
        goalDifferencePoints: inheritsDefaults
          ? defaults.matchScore.goalDifferencePoints
          : s.goalDifferencePoints,
        normalResultPoints: inheritsDefaults
          ? defaults.matchScore.normalResultPoints
          : s.normalResultPoints,
      };
    } else if (q.type === "CLOSEST_VALUE") {
      if (
        s.points === null ||
        s.againstRival === null ||
        s.exactScorePoints !== null ||
        s.goalDifferencePoints !== null ||
        s.normalResultPoints !== null ||
        m
      )
        throw new Error(`Closest-value Question persistence is invalid: ${q.id}.`);
      value = {
        ...base,
        type: q.type,
        points: inheritsDefaults ? defaults.closestValuePoints : s.points,
        againstRival: s.againstRival,
      };
    } else if (q.type === "OPTIONS") {
      const options = optionRows
        .filter((o) => o.questionId === q.id)
        .map(({ id, sequence, label }) => ({ id, sequence, label }));
      if (
        s.points === null ||
        s.againstRival !== null ||
        s.exactScorePoints !== null ||
        s.goalDifferencePoints !== null ||
        s.normalResultPoints !== null ||
        m ||
        options.length < 2 ||
        options.length > 20
      )
        throw new Error(`Options Question persistence is invalid: ${q.id}.`);
      value = {
        ...base,
        type: q.type,
        points: inheritsDefaults ? defaults.optionsPoints : s.points,
        options,
      };
    } else {
      if (
        s.points === null ||
        s.againstRival !== null ||
        s.exactScorePoints !== null ||
        s.goalDifferencePoints !== null ||
        s.normalResultPoints !== null ||
        m
      )
        throw new Error(`Question persistence is invalid: ${q.id}.`);
      value = {
        ...base,
        type: q.type,
        points: inheritsDefaults
          ? q.type === "OPEN_TEXT"
            ? defaults.openTextPoints
            : defaults.exactValuePoints
          : s.points,
      };
    }
    try {
      validateQuestion({
        ...value,
        actorUserId: value.updatedByUserId,
        now: value.createdAt,
      });
    } catch (error) {
      throw new Error(`Question persistence violates domain rules: ${q.id}.`, {
        cause: error,
      });
    }
    return value;
  });
}
async function saveQuestionConfiguration(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  value: Question,
) {
  if (value.type === "MATCH_SCORE") {
    await tx.insert(questionScoring).values({
      questionId: value.id,
      exactScorePoints: value.exactScorePoints,
      goalDifferencePoints: value.goalDifferencePoints,
      normalResultPoints: value.normalResultPoints,
    });
    await tx.insert(matchQuestionConfig).values({
      questionId: value.id,
      homeLabel: value.homeLabel,
      awayLabel: value.awayLabel,
    });
  } else {
    await tx.insert(questionScoring).values({
      questionId: value.id,
      points: value.points,
      againstRival: value.type === "CLOSEST_VALUE" ? value.againstRival : null,
    });
    if (value.type === "OPTIONS")
      await tx
        .insert(questionOption)
        .values(value.options.map((o) => ({ ...o, questionId: value.id })));
  }
}
async function saveQuestion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  value: Question,
  isNew: boolean,
) {
  const fields = {
    roundId: value.roundId,
    sequence: value.sequence,
    type: value.type,
    prompt: value.prompt,
    deadlineMode: value.deadlineMode,
    deadlineAt: value.deadlineMode === "CUSTOM" ? value.deadlineAt : null,
    usesDefaultScoring: value.usesDefaultScoring,
    updatedByUserId: value.updatedByUserId,
    updatedAt: value.updatedAt,
  };
  if (isNew)
    await tx.insert(question).values({
      id: value.id,
      ...fields,
      createdByUserId: value.createdByUserId,
      createdAt: value.createdAt,
    });
  else {
    await tx.delete(questionOption).where(eq(questionOption.questionId, value.id));
    await tx
      .delete(matchQuestionConfig)
      .where(eq(matchQuestionConfig.questionId, value.id));
    await tx.delete(questionScoring).where(eq(questionScoring.questionId, value.id));
    const updated = await tx
      .update(question)
      .set(fields)
      .where(and(eq(question.id, value.id), eq(question.roundId, value.roundId)))
      .returning({ id: question.id });
    if (updated.length !== 1) throw new Error("Question update target disappeared.");
  }
  await saveQuestionConfiguration(tx, value);
}
export function createRoundRepository(database: typeof db): RoundRepository {
  function penalty(value: number): -1 | 0 {
    if (value !== -1 && value !== 0) throw new Error("Invalid persisted penalty.");
    return value;
  }
  return {
    async getCompetitionForAdmin(competitionId, userId) {
      const [row] = await database
        .select({ value: competition })
        .from(competition)
        .innerJoin(
          competitionParticipant,
          and(
            eq(competitionParticipant.competitionId, competition.id),
            eq(competitionParticipant.userId, userId),
            eq(competitionParticipant.isAdmin, true),
          ),
        )
        .where(eq(competition.id, competitionId))
        .limit(1);
      return row
        ? {
            id: row.value.id,
            type: row.value.type,
            status: row.value.status,
            scoringDefaults: scoringDefaults(row.value),
          }
        : null;
    },
    async create(value, userId) {
      return database.transaction(async (tx) => {
        const authorized = await tx.execute(
          sql`select c.id from competition c join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where c.id = ${value.competitionId} and c.status <> 'COMPLETED' for update`,
        );
        if (!authorized.length) return false;
        await tx.insert(round).values(value);
        return true;
      });
    },
    async list(competitionId) {
      const rows = await database
        .select({ value: round, questionCount: count(question.id) })
        .from(round)
        .leftJoin(question, eq(question.roundId, round.id))
        .where(eq(round.competitionId, competitionId))
        .groupBy(round.id)
        .orderBy(asc(round.sequence));
      return rows.map(({ value, questionCount }) => ({
        round: { ...value, unansweredPenalty: penalty(value.unansweredPenalty) },
        questionCount,
      }));
    },
    async getEditor(roundId, userId) {
      const [row] = await database
        .select({
          value: round,
          competitionType: competition.type,
          competitionStatus: competition.status,
          competitionRow: competition,
          questionCount: count(question.id),
        })
        .from(round)
        .innerJoin(competition, eq(competition.id, round.competitionId))
        .innerJoin(
          competitionParticipant,
          and(
            eq(competitionParticipant.competitionId, competition.id),
            eq(competitionParticipant.userId, userId),
            eq(competitionParticipant.isAdmin, true),
          ),
        )
        .leftJoin(question, eq(question.roundId, round.id))
        .where(eq(round.id, roundId))
        .groupBy(round.id, competition.id)
        .limit(1);
      if (!row) return null;
      const roundValue = {
        ...row.value,
        unansweredPenalty: penalty(row.value.unansweredPenalty),
      } satisfies Round;
      const defaults = scoringDefaults(row.competitionRow);
      return {
        round: roundValue,
        competitionType: row.competitionType,
        competitionStatus: row.competitionStatus,
        scoringDefaults: defaults,
        questions: await loadQuestions(database, roundValue, defaults),
      };
    },
    async updateDraft(value, userId) {
      const changed = await database
        .update(round)
        .set({
          sequence: value.sequence,
          name: value.name,
          startsAt: value.startsAt,
          unansweredPenalty: value.unansweredPenalty,
          updatedAt: value.updatedAt,
          updatedByUserId: userId,
        })
        .where(
          and(
            eq(round.id, value.id),
            eq(round.competitionId, value.competitionId),
            eq(round.status, "DRAFT"),
            exists(
              database
                .select({ id: competitionParticipant.id })
                .from(competitionParticipant)
                .where(
                  and(
                    eq(competitionParticipant.competitionId, value.competitionId),
                    eq(competitionParticipant.userId, userId),
                    eq(competitionParticipant.isAdmin, true),
                    exists(
                      database
                        .select({ id: competition.id })
                        .from(competition)
                        .where(
                          and(
                            eq(competition.id, value.competitionId),
                            sql`${competition.status} <> 'COMPLETED'`,
                          ),
                        ),
                    ),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: round.id });
      return changed.length === 1;
    },
    async mutateQuestion(roundId, userId, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select r.* from round r join competition_participant cp on cp.competition_id = r.competition_id and cp.user_id = ${userId} and cp.is_admin = true join competition c on c.id = r.competition_id and c.status <> 'COMPLETED' where r.id = ${roundId} for update`,
        );
        if (!locked.length) return null;
        const [persistedRound] = await tx
          .select()
          .from(round)
          .where(eq(round.id, roundId));
        if (!persistedRound) return null;
        const currentRound = {
          ...persistedRound,
          unansweredPenalty: penalty(persistedRound.unansweredPenalty),
        } satisfies Round;
        const [competitionValue] = await tx
          .select()
          .from(competition)
          .where(eq(competition.id, currentRound.competitionId));
        if (!competitionValue) return null;
        const questions = await loadQuestions(
          tx as unknown as typeof db,
          currentRound,
          scoringDefaults(competitionValue),
        );
        const changed = operation(currentRound, questions);
        if (changed.kind === "remove") {
          const removed = await tx
            .delete(question)
            .where(
              and(eq(question.id, changed.questionId), eq(question.roundId, roundId)),
            )
            .returning({ id: question.id });
          if (removed.length !== 1)
            throw new Error("Question removal target disappeared.");
          return null;
        }
        await saveQuestion(tx, changed.value, changed.isNew);
        return changed.value;
      });
    },
    async publish(roundId, userId, now) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select r.* from round r join competition c on c.id = r.competition_id and c.status = 'STARTED' join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where r.id = ${roundId} and (c.type = 'LEAGUE' or exists (select 1 from h2h_matchup hm where hm.round_id = r.id)) for update`,
        );
        if (!locked.length) return null;
        const [persistedRound] = await tx
          .select()
          .from(round)
          .where(eq(round.id, roundId));
        if (!persistedRound) return null;
        const value = {
          ...persistedRound,
          unansweredPenalty: penalty(persistedRound.unansweredPenalty),
        } satisfies Round;
        const [competitionRow] = await tx
          .select()
          .from(competition)
          .where(eq(competition.id, value.competitionId));
        if (!competitionRow) return null;
        const defaults = scoringDefaults(competitionRow);
        const questions = await loadQuestions(
          tx as unknown as typeof db,
          value,
          defaults,
        );
        const activated = (await import("@/domain/round/round")).publishRound(
          value,
          questions,
          now,
        );
        if (activated !== value)
          await tx
            .update(round)
            .set({
              status: "ACTIVE",
              publishedAt: activated.publishedAt,
              updatedAt: now,
              updatedByUserId: userId,
            })
            .where(eq(round.id, roundId));
        for (const item of questions.filter((entry) => entry.usesDefaultScoring)) {
          await tx
            .update(questionScoring)
            .set(
              item.type === "MATCH_SCORE"
                ? {
                    exactScorePoints: item.exactScorePoints,
                    goalDifferencePoints: item.goalDifferencePoints,
                    normalResultPoints: item.normalResultPoints,
                  }
                : { points: item.points },
            )
            .where(eq(questionScoring.questionId, item.id));
        }
        if (competitionRow.paymentsEnabled && competitionRow.roundFeeAmount !== null) {
          const participants = await tx
            .select({ id: competitionParticipant.id })
            .from(competitionParticipant)
            .where(
              and(
                eq(competitionParticipant.competitionId, value.competitionId),
                eq(competitionParticipant.status, "ACTIVE"),
              ),
            );
          if (participants.length)
            await tx
              .insert(paymentObligation)
              .values(
                participants.map((participant) => ({
                  id: randomUUID(),
                  competitionId: value.competitionId,
                  competitionParticipantId: participant.id,
                  roundId: value.id,
                  amount: competitionRow.roundFeeAmount!,
                  createdByUserId: userId,
                  createdAt: now,
                  updatedAt: now,
                })),
              )
              .onConflictDoNothing({
                target: [
                  paymentObligation.competitionParticipantId,
                  paymentObligation.roundId,
                ],
              });
        }
        const persisted =
          activated === value ? activated : { ...activated, updatedByUserId: userId };
        return {
          round: persisted,
          questions,
          competitionType: competitionRow.type,
          competitionStatus: "STARTED",
          scoringDefaults: defaults,
        } satisfies RoundAggregate;
      });
    },
    async updateScoringDefaults(competitionId, userId, value) {
      const changed = await database
        .update(competition)
        .set({
          defaultMatchExactScorePoints: value.matchScore.exactScorePoints,
          defaultMatchGoalDifferencePoints: value.matchScore.goalDifferencePoints,
          defaultMatchNormalResultPoints: value.matchScore.normalResultPoints,
          defaultClosestValuePoints: value.closestValuePoints,
          defaultOptionsPoints: value.optionsPoints,
          defaultOpenTextPoints: value.openTextPoints,
          defaultExactValuePoints: value.exactValuePoints,
          updatedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(competition.id, competitionId),
            sql`${competition.status} <> 'COMPLETED'`,
            exists(
              database
                .select({ id: competitionParticipant.id })
                .from(competitionParticipant)
                .where(
                  and(
                    eq(competitionParticipant.competitionId, competitionId),
                    eq(competitionParticipant.userId, userId),
                    eq(competitionParticipant.isAdmin, true),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: competition.id });
      return changed.length === 1;
    },
    async reorderRounds(competitionId, userId, ids) {
      return database.transaction(async (tx) => {
        const authorized = await tx.execute(
          sql`select c.id from competition c join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where c.id = ${competitionId} and c.status <> 'COMPLETED' for update`,
        );
        if (!authorized.length) return false;
        const rows = await tx
          .select({ id: round.id, status: round.status })
          .from(round)
          .where(eq(round.competitionId, competitionId));
        if (
          rows.length !== ids.length ||
          rows.some((row) => row.status !== "DRAFT" || !ids.includes(row.id))
        )
          return false;
        await tx
          .update(round)
          .set({ sequence: sql`${round.sequence} + 1000000` })
          .where(inArray(round.id, ids));
        for (const [index, roundId] of ids.entries())
          await tx
            .update(round)
            .set({ sequence: index + 1, updatedByUserId: userId, updatedAt: new Date() })
            .where(eq(round.id, roundId));
        return true;
      });
    },
    async reorderQuestions(roundId, userId, ids) {
      return database.transaction(async (tx) => {
        const authorized = await tx.execute(
          sql`select r.id from round r join competition c on c.id = r.competition_id and c.status <> 'COMPLETED' join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where r.id = ${roundId} and r.status = 'DRAFT' for update`,
        );
        if (!authorized.length) return false;
        const rows = await tx
          .select({ id: question.id })
          .from(question)
          .where(eq(question.roundId, roundId));
        if (rows.length !== ids.length || rows.some((row) => !ids.includes(row.id)))
          return false;
        await tx
          .update(question)
          .set({ sequence: sql`${question.sequence} + 1000000` })
          .where(inArray(question.id, ids));
        for (const [index, questionId] of ids.entries())
          await tx
            .update(question)
            .set({ sequence: index + 1, updatedByUserId: userId, updatedAt: new Date() })
            .where(eq(question.id, questionId));
        return true;
      });
    },
    async deleteDraft(roundId, competitionId, userId) {
      return database.transaction(async (tx) => {
        const authorized = await tx.execute(
          sql`select r.id from round r join competition c on c.id = r.competition_id and c.status <> 'COMPLETED' join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where r.id = ${roundId} and r.competition_id = ${competitionId} and r.status = 'DRAFT' for update`,
        );
        if (!authorized.length) return false;
        await tx.delete(question).where(eq(question.roundId, roundId));
        const removed = await tx
          .delete(round)
          .where(
            and(
              eq(round.id, roundId),
              eq(round.competitionId, competitionId),
              eq(round.status, "DRAFT"),
            ),
          )
          .returning({ id: round.id });
        return removed.length === 1;
      });
    },
  };
}
export const roundRepository = createRoundRepository(db);
