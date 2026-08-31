import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type {
  AnswerRepository,
  ParticipantRoundAggregate,
} from "@/application/answer/use-cases";
import { normalizeDecimal, type Answer, type AnswerValue } from "@/domain/answer/answer";
import type { Round } from "@/domain/round/round";
import { db } from "@/infrastructure/db/client";
import { transactionDatabase } from "@/infrastructure/db/transaction";
import {
  answer,
  competition,
  competitionParticipant,
  question,
  round,
} from "@/infrastructure/db/schema";
import { loadQuestions, scoringDefaults } from "@/infrastructure/round/round-repository";
import { loadRestrictedParticipantIds } from "@/infrastructure/payment/payment-eligibility";

function persistedRound(value: typeof round.$inferSelect): Round {
  if (value.unansweredPenalty !== -1 && value.unansweredPenalty !== 0)
    throw new Error("Invalid persisted penalty.");
  return { ...value, unansweredPenalty: value.unansweredPenalty };
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
export function answerFields(value: Answer) {
  const base = {
    homeScore: null as number | null,
    awayScore: null as number | null,
    numericValue: null as string | null,
    optionId: null as string | null,
    textValue: null as string | null,
    updatedAt: value.updatedAt,
  };
  if (value.value.type === "MATCH_SCORE")
    return {
      ...base,
      homeScore: value.value.homeScore,
      awayScore: value.value.awayScore,
    };
  if (value.value.type === "CLOSEST_VALUE" || value.value.type === "EXACT_VALUE")
    return { ...base, numericValue: value.value.value };
  if (value.value.type === "OPTIONS") return { ...base, optionId: value.value.optionId };
  return { ...base, textValue: value.value.value };
}

export function createAnswerRepository(database: typeof db): AnswerRepository {
  return {
    async listPublished(competitionId, userId) {
      const [membership] = await database
        .select({ id: competitionParticipant.id })
        .from(competitionParticipant)
        .where(
          and(
            eq(competitionParticipant.competitionId, competitionId),
            eq(competitionParticipant.userId, userId),
            eq(competitionParticipant.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (!membership) return null;
      const rows = await database
        .select({ value: round, questionCount: count(question.id) })
        .from(round)
        .leftJoin(question, eq(question.roundId, round.id))
        .where(and(eq(round.competitionId, competitionId), ne(round.status, "DRAFT")))
        .groupBy(round.id)
        .orderBy(asc(round.sequence));
      const ids = rows.map(({ value }) => value.id);
      const answered = ids.length
        ? await database
            .select({ roundId: question.roundId, count: count(answer.id) })
            .from(answer)
            .innerJoin(question, eq(question.id, answer.questionId))
            .where(
              and(
                eq(answer.participantId, membership.id),
                inArray(question.roundId, ids),
              ),
            )
            .groupBy(question.roundId)
        : [];
      return rows.map(({ value, questionCount }) => ({
        id: value.id,
        sequence: value.sequence,
        name: value.name,
        status: value.status,
        questionCount,
        answeredCount: answered.find((item) => item.roundId === value.id)?.count ?? 0,
      }));
    },
    async getMine(competitionId, roundId, userId) {
      const [row] = await database
        .select({ round, participantId: competitionParticipant.id, competition })
        .from(round)
        .innerJoin(competition, eq(competition.id, round.competitionId))
        .innerJoin(
          competitionParticipant,
          and(
            eq(competitionParticipant.competitionId, competition.id),
            eq(competitionParticipant.userId, userId),
            eq(competitionParticipant.status, "ACTIVE"),
          ),
        )
        .where(
          and(
            eq(round.id, roundId),
            eq(round.competitionId, competitionId),
            ne(round.status, "DRAFT"),
          ),
        )
        .limit(1);
      if (!row) return null;
      const roundValue = persistedRound(row.round);
      const questions = await loadQuestions(
        database,
        roundValue,
        scoringDefaults(row.competition),
      );
      const types = new Map(questions.map((item) => [item.id, item.type]));
      const rows = questions.length
        ? await database
            .select()
            .from(answer)
            .where(
              and(
                eq(answer.participantId, row.participantId),
                inArray(
                  answer.questionId,
                  questions.map((item) => item.id),
                ),
              ),
            )
        : [];
      const restricted = (
        await loadRestrictedParticipantIds(database, competitionId, [row.participantId])
      ).has(row.participantId);
      return {
        round: roundValue,
        participantId: row.participantId,
        questions,
        answers: rows.map((item) => domainAnswer(item, types.get(item.questionId)!)),
        restricted,
      } satisfies ParticipantRoundAggregate;
    },
    async mutate(competitionId, roundId, questionId, userId, now, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select r.id from round r join competition_participant cp on cp.competition_id = r.competition_id and cp.user_id = ${userId} and cp.status = 'ACTIVE' where r.id = ${roundId} and r.competition_id = ${competitionId} and r.status = 'ACTIVE' for update`,
        );
        if (!locked.length) return null;
        const aggregate = await createAnswerRepository(transactionDatabase(tx)).getMine(
          competitionId,
          roundId,
          userId,
        );
        if (!aggregate) return null;
        const item = aggregate.questions.find((entry) => entry.id === questionId);
        if (!item) return null;
        const current =
          aggregate.answers.find((entry) => entry.questionId === questionId) ?? null;
        const value = operation({
          participantId: aggregate.participantId,
          round: aggregate.round,
          question: item,
          current,
          restricted: aggregate.restricted,
        });
        if (!current)
          await tx.insert(answer).values({
            id: value.id,
            questionId: value.questionId,
            participantId: value.participantId,
            submittedAt: value.submittedAt,
            ...answerFields(value),
          });
        else
          await tx
            .update(answer)
            .set(answerFields(value))
            .where(
              and(
                eq(answer.id, current.id),
                eq(answer.participantId, aggregate.participantId),
              ),
            );
        return value;
      });
    },
  };
}

export const answerRepository = createAnswerRepository(db);
