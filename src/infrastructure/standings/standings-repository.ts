import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type {
  StandingsAggregate,
  StandingsRepository,
} from "@/application/standings/use-cases";
import { db } from "@/infrastructure/db/client";
import {
  answer,
  competition,
  competitionParticipant,
  manualRankingResolution,
  manualRankingResolutionEntry,
  playoffSeed,
  officialResult,
  openTextJudgment,
  round,
  user,
} from "@/infrastructure/db/schema";
import { loadQuestions, scoringDefaults } from "@/infrastructure/round/round-repository";
import { loadRestrictedParticipantIds } from "@/infrastructure/payment/payment-eligibility";
import {
  domainAnswer,
  domainJudgment,
  domainResult,
  persistedRound,
} from "@/infrastructure/scoring/result-repository";

async function loadAggregate(
  database: typeof db,
  competitionId: string,
  userId: string,
): Promise<StandingsAggregate | null> {
  const [scope] = await database
    .select({ competition, membership: competitionParticipant })
    .from(competition)
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
    .where(eq(competition.id, competitionId))
    .limit(1);
  if (!scope) return null;

  const [roundRows, participants, resolutionRows] = await Promise.all([
    database
      .select()
      .from(round)
      .where(eq(round.competitionId, competitionId))
      .orderBy(asc(round.sequence)),
    database
      .select({
        id: competitionParticipant.id,
        name: user.name,
        email: user.email,
      })
      .from(competitionParticipant)
      .innerJoin(user, eq(user.id, competitionParticipant.userId))
      .where(
        and(
          eq(competitionParticipant.competitionId, competitionId),
          eq(competitionParticipant.status, "ACTIVE"),
        ),
      )
      .orderBy(asc(competitionParticipant.id)),
    database
      .select()
      .from(manualRankingResolution)
      .where(eq(manualRankingResolution.competitionId, competitionId))
      .orderBy(asc(manualRankingResolution.revision)),
  ]);
  const rounds = roundRows.map(persistedRound);
  const questionGroups = await Promise.all(
    rounds.map((item) =>
      loadQuestions(database, item, scoringDefaults(scope.competition)),
    ),
  );
  const questions = questionGroups.flat();
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
  const entryRows = resolutionRows.length
    ? await database
        .select()
        .from(manualRankingResolutionEntry)
        .where(
          inArray(
            manualRankingResolutionEntry.resolutionId,
            resolutionRows.map((item) => item.id),
          ),
        )
        .orderBy(
          asc(manualRankingResolutionEntry.resolutionId),
          asc(manualRankingResolutionEntry.position),
        )
    : [];
  const types = new Map(questions.map((item) => [item.id, item.type]));
  const answers = answerRows.map((item) =>
    domainAnswer(item, types.get(item.questionId)!),
  );
  const results = resultRows.map((item) =>
    domainResult(item, types.get(item.questionId)!),
  );
  const judgments = judgmentRows.map(domainJudgment);
  const restrictedParticipantIds = await loadRestrictedParticipantIds(
    database,
    competitionId,
    participants.map((item) => item.id),
  );
  return {
    competition: {
      id: scope.competition.id,
      name: scope.competition.name,
      type: scope.competition.type,
      status: scope.competition.status,
    },
    participants,
    rounds: rounds.map((roundValue, index) => {
      const roundQuestions = questionGroups[index] ?? [];
      const ids = new Set(roundQuestions.map((item) => item.id));
      const roundAnswers = answers.filter((item) => ids.has(item.questionId));
      const answerIds = new Set(roundAnswers.map((item) => item.id));
      return {
        round: roundValue,
        questions: roundQuestions,
        answers: roundAnswers,
        results: results.filter((item) => ids.has(item.questionId)),
        judgments: judgments.filter((item) => answerIds.has(item.answerId)),
      };
    }),
    resolutions: resolutionRows.map((item) => ({
      id: item.id,
      scope: item.scope,
      roundId: item.roundId,
      groupId: item.groupId,
      sourceFingerprint: item.sourceFingerprint,
      tieFingerprint: item.tieFingerprint,
      revision: item.revision,
      participantIds: entryRows
        .filter((entry) => entry.resolutionId === item.id)
        .sort((left, right) => left.position - right.position)
        .map((entry) => entry.participantId),
    })),
    actorIsAdmin: scope.membership.isAdmin,
    restrictedParticipantIds,
  };
}

export function createStandingsRepository(database: typeof db): StandingsRepository {
  return {
    getCompetition(competitionId, userId) {
      return loadAggregate(database, competitionId, userId);
    },
    async resolve(competitionId, userId, _now, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select c.id from competition c join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where c.id = ${competitionId} for update`,
        );
        if (!locked.length) return null;
        const txDb = tx as unknown as typeof db;
        const aggregate = await loadAggregate(txDb, competitionId, userId);
        if (!aggregate) return null;
        const decision = operation(aggregate);
        if (
          (decision.scope === "H2H_PHASE" || decision.scope === "GROUP_STANDINGS") &&
          (
            await tx
              .select({ id: playoffSeed.participantId })
              .from(playoffSeed)
              .where(eq(playoffSeed.competitionId, competitionId))
              .limit(1)
          ).length
        )
          return null;
        await tx.insert(manualRankingResolution).values({
          id: decision.id,
          competitionId: decision.competitionId,
          scope: decision.scope,
          roundId: decision.roundId,
          groupId: decision.groupId,
          sourceFingerprint: decision.sourceFingerprint,
          tieFingerprint: decision.tieFingerprint,
          revision: decision.revision,
          supersedesResolutionId: decision.supersedesResolutionId,
          action: decision.action,
          actorUserId: decision.actorUserId,
          createdAt: decision.createdAt,
        });
        await tx.insert(manualRankingResolutionEntry).values(
          decision.participantIds.map((participantId, index) => ({
            resolutionId: decision.id,
            participantId,
            position: index + 1,
          })),
        );
        return loadAggregate(txDb, competitionId, userId);
      });
    },
  };
}

export const standingsRepository = createStandingsRepository(db);
