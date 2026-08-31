import { and, eq, inArray, sql } from "drizzle-orm";
import type {
  AnswerRepository,
  ParticipantRoundAggregate,
} from "@/application/answer/use-cases";
import type { Answer } from "@/domain/answer/answer";
import type { Round } from "@/domain/round/round";
import { answerFields, domainAnswer } from "@/infrastructure/answer/answer-repository";
import { db } from "@/infrastructure/db/client";
import { transactionDatabase } from "@/infrastructure/db/transaction";
import {
  answer,
  competition,
  competitionParticipant,
  playoffMatchup,
  playoffRound,
} from "@/infrastructure/db/schema";
import { loadRestrictedParticipantIds } from "@/infrastructure/payment/payment-eligibility";
import { loadQuestions, scoringDefaults } from "@/infrastructure/round/round-repository";

function asRound(value: typeof playoffRound.$inferSelect): Round {
  if (value.unansweredPenalty !== -1 && value.unansweredPenalty !== 0)
    throw new Error("Invalid penalty.");
  return { ...value, unansweredPenalty: value.unansweredPenalty };
}

export function createPlayoffAnswerRepository(database: typeof db): AnswerRepository {
  return {
    async listPublished() {
      return [];
    },
    async getMine(competitionId, roundId, userId) {
      const [row] = await database
        .select({
          round: playoffRound,
          participantId: competitionParticipant.id,
          competition,
        })
        .from(playoffRound)
        .innerJoin(competition, eq(competition.id, playoffRound.competitionId))
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
            eq(playoffRound.id, roundId),
            eq(playoffRound.competitionId, competitionId),
            sql`${playoffRound.status} <> 'DRAFT'`,
            sql`exists (select 1 from playoff_matchup pm where pm.playoff_round_id = ${playoffRound.id} and (${playoffMatchup.participantAId} = ${competitionParticipant.id} or ${playoffMatchup.participantBId} = ${competitionParticipant.id}))`,
          ),
        )
        .limit(1);
      if (!row) return null;
      const round = asRound(row.round);
      const questions = await loadQuestions(
        database,
        round,
        scoringDefaults(row.competition),
        "PLAYOFF",
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
        round,
        participantId: row.participantId,
        questions,
        answers: rows.map((item) => domainAnswer(item, types.get(item.questionId)!)),
        restricted,
      } satisfies ParticipantRoundAggregate;
    },
    async mutate(competitionId, roundId, questionId, userId, now, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select pr.id from playoff_round pr join competition_participant cp on cp.competition_id = pr.competition_id and cp.user_id = ${userId} and cp.status = 'ACTIVE' where pr.id = ${roundId} and pr.competition_id = ${competitionId} and pr.status = 'ACTIVE' and exists (select 1 from playoff_matchup pm where pm.playoff_round_id = pr.id and (pm.participant_a_id = cp.id or pm.participant_b_id = cp.id)) for update`,
        );
        if (!locked.length) return null;
        const aggregate = await createPlayoffAnswerRepository(
          transactionDatabase(tx),
        ).getMine(competitionId, roundId, userId);
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
        return value as Answer;
      });
    },
  };
}

export const playoffAnswerRepository = createPlayoffAnswerRepository(db);
