import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import type { PlayoffRepository } from "@/application/playoff/use-cases";
import type { Round } from "@/domain/round/round";
import { generatePlayoffPairings } from "@/domain/playoff/playoff";
import { effectiveRoundStatus } from "@/domain/scoring/lifecycle";
import { db } from "@/infrastructure/db/client";
import { transactionDatabase } from "@/infrastructure/db/transaction";
import { createH2HRepository } from "@/infrastructure/h2h/h2h-repository";
import { createStandingsRepository } from "@/infrastructure/standings/standings-repository";
import {
  competition,
  competitionParticipant,
  playoffMatchup,
  playoffMatchupResolutionEvent,
  playoffRound,
  playoffSeed,
  question,
  user,
} from "@/infrastructure/db/schema";
import {
  loadQuestions,
  saveQuestion,
  scoringDefaults,
} from "@/infrastructure/round/round-repository";

function domainRound(value: typeof playoffRound.$inferSelect): Round {
  if (value.unansweredPenalty !== -1 && value.unansweredPenalty !== 0)
    throw new Error("Invalid persisted playoff penalty.");
  return {
    id: value.id,
    competitionId: value.competitionId,
    sequence: value.sequence,
    name: value.name,
    startsAt: value.startsAt,
    status: value.status,
    unansweredPenalty: value.unansweredPenalty,
    publishedAt: value.publishedAt,
    finishedAt: value.finishedAt,
    finalizedAt: value.finalizedAt,
    createdByUserId: value.createdByUserId,
    updatedByUserId: value.updatedByUserId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

async function adminCompetition(
  database: typeof db,
  competitionId: string,
  userId: string,
) {
  const [value] = await database
    .select({ competition })
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
  return value?.competition ?? null;
}

export function createPlayoffRepository(database: typeof db): PlayoffRepository {
  const getCompetitionForAdmin: PlayoffRepository["getCompetitionForAdmin"] = async (
    competitionId,
    userId,
  ) => {
    const value = await adminCompetition(database, competitionId, userId);
    return value
      ? {
          id: value.id,
          type: value.type,
          status: value.status,
          scoringDefaults: scoringDefaults(value),
        }
      : null;
  };

  const getRound = async (roundId: string, userId: string) => {
    const [row] = await database
      .select({ value: playoffRound, competition })
      .from(playoffRound)
      .innerJoin(competition, eq(competition.id, playoffRound.competitionId))
      .innerJoin(
        competitionParticipant,
        and(
          eq(competitionParticipant.competitionId, competition.id),
          eq(competitionParticipant.userId, userId),
          eq(competitionParticipant.isAdmin, true),
        ),
      )
      .where(eq(playoffRound.id, roundId))
      .limit(1);
    if (!row) return null;
    const round = domainRound(row.value);
    return {
      round,
      advancementMode: row.value.advancementMode,
      tiebreakerQuestionId: row.value.tiebreakerQuestionId,
      competitionType: row.competition.type,
      competitionStatus: row.competition.status,
      scoringDefaults: scoringDefaults(row.competition),
      questions: await loadQuestions(
        database,
        round,
        scoringDefaults(row.competition),
        "PLAYOFF",
      ),
    };
  };

  const roundRepository = {
    getCompetitionForAdmin,
    async reorderQuestions(roundId: string, userId: string, ids: string[]) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select pr.id from playoff_round pr join competition_participant cp on cp.competition_id = pr.competition_id and cp.user_id = ${userId} and cp.is_admin = true where pr.id = ${roundId} and pr.status = 'DRAFT' for update`,
        );
        if (!locked.length) return false;
        const existing = await tx
          .select({ id: question.id })
          .from(question)
          .where(eq(question.playoffRoundId, roundId));
        if (
          existing.length !== ids.length ||
          ids.some((id) => !existing.some((item) => item.id === id))
        )
          return false;
        for (const [index, id] of ids.entries())
          await tx
            .update(question)
            .set({ sequence: -(index + 1) })
            .where(and(eq(question.id, id), eq(question.playoffRoundId, roundId)));
        for (const [index, id] of ids.entries())
          await tx
            .update(question)
            .set({ sequence: index + 1, updatedAt: new Date(), updatedByUserId: userId })
            .where(and(eq(question.id, id), eq(question.playoffRoundId, roundId)));
        return true;
      });
    },
    async mutateQuestion(
      roundId: string,
      userId: string,
      operation: Parameters<PlayoffRepository["roundRepository"]["mutateQuestion"]>[2],
    ) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select pr.id from playoff_round pr join competition c on c.id = pr.competition_id and c.status <> 'COMPLETED' join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where pr.id = ${roundId} and pr.status = 'DRAFT' for update`,
        );
        if (!locked.length) return null;
        const txRepository = createPlayoffRepository(transactionDatabase(tx));
        const aggregate = await txRepository.getRound(roundId, userId);
        if (!aggregate) return null;
        const write = operation(aggregate.round, aggregate.questions);
        if (write.kind === "remove") {
          if (aggregate.tiebreakerQuestionId === write.questionId) return null;
          const removed = await tx
            .delete(question)
            .where(
              and(
                eq(question.id, write.questionId),
                eq(question.playoffRoundId, roundId),
              ),
            )
            .returning({ id: question.id });
          return removed.length === 1
            ? (aggregate.questions.find((item) => item.id === write.questionId) ?? null)
            : null;
        }
        await saveQuestion(tx, write.value, write.isNew, "PLAYOFF");
        return write.value;
      });
    },
  } as PlayoffRepository["roundRepository"];

  return {
    getCompetitionForAdmin,
    roundRepository,
    getRound,
    async createRound(value, userId) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select c.id from competition c join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where c.id = ${value.round.competitionId} and c.status = 'STARTED' and c.type <> 'LEAGUE' for update`,
        );
        if (!locked.length) return false;
        const [roundCount] = await tx
          .select({ count: count() })
          .from(playoffRound)
          .where(eq(playoffRound.competitionId, value.round.competitionId));
        const [seedCount] = await tx
          .select({ count: count() })
          .from(playoffSeed)
          .where(eq(playoffSeed.competitionId, value.round.competitionId));
        const existingRounds = roundCount?.count ?? 0;
        const fieldSize = seedCount?.count ?? 0;
        const expectedRounds = fieldSize ? Math.log2(fieldSize) : 1;
        if (
          !Number.isInteger(expectedRounds) ||
          value.round.sequence !== existingRounds + 1 ||
          value.round.sequence > expectedRounds
        )
          return false;
        const inserted = await tx
          .insert(playoffRound)
          .values({
            ...value.round,
            advancementMode: value.advancementMode,
            tiebreakerQuestionId: value.tiebreakerQuestionId,
          })
          .onConflictDoNothing()
          .returning({ id: playoffRound.id });
        return inserted.length === 1;
      });
    },
    async updateRound(value, userId) {
      const updated = await database
        .update(playoffRound)
        .set({
          sequence: value.round.sequence,
          name: value.round.name,
          startsAt: value.round.startsAt,
          unansweredPenalty: value.round.unansweredPenalty,
          advancementMode: value.advancementMode,
          tiebreakerQuestionId: value.tiebreakerQuestionId,
          updatedAt: value.round.updatedAt,
          updatedByUserId: userId,
        })
        .where(
          and(
            eq(playoffRound.id, value.round.id),
            eq(playoffRound.status, "DRAFT"),
            sql`exists (select 1 from competition_participant cp where cp.competition_id = ${playoffRound.competitionId} and cp.user_id = ${userId} and cp.is_admin = true)`,
          ),
        )
        .returning({ id: playoffRound.id });
      return updated.length === 1;
    },
    async snapshotBracket(input, verify) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select pr.id from playoff_round pr join competition c on c.id = pr.competition_id and c.status = 'STARTED' join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${input.userId} and cp.is_admin = true where pr.id = ${input.playoffRoundId} and pr.competition_id = ${input.competitionId} and pr.sequence = 1 and pr.status = 'DRAFT' and c.type <> 'LEAGUE' for update`,
        );
        if (!locked.length) return false;
        const txDb = transactionDatabase(tx);
        const decision = await verify({
          h2hRepository: createH2HRepository(txDb),
          standingsRepository: createStandingsRepository(txDb),
        });
        if (!decision) return false;
        const existing = await tx
          .select()
          .from(playoffSeed)
          .where(eq(playoffSeed.competitionId, input.competitionId))
          .orderBy(asc(playoffSeed.seed));
        if (existing.length)
          return (
            existing.length === decision.orderedParticipantIds.length &&
            existing.every(
              (item, index) =>
                item.participantId === decision.orderedParticipantIds[index] &&
                item.sourceFingerprint === decision.sourceFingerprint,
            )
          );
        const members = await tx
          .select({ id: competitionParticipant.id })
          .from(competitionParticipant)
          .where(
            and(
              eq(competitionParticipant.competitionId, input.competitionId),
              eq(competitionParticipant.status, "ACTIVE"),
              inArray(competitionParticipant.id, [...decision.orderedParticipantIds]),
            ),
          );
        if (members.length !== decision.orderedParticipantIds.length) return false;
        const seeds = decision.orderedParticipantIds.map((participantId, index) => ({
          competitionId: input.competitionId,
          participantId,
          seed: index + 1,
          sourceFingerprint: decision.sourceFingerprint,
          createdByUserId: input.userId,
          createdAt: input.now,
        }));
        await tx.insert(playoffSeed).values(seeds);
        await tx.insert(playoffMatchup).values(
          generatePlayoffPairings(seeds).map((item) => ({
            id: crypto.randomUUID(),
            competitionId: input.competitionId,
            playoffRoundId: input.playoffRoundId,
            position: item.position,
            participantAId: item.participantAId,
            participantBId: item.participantBId,
            createdAt: input.now,
            updatedAt: input.now,
          })),
        );
        return true;
      });
    },
    async publish(competitionId, roundId, userId, now) {
      return database.transaction(async (tx) => {
        const txRepository = createPlayoffRepository(transactionDatabase(tx));
        const value = await txRepository.getRound(roundId, userId);
        if (
          !value ||
          value.round.competitionId !== competitionId ||
          value.competitionStatus !== "STARTED" ||
          value.round.status !== "DRAFT" ||
          value.questions.length === 0
        )
          return false;
        if (value.questions.some((item) => item.deadlineAt <= now)) return false;
        if (
          value.advancementMode === "TIEBREAKER_QUESTION" &&
          !value.questions.some((item) => item.id === value.tiebreakerQuestionId)
        )
          return false;
        const matchups = await tx
          .select({ count: count() })
          .from(playoffMatchup)
          .where(eq(playoffMatchup.playoffRoundId, roundId));
        if ((matchups[0]?.count ?? 0) === 0) return false;
        if (value.round.sequence > 1) {
          const [previous] = await tx
            .select()
            .from(playoffRound)
            .where(
              and(
                eq(playoffRound.competitionId, value.round.competitionId),
                eq(playoffRound.sequence, value.round.sequence - 1),
              ),
            )
            .limit(1);
          if (!previous || previous.status !== "FINALIZED") return false;
          const unresolved = await tx
            .select({ count: count() })
            .from(playoffMatchup)
            .where(
              and(
                eq(playoffMatchup.playoffRoundId, previous.id),
                sql`${playoffMatchup.winnerParticipantId} is null`,
              ),
            );
          if ((unresolved[0]?.count ?? 0) > 0) return false;
        }
        const updated = await tx
          .update(playoffRound)
          .set({
            status: "ACTIVE",
            publishedAt: now,
            updatedAt: now,
            updatedByUserId: userId,
          })
          .where(and(eq(playoffRound.id, roundId), eq(playoffRound.status, "DRAFT")))
          .returning({ id: playoffRound.id });
        return updated.length === 1;
      });
    },
    async persistManualWinner(input) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select pm.id from playoff_matchup pm join playoff_round pr on pr.id = pm.playoff_round_id join competition c on c.id = pr.competition_id and c.status = 'STARTED' join competition_participant cp on cp.competition_id = pr.competition_id and cp.user_id = ${input.userId} and cp.is_admin = true where pm.id = ${input.matchupId} and pm.playoff_round_id = ${input.playoffRoundId} and pm.competition_id = ${input.competitionId} and pr.status in ('FINISHED', 'FINALIZED') and ${input.participantId} in (pm.participant_a_id, pm.participant_b_id) for update`,
        );
        if (!locked.length) return false;
        const [currentRound] = await tx
          .select({ sequence: playoffRound.sequence })
          .from(playoffRound)
          .where(eq(playoffRound.id, input.playoffRoundId))
          .limit(1);
        if (!currentRound) return false;
        const publishedDownstream = await tx
          .select({ count: count() })
          .from(playoffRound)
          .where(
            and(
              eq(playoffRound.competitionId, input.competitionId),
              sql`${playoffRound.sequence} > ${currentRound.sequence}`,
              sql`${playoffRound.status} <> 'DRAFT'`,
            ),
          );
        if ((publishedDownstream[0]?.count ?? 0) > 0) return false;
        const [before] = await tx
          .select()
          .from(playoffMatchup)
          .where(eq(playoffMatchup.id, input.matchupId))
          .limit(1);
        if (!before) return false;
        const updated = await tx
          .update(playoffMatchup)
          .set({
            winnerParticipantId: input.participantId,
            winnerDecidedBy: "MANUAL",
            sourceFingerprint: input.sourceFingerprint,
            resolvedAt: input.now,
            resolvedByUserId: input.userId,
            updatedAt: input.now,
          })
          .where(eq(playoffMatchup.id, input.matchupId))
          .returning({ id: playoffMatchup.id });
        if (updated.length === 1 && before.winnerParticipantId !== input.participantId)
          await tx.insert(playoffMatchupResolutionEvent).values({
            id: crypto.randomUUID(),
            matchupId: input.matchupId,
            competitionId: input.competitionId,
            action: before.winnerParticipantId ? "CORRECTED" : "RESOLVED",
            beforeWinnerParticipantId: before.winnerParticipantId,
            afterWinnerParticipantId: input.participantId,
            sourceFingerprint: input.sourceFingerprint,
            actorUserId: input.userId,
            createdAt: input.now,
          });
        if (updated.length === 1 && before.winnerParticipantId !== input.participantId) {
          const [next] = await tx
            .select({ id: playoffRound.id })
            .from(playoffRound)
            .where(
              and(
                eq(playoffRound.competitionId, input.competitionId),
                eq(playoffRound.sequence, currentRound.sequence + 1),
                eq(playoffRound.status, "DRAFT"),
              ),
            )
            .limit(1);
          if (next) {
            const winners = await tx
              .select({ participantId: playoffMatchup.winnerParticipantId })
              .from(playoffMatchup)
              .where(eq(playoffMatchup.playoffRoundId, input.playoffRoundId));
            if (winners.every((item) => item.participantId !== null)) {
              const seedRows = await tx
                .select()
                .from(playoffSeed)
                .where(eq(playoffSeed.competitionId, input.competitionId));
              const seedByParticipant = new Map(
                seedRows.map((item) => [item.participantId, item.seed]),
              );
              const remaining = winners
                .map((item) => ({
                  participantId: item.participantId!,
                  seed: seedByParticipant.get(item.participantId!) ?? 0,
                }))
                .sort((left, right) => left.seed - right.seed);
              if (remaining.some((item) => item.seed === 0)) return false;
              generatePlayoffPairings(
                remaining.map((item, index) => ({ ...item, seed: index + 1 })),
              );
              await tx
                .delete(playoffMatchup)
                .where(eq(playoffMatchup.playoffRoundId, next.id));
              await tx.insert(playoffMatchup).values(
                Array.from({ length: remaining.length / 2 }, (_, index) => ({
                  id: crypto.randomUUID(),
                  competitionId: input.competitionId,
                  playoffRoundId: next.id,
                  position: index + 1,
                  participantAId: remaining[index]!.participantId,
                  participantBId: remaining[remaining.length - 1 - index]!.participantId,
                  createdAt: input.now,
                  updatedAt: input.now,
                })),
              );
            }
          }
        }
        return updated.length === 1;
      });
    },
    async persistAdvancement(input) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select pr.id, pr.sequence from playoff_round pr join competition c on c.id = pr.competition_id and c.status = 'STARTED' join competition_participant cp on cp.competition_id = pr.competition_id and cp.user_id = ${input.userId} and cp.is_admin = true where pr.id = ${input.playoffRoundId} and pr.competition_id = ${input.competitionId} and pr.status = 'FINISHED' and pr.finished_at + interval '24 hours' <= ${input.now.toISOString()}::timestamptz for update`,
        );
        if (!locked.length) return false;
        const [current] = await tx
          .select()
          .from(playoffRound)
          .where(eq(playoffRound.id, input.playoffRoundId))
          .limit(1);
        if (!current) return false;
        const rows = await tx
          .select()
          .from(playoffMatchup)
          .where(eq(playoffMatchup.playoffRoundId, input.playoffRoundId))
          .orderBy(asc(playoffMatchup.position));
        if (rows.length !== input.winners.length) return false;
        const validatedWinners = input.winners.map((winner) => {
          const row = rows.find((item) => item.id === winner.matchupId);
          if (
            !row ||
            ![row.participantAId, row.participantBId].includes(winner.participantId)
          )
            return false;
          return { row, winner };
        });
        if (validatedWinners.some((item) => item === false)) return false;

        let nextRoundId: string | null = null;
        let nextRoundAlreadyGenerated = false;
        let originalPairings: Array<{
          a: { participantId: string; seed: number };
          b: { participantId: string; seed: number };
        }> = [];
        if (input.winners.length > 1) {
          const [next] = await tx
            .select()
            .from(playoffRound)
            .where(
              and(
                eq(playoffRound.competitionId, input.competitionId),
                eq(playoffRound.sequence, current.sequence + 1),
                eq(playoffRound.status, "DRAFT"),
              ),
            )
            .limit(1);
          if (!next) return false;
          nextRoundId = next.id;
          const existing = await tx
            .select({ count: count() })
            .from(playoffMatchup)
            .where(eq(playoffMatchup.playoffRoundId, next.id));
          nextRoundAlreadyGenerated = (existing[0]?.count ?? 0) > 0;
          if (!nextRoundAlreadyGenerated) {
            const seedRows = await tx
              .select()
              .from(playoffSeed)
              .where(eq(playoffSeed.competitionId, input.competitionId));
            const seedByParticipant = new Map(
              seedRows.map((item) => [item.participantId, item.seed]),
            );
            const remaining = input.winners
              .map((item) => ({
                participantId: item.participantId,
                seed: seedByParticipant.get(item.participantId) ?? 0,
              }))
              .sort((left, right) => left.seed - right.seed);
            if (remaining.some((item) => item.seed === 0)) return false;
            generatePlayoffPairings(
              remaining.map((item, index) => ({ ...item, seed: index + 1 })),
            );
            originalPairings = Array.from(
              { length: remaining.length / 2 },
              (_, index) => ({
                a: remaining[index]!,
                b: remaining[remaining.length - 1 - index]!,
              }),
            );
          }
        }

        for (const item of validatedWinners) {
          if (!item) return false;
          const { row, winner } = item;
          await tx
            .update(playoffMatchup)
            .set({
              winnerParticipantId: winner.participantId,
              winnerDecidedBy: winner.decidedBy,
              sourceFingerprint: input.sourceFingerprint,
              resolvedAt: input.now,
              resolvedByUserId:
                winner.decidedBy === "MANUAL" ? row.resolvedByUserId : input.userId,
              updatedAt: input.now,
            })
            .where(eq(playoffMatchup.id, row.id));
          if (row.winnerParticipantId !== winner.participantId)
            await tx.insert(playoffMatchupResolutionEvent).values({
              id: crypto.randomUUID(),
              matchupId: row.id,
              competitionId: input.competitionId,
              action: row.winnerParticipantId ? "CORRECTED" : "RESOLVED",
              beforeWinnerParticipantId: row.winnerParticipantId,
              afterWinnerParticipantId: winner.participantId,
              sourceFingerprint: input.sourceFingerprint,
              actorUserId: input.userId,
              createdAt: input.now,
            });
        }
        if (input.winners.length > 1 && !nextRoundAlreadyGenerated)
          await tx.insert(playoffMatchup).values(
            originalPairings.map((item, index) => ({
              id: crypto.randomUUID(),
              competitionId: input.competitionId,
              playoffRoundId: nextRoundId!,
              position: index + 1,
              participantAId: item.a.participantId,
              participantBId: item.b.participantId,
              createdAt: input.now,
              updatedAt: input.now,
            })),
          );
        await tx
          .update(playoffRound)
          .set({
            status: "FINALIZED",
            finalizedAt: input.now,
            updatedAt: input.now,
            updatedByUserId: input.userId,
          })
          .where(eq(playoffRound.id, input.playoffRoundId));
        return true;
      });
    },
    async getOverview(competitionId, userId, now) {
      const [header] = await database
        .select({
          competition,
          participantId: competitionParticipant.id,
          isAdmin: competitionParticipant.isAdmin,
        })
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
      if (!header || header.competition.type === "LEAGUE") return null;
      const [seedRows, roundRows, matchupRows, questionRows] = await Promise.all([
        database
          .select()
          .from(playoffSeed)
          .where(eq(playoffSeed.competitionId, competitionId))
          .orderBy(asc(playoffSeed.seed)),
        database
          .select()
          .from(playoffRound)
          .where(eq(playoffRound.competitionId, competitionId))
          .orderBy(asc(playoffRound.sequence)),
        database
          .select()
          .from(playoffMatchup)
          .where(eq(playoffMatchup.competitionId, competitionId))
          .orderBy(asc(playoffMatchup.position)),
        database
          .select({ parentId: question.playoffRoundId, count: count() })
          .from(question)
          .where(sql`${question.playoffRoundId} is not null`)
          .groupBy(question.playoffRoundId),
      ]);
      const participantIds = [...new Set(seedRows.map((item) => item.participantId))];
      const participants = participantIds.length
        ? await database
            .select({ id: competitionParticipant.id, name: user.name })
            .from(competitionParticipant)
            .innerJoin(user, eq(user.id, competitionParticipant.userId))
            .where(inArray(competitionParticipant.id, participantIds))
        : [];
      const names = new Map(participants.map((item) => [item.id, item.name]));
      const seeds = new Map(seedRows.map((item) => [item.participantId, item.seed]));
      const rounds = roundRows.map((item) => ({
        id: item.id,
        sequence: item.sequence,
        name: item.name,
        startsAt: item.startsAt.toISOString(),
        status: effectiveRoundStatus(domainRound(item), now),
        advancementConfirmed: item.status === "FINALIZED",
        advancementMode: item.advancementMode,
        tiebreakerQuestionId: item.tiebreakerQuestionId,
        questionCount: questionRows.find((row) => row.parentId === item.id)?.count ?? 0,
        matchups: matchupRows
          .filter((matchup) => matchup.playoffRoundId === item.id)
          .map((matchup) => ({
            id: matchup.id,
            position: matchup.position,
            participantAId: matchup.participantAId,
            participantAName: names.get(matchup.participantAId) ?? "Participante",
            participantASeed: seeds.get(matchup.participantAId) ?? 0,
            participantBId: matchup.participantBId,
            participantBName: names.get(matchup.participantBId) ?? "Participante",
            participantBSeed: seeds.get(matchup.participantBId) ?? 0,
            winnerParticipantId: matchup.winnerParticipantId,
            winnerDecidedBy: matchup.winnerDecidedBy,
          })),
      }));
      const final = rounds.at(-1);
      const championId =
        final?.advancementConfirmed && final.matchups.length === 1
          ? final.matchups[0]?.winnerParticipantId
          : null;
      return {
        competition: {
          id: header.competition.id,
          name: header.competition.name,
          type: header.competition.type,
          status: header.competition.status,
        },
        actorIsAdmin: header.isAdmin,
        currentParticipantId: header.participantId,
        seeds: seedRows.map((item) => ({
          participantId: item.participantId,
          name: names.get(item.participantId) ?? "Participante",
          seed: item.seed,
        })),
        rounds,
        champion: championId
          ? { participantId: championId, name: names.get(championId) ?? "Participante" }
          : null,
      };
    },
  };
}

export const playoffRepository = createPlayoffRepository(db);
