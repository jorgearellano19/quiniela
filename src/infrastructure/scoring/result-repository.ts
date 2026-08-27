import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type {
  JudgmentMutationDecision,
  ResultMutationDecision,
  ResultRepository,
  ResultRoundAggregate,
} from "@/application/scoring/use-cases";
import { normalizeDecimal, type Answer, type AnswerValue } from "@/domain/answer/answer";
import type { Round } from "@/domain/round/round";
import { finishRound } from "@/domain/scoring/lifecycle";
import {
  isQuestionResultComplete,
  type OfficialResult,
  type OfficialResultValue,
  type OpenTextJudgment,
} from "@/domain/scoring/scoring";
import { db } from "@/infrastructure/db/client";
import {
  answer,
  competition,
  competitionParticipant,
  officialResult,
  officialResultCorrectionEvent,
  openTextJudgment,
  openTextJudgmentCorrectionEvent,
  round,
  user,
} from "@/infrastructure/db/schema";
import { loadQuestions, scoringDefaults } from "@/infrastructure/round/round-repository";

function penalty(value: number): -1 | 0 {
  if (value !== -1 && value !== 0) throw new Error("Invalid persisted penalty.");
  return value;
}

export function persistedRound(value: typeof round.$inferSelect): Round {
  return { ...value, unansweredPenalty: penalty(value.unansweredPenalty) };
}

function answerValue(row: typeof answer.$inferSelect, type: string): AnswerValue {
  if (type === "MATCH_SCORE" && row.homeScore !== null && row.awayScore !== null)
    return { type, homeScore: row.homeScore, awayScore: row.awayScore };
  if ((type === "CLOSEST_VALUE" || type === "EXACT_VALUE") && row.numericValue !== null)
    return { type, value: normalizeDecimal(row.numericValue) };
  if (type === "OPTIONS" && row.optionId !== null)
    return { type, optionId: row.optionId };
  if (type === "OPEN_TEXT" && row.textValue !== null)
    return { type, value: row.textValue };
  throw new Error(`Answer persistence is invalid: ${row.id}.`);
}

export function domainAnswer(row: typeof answer.$inferSelect, type: string): Answer {
  return {
    id: row.id,
    questionId: row.questionId,
    participantId: row.participantId,
    value: answerValue(row, type),
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
  };
}

function resultValue(
  row: typeof officialResult.$inferSelect,
  type: string,
): OfficialResultValue {
  if (type === "MATCH_SCORE" && row.homeScore !== null && row.awayScore !== null)
    return { type, homeScore: row.homeScore, awayScore: row.awayScore };
  if ((type === "CLOSEST_VALUE" || type === "EXACT_VALUE") && row.numericValue !== null)
    return { type, value: normalizeDecimal(row.numericValue) };
  if (type === "OPTIONS" && row.optionId !== null)
    return { type, optionId: row.optionId };
  throw new Error(`Official Result persistence is invalid: ${row.id}.`);
}

export function domainResult(
  row: typeof officialResult.$inferSelect,
  type: string,
): OfficialResult {
  return {
    id: row.id,
    questionId: row.questionId,
    value: resultValue(row, type),
    recordedAt: row.recordedAt,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}

export function domainJudgment(
  row: typeof openTextJudgment.$inferSelect,
): OpenTextJudgment {
  return {
    answerId: row.answerId,
    isCorrect: row.isCorrect,
    judgedAt: row.judgedAt,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}

function resultFields(value: OfficialResultValue) {
  const fields = {
    homeScore: null as number | null,
    awayScore: null as number | null,
    numericValue: null as string | null,
    optionId: null as string | null,
  };
  if (value.type === "MATCH_SCORE")
    return { ...fields, homeScore: value.homeScore, awayScore: value.awayScore };
  if (value.type === "CLOSEST_VALUE" || value.type === "EXACT_VALUE")
    return { ...fields, numericValue: value.value };
  return { ...fields, optionId: value.optionId };
}

function correctionFields(prefix: "before" | "after", value: OfficialResultValue) {
  const fields = resultFields(value);
  return prefix === "before"
    ? {
        beforeHomeScore: fields.homeScore,
        beforeAwayScore: fields.awayScore,
        beforeNumericValue: fields.numericValue,
        beforeOptionId: fields.optionId,
      }
    : {
        afterHomeScore: fields.homeScore,
        afterAwayScore: fields.awayScore,
        afterNumericValue: fields.numericValue,
        afterOptionId: fields.optionId,
      };
}

async function loadAggregate(
  database: typeof db,
  competitionId: string,
  roundId: string,
  userId: string,
) {
  const [scope] = await database
    .select({ round, competition, membership: competitionParticipant })
    .from(round)
    .innerJoin(competition, eq(competition.id, round.competitionId))
    .innerJoin(
      competitionParticipant,
      and(
        eq(competitionParticipant.competitionId, competition.id),
        eq(competitionParticipant.userId, userId),
        or(
          eq(competitionParticipant.isAdmin, true),
          eq(competitionParticipant.status, "ACTIVE"),
        ),
      ),
    )
    .where(
      and(
        eq(round.id, roundId),
        eq(round.competitionId, competitionId),
        sql`${round.status} <> 'DRAFT'`,
      ),
    )
    .limit(1);
  if (!scope) return null;
  const roundValue = persistedRound(scope.round);
  const questions = await loadQuestions(
    database,
    roundValue,
    scoringDefaults(scope.competition),
  );
  const participants = await database
    .select({
      id: competitionParticipant.id,
      userId: competitionParticipant.userId,
      name: user.name,
    })
    .from(competitionParticipant)
    .innerJoin(user, eq(user.id, competitionParticipant.userId))
    .where(
      and(
        eq(competitionParticipant.competitionId, competitionId),
        eq(competitionParticipant.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(user.name), asc(competitionParticipant.id));
  const questionIds = questions.map((item) => item.id);
  const answerRows = questionIds.length
    ? await database.select().from(answer).where(inArray(answer.questionId, questionIds))
    : [];
  const resultRows = questionIds.length
    ? await database
        .select()
        .from(officialResult)
        .where(inArray(officialResult.questionId, questionIds))
    : [];
  const judgmentRows = answerRows.length
    ? await database
        .select()
        .from(openTextJudgment)
        .where(
          inArray(
            openTextJudgment.answerId,
            answerRows.map((item) => item.id),
          ),
        )
    : [];
  const types = new Map(questions.map((item) => [item.id, item.type]));
  return {
    round: roundValue,
    questions,
    participants,
    answers: answerRows.map((item) => domainAnswer(item, types.get(item.questionId)!)),
    results: resultRows.map((item) => domainResult(item, types.get(item.questionId)!)),
    judgments: judgmentRows.map(domainJudgment),
    actorParticipantId: scope.membership.status === "ACTIVE" ? scope.membership.id : null,
    actorIsAdmin: scope.membership.isAdmin,
  } satisfies ResultRoundAggregate;
}

async function finishIfComplete(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  aggregate: ResultRoundAggregate,
  actorUserId: string,
  now: Date,
) {
  const complete = aggregate.questions.every((item) => {
    if (now.valueOf() < item.deadlineAt.valueOf()) return false;
    return isQuestionResultComplete({
      question: item,
      answers: aggregate.answers.filter((answer) => answer.questionId === item.id),
      result: aggregate.results.find((result) => result.questionId === item.id) ?? null,
      judgments: aggregate.judgments,
    });
  });
  const finished = finishRound(aggregate.round, complete, actorUserId, now);
  if (finished !== aggregate.round)
    await tx
      .update(round)
      .set({
        status: "FINISHED",
        finishedAt: finished.finishedAt,
        updatedAt: finished.updatedAt,
        updatedByUserId: actorUserId,
      })
      .where(and(eq(round.id, aggregate.round.id), eq(round.status, "ACTIVE")));
}

export function createResultRepository(database: typeof db): ResultRepository {
  return {
    getRound(competitionId, roundId, userId) {
      return loadAggregate(database, competitionId, roundId, userId);
    },
    async mutateResult(competitionId, roundId, questionId, userId, now, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select r.id from round r join competition_participant cp on cp.competition_id = r.competition_id and cp.user_id = ${userId} and cp.is_admin = true where r.id = ${roundId} and r.competition_id = ${competitionId} and r.status in ('ACTIVE', 'FINISHED') for update`,
        );
        if (!locked.length) return null;
        const txDb = tx as unknown as typeof db;
        const aggregate = await loadAggregate(txDb, competitionId, roundId, userId);
        if (!aggregate) return null;
        const target = aggregate.questions.find((item) => item.id === questionId);
        if (!target || target.type === "OPEN_TEXT") return null;
        const current =
          aggregate.results.find((item) => item.questionId === questionId) ?? null;
        const decision: ResultMutationDecision = operation({
          round: aggregate.round,
          question: target,
          current,
        });
        if (decision.kind === "record")
          await tx.insert(officialResult).values({
            id: decision.value.id,
            questionId,
            ...resultFields(decision.value.value),
            recordedByUserId: userId,
            updatedByUserId: userId,
            recordedAt: decision.value.recordedAt,
            updatedAt: decision.value.updatedAt,
          });
        if (decision.kind === "correct" && current) {
          await tx.insert(officialResultCorrectionEvent).values({
            id: randomUUID(),
            officialResultId: current.id,
            questionId,
            ...correctionFields("before", current.value),
            ...correctionFields("after", decision.value.value),
            actorUserId: userId,
            createdAt: now,
          });
          await tx
            .update(officialResult)
            .set({
              ...resultFields(decision.value.value),
              updatedByUserId: userId,
              updatedAt: now,
            })
            .where(
              and(
                eq(officialResult.id, current.id),
                eq(officialResult.questionId, questionId),
              ),
            );
        }
        const changed = await loadAggregate(txDb, competitionId, roundId, userId);
        if (!changed) throw new Error("Result aggregate disappeared.");
        await finishIfComplete(tx, changed, userId, now);
        return loadAggregate(txDb, competitionId, roundId, userId);
      });
    },
    async mutateJudgment(competitionId, roundId, answerId, userId, now, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select r.id from round r join competition_participant cp on cp.competition_id = r.competition_id and cp.user_id = ${userId} and cp.is_admin = true where r.id = ${roundId} and r.competition_id = ${competitionId} and r.status in ('ACTIVE', 'FINISHED') for update`,
        );
        if (!locked.length) return null;
        const txDb = tx as unknown as typeof db;
        const aggregate = await loadAggregate(txDb, competitionId, roundId, userId);
        if (!aggregate) return null;
        const targetAnswer = aggregate.answers.find((item) => item.id === answerId);
        const target = targetAnswer
          ? aggregate.questions.find((item) => item.id === targetAnswer.questionId)
          : null;
        if (!targetAnswer || !target || target.type !== "OPEN_TEXT") return null;
        const current =
          aggregate.judgments.find((item) => item.answerId === answerId) ?? null;
        const decision: JudgmentMutationDecision = operation({
          round: aggregate.round,
          question: target,
          answer: targetAnswer,
          current,
        });
        if (decision.kind === "record")
          await tx.insert(openTextJudgment).values({
            answerId,
            isCorrect: decision.value.isCorrect,
            judgedByUserId: userId,
            updatedByUserId: userId,
            judgedAt: decision.value.judgedAt,
            updatedAt: decision.value.updatedAt,
          });
        if (decision.kind === "correct" && current) {
          await tx.insert(openTextJudgmentCorrectionEvent).values({
            id: randomUUID(),
            answerId,
            beforeIsCorrect: current.isCorrect,
            afterIsCorrect: decision.value.isCorrect,
            actorUserId: userId,
            createdAt: now,
          });
          await tx
            .update(openTextJudgment)
            .set({
              isCorrect: decision.value.isCorrect,
              updatedByUserId: userId,
              updatedAt: now,
            })
            .where(eq(openTextJudgment.answerId, answerId));
        }
        const changed = await loadAggregate(txDb, competitionId, roundId, userId);
        if (!changed) throw new Error("Judgment aggregate disappeared.");
        await finishIfComplete(tx, changed, userId, now);
        return loadAggregate(txDb, competitionId, roundId, userId);
      });
    },
  };
}

export const resultRepository = createResultRepository(db);
