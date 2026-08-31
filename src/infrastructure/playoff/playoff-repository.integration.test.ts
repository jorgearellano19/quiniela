import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRound } from "@/domain/round/round";
import {
  competition,
  competitionParticipant,
  playoffMatchup,
  playoffRound,
  playoffSeed,
  question,
} from "@/infrastructure/db/schema";
import { createCompetitionRepository } from "@/infrastructure/competition/competition-repository";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createPlayoffRepository } from "./playoff-repository";

const { client, database } = createIntegrationDatabase();
const repository = createPlayoffRepository(database);
const competitionRepository = createCompetitionRepository(database);
const data = new IntegrationTestData(database);
const adminId = "m10-playoff-admin";

describe("playoff persistence", () => {
  const verifySeeds =
    (orderedParticipantIds: readonly string[], sourceFingerprint: string) =>
    async () => ({ orderedParticipantIds, sourceFingerprint });
  beforeEach(async () =>
    data.createUser({ id: adminId, email: "m10-playoff-admin@example.test" }),
  );
  afterEach(async () => data.cleanup());
  afterAll(async () => client.end());

  async function fixture() {
    const value = data.competitionValue({ creatorId: adminId, type: "LEAGUE_PLAYOFFS" });
    await competitionRepository.createWithAdmin(value, randomUUID());
    const participants = [adminId];
    const memberUserIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const member = await data.createUser({ email: `m10-member-${index}@example.test` });
      const membership = await data.createMembership({
        competitionId: value.id,
        userId: member.id,
        status: "ACTIVE",
        statusChangedAt: new Date(),
        updatedByUserId: adminId,
      });
      memberUserIds.push(member.id);
      participants.push(membership.id);
    }
    const [adminMembership] = await database.query.competitionParticipant.findMany({
      where: (table, { and, eq }) =>
        and(eq(table.competitionId, value.id), eq(table.userId, adminId)),
      limit: 1,
    });
    participants[0] = adminMembership!.id;
    await database
      .update(competition)
      .set({ status: "STARTED", startedAt: new Date() })
      .where(eq(competition.id, value.id));
    const round = createRound({
      id: randomUUID(),
      competitionId: value.id,
      sequence: 1,
      name: "Semifinal",
      startsAt: new Date(Date.now() + 86_400_000),
      actorUserId: adminId,
    });
    expect(
      await repository.createRound(
        { round, advancementMode: "BEST_SEED", tiebreakerQuestionId: null },
        adminId,
      ),
    ).toBe(true);
    return {
      competitionId: value.id,
      roundId: round.id,
      participants,
      memberUserIds,
    };
  }

  it("snapshots seeds and bracket atomically and idempotently", async () => {
    const value = await fixture();
    const input = {
      competitionId: value.competitionId,
      playoffRoundId: value.roundId,
      userId: adminId,
      now: new Date(),
    };
    const verify = verifySeeds(value.participants, "a".repeat(64));
    expect(await repository.snapshotBracket(input, verify)).toBe(true);
    expect(await repository.snapshotBracket(input, verify)).toBe(true);
    expect(
      await database
        .select()
        .from(playoffSeed)
        .where(eq(playoffSeed.competitionId, value.competitionId)),
    ).toHaveLength(4);
    expect(
      await database
        .select()
        .from(playoffMatchup)
        .where(eq(playoffMatchup.playoffRoundId, value.roundId)),
    ).toHaveLength(2);
  });

  it("rolls back bracket creation when transactional qualification is stale", async () => {
    const value = await fixture();
    const accepted = await repository.snapshotBracket(
      {
        competitionId: value.competitionId,
        playoffRoundId: value.roundId,
        userId: adminId,
        now: new Date(),
      },
      async () => null,
    );
    expect(accepted).toBe(false);
    expect(
      await database
        .select()
        .from(playoffSeed)
        .where(eq(playoffSeed.competitionId, value.competitionId)),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(playoffMatchup)
        .where(eq(playoffMatchup.playoffRoundId, value.roundId)),
    ).toHaveLength(0);
  });

  it("enforces exactly one Question parent", async () => {
    const value = await fixture();
    await expect(
      database.insert(question).values({
        id: randomUUID(),
        roundId: null,
        playoffRoundId: null,
        sequence: 1,
        type: "EXACT_VALUE",
        prompt: "Valor",
        deadlineMode: "ROUND_START",
        usesDefaultScoring: true,
        createdByUserId: adminId,
        updatedByUserId: adminId,
      }),
    ).rejects.toThrow();
    await database.insert(question).values({
      id: randomUUID(),
      playoffRoundId: value.roundId,
      sequence: 1,
      type: "EXACT_VALUE",
      prompt: "Valor",
      deadlineMode: "ROUND_START",
      usesDefaultScoring: true,
      createdByUserId: adminId,
      updatedByUserId: adminId,
    });
    await expect(
      database.insert(question).values({
        id: randomUUID(),
        playoffRoundId: value.roundId,
        sequence: 1,
        type: "EXACT_VALUE",
        prompt: "Otro",
        deadlineMode: "ROUND_START",
        usesDefaultScoring: true,
        createdByUserId: adminId,
        updatedByUserId: adminId,
      }),
    ).rejects.toThrow();
  });

  it("does not persist winners when the next round is missing", async () => {
    const value = await fixture();
    const now = new Date();
    await repository.snapshotBracket(
      {
        competitionId: value.competitionId,
        playoffRoundId: value.roundId,
        userId: adminId,
        now,
      },
      verifySeeds(value.participants, "b".repeat(64)),
    );
    await database
      .update(playoffRound)
      .set({ status: "FINISHED", finishedAt: new Date(now.valueOf() - 86_400_001) })
      .where(eq(playoffRound.id, value.roundId));
    const matchups = await database
      .select()
      .from(playoffMatchup)
      .where(eq(playoffMatchup.playoffRoundId, value.roundId));

    expect(
      await repository.persistAdvancement({
        competitionId: value.competitionId,
        playoffRoundId: value.roundId,
        winners: matchups.map((matchup) => ({
          matchupId: matchup.id,
          participantId: matchup.participantAId,
          decidedBy: "SCORE" as const,
        })),
        sourceFingerprint: "c".repeat(64),
        userId: adminId,
        now,
      }),
    ).toBe(false);
    expect(
      await database
        .select()
        .from(playoffMatchup)
        .where(eq(playoffMatchup.playoffRoundId, value.roundId)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ winnerParticipantId: null }),
        expect.objectContaining({ winnerParticipantId: null }),
      ]),
    );
  });

  it("advances an all-manual stage and rebuilds a DRAFT successor after correction", async () => {
    const value = await fixture();
    const now = new Date();
    await repository.snapshotBracket(
      {
        competitionId: value.competitionId,
        playoffRoundId: value.roundId,
        userId: adminId,
        now,
      },
      verifySeeds(value.participants, "d".repeat(64)),
    );
    const final = createRound({
      id: randomUUID(),
      competitionId: value.competitionId,
      sequence: 2,
      name: "Final",
      startsAt: new Date(now.valueOf() + 172_800_000),
      actorUserId: adminId,
    });
    expect(
      await repository.createRound(
        { round: final, advancementMode: "BEST_SEED", tiebreakerQuestionId: null },
        adminId,
      ),
    ).toBe(true);
    const extra = createRound({
      id: randomUUID(),
      competitionId: value.competitionId,
      sequence: 3,
      name: "Etapa extra",
      startsAt: new Date(now.valueOf() + 259_200_000),
      actorUserId: adminId,
    });
    expect(
      await repository.createRound(
        { round: extra, advancementMode: "BEST_SEED", tiebreakerQuestionId: null },
        adminId,
      ),
    ).toBe(false);
    await database
      .update(playoffRound)
      .set({ status: "FINISHED", finishedAt: new Date(now.valueOf() - 86_400_001) })
      .where(eq(playoffRound.id, value.roundId));
    const matchups = await database
      .select()
      .from(playoffMatchup)
      .where(eq(playoffMatchup.playoffRoundId, value.roundId));
    for (const matchup of matchups)
      expect(
        await repository.persistManualWinner({
          competitionId: value.competitionId,
          playoffRoundId: value.roundId,
          matchupId: matchup.id,
          participantId: matchup.participantAId,
          sourceFingerprint: "e".repeat(64),
          userId: adminId,
          now,
        }),
      ).toBe(true);
    expect(
      await repository.persistAdvancement({
        competitionId: value.competitionId,
        playoffRoundId: value.roundId,
        winners: matchups.map((matchup) => ({
          matchupId: matchup.id,
          participantId: matchup.participantAId,
          decidedBy: "MANUAL" as const,
        })),
        sourceFingerprint: "f".repeat(64),
        userId: adminId,
        now,
      }),
    ).toBe(true);
    const [persistedSemifinal] = await database
      .select()
      .from(playoffRound)
      .where(eq(playoffRound.id, value.roundId));
    expect(persistedSemifinal).toMatchObject({
      status: "FINALIZED",
      finalizedAt: now,
    });

    const corrected = matchups[0]!;
    expect(
      await repository.persistManualWinner({
        competitionId: value.competitionId,
        playoffRoundId: value.roundId,
        matchupId: corrected.id,
        participantId: corrected.participantBId,
        sourceFingerprint: "1".repeat(64),
        userId: adminId,
        now: new Date(now.valueOf() + 1),
      }),
    ).toBe(true);
    const finalParticipants = (
      await database
        .select()
        .from(playoffMatchup)
        .where(eq(playoffMatchup.playoffRoundId, final.id))
    ).flatMap((matchup) => [matchup.participantAId, matchup.participantBId]);
    expect(finalParticipants).toContain(corrected.participantBId);
    expect(finalParticipants).not.toContain(corrected.participantAId);
  });

  it("does not expose a manual final winner as champion before advancement", async () => {
    const value = await fixture();
    const now = new Date();
    await repository.snapshotBracket(
      {
        competitionId: value.competitionId,
        playoffRoundId: value.roundId,
        userId: adminId,
        now,
      },
      verifySeeds(value.participants.slice(0, 2), "2".repeat(64)),
    );
    await database
      .update(playoffRound)
      .set({ status: "FINISHED", finishedAt: new Date(now.valueOf() - 86_400_001) })
      .where(eq(playoffRound.id, value.roundId));
    const [matchup] = await database
      .select()
      .from(playoffMatchup)
      .where(eq(playoffMatchup.playoffRoundId, value.roundId));
    await repository.persistManualWinner({
      competitionId: value.competitionId,
      playoffRoundId: value.roundId,
      matchupId: matchup!.id,
      participantId: matchup!.participantAId,
      sourceFingerprint: "3".repeat(64),
      userId: adminId,
      now,
    });
    expect(
      (await repository.getOverview(value.competitionId, adminId, now))?.champion,
    ).toBeNull();
    await repository.persistAdvancement({
      competitionId: value.competitionId,
      playoffRoundId: value.roundId,
      winners: [
        {
          matchupId: matchup!.id,
          participantId: matchup!.participantAId,
          decidedBy: "MANUAL",
        },
      ],
      sourceFingerprint: "4".repeat(64),
      userId: adminId,
      now,
    });
    expect(
      (await repository.getOverview(value.competitionId, adminId, now))?.champion,
    ).toMatchObject({ participantId: matchup!.participantAId });
  });

  it("hides the playoff overview from inactive non-Admin memberships", async () => {
    const value = await fixture();
    await database
      .update(competitionParticipant)
      .set({ status: "REMOVED" })
      .where(eq(competitionParticipant.userId, value.memberUserIds[0]!));
    expect(
      await repository.getOverview(
        value.competitionId,
        value.memberUserIds[0]!,
        new Date(),
      ),
    ).toBeNull();
  });
});
