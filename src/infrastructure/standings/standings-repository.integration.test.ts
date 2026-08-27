import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLeagueStandings, resolveRankingTie } from "@/application/standings/use-cases";
import {
  answer,
  competition,
  competitionParticipant,
  manualRankingResolution,
  manualRankingResolutionEntry,
  matchQuestionConfig,
  officialResult,
  question,
  questionScoring,
  round,
} from "@/infrastructure/db/schema";
import { createCompetitionRepository } from "@/infrastructure/competition/competition-repository";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createStandingsRepository } from "./standings-repository";

const { client, database } = createIntegrationDatabase();
const data = new IntegrationTestData(database);
const competitions = createCompetitionRepository(database);
const standings = createStandingsRepository(database);
const adminId = "m7-admin";
const resultTime = new Date("2026-08-26T12:00:00.000Z");

describe("standings persistence", () => {
  beforeEach(async () =>
    data.createUser({ id: adminId, email: "m7-admin@example.test", name: "Admin M7" }),
  );
  afterEach(async () => data.cleanup());
  afterAll(async () => client.end());

  async function setupTie() {
    const competitionValue = data.competitionValue({
      creatorId: adminId,
      type: "LEAGUE",
    });
    await competitions.createWithAdmin(competitionValue, randomUUID());
    const participantUser = await data.createUser({
      email: "m7-participant@example.test",
      name: "Participante M7",
    });
    const participant = await data.createMembership({
      competitionId: competitionValue.id,
      userId: participantUser.id,
      isAdmin: false,
      status: "ACTIVE",
      approvedAt: resultTime,
      statusChangedAt: resultTime,
      updatedByUserId: adminId,
    });
    const [adminMembership] = await database
      .select()
      .from(competitionParticipant)
      .where(eq(competitionParticipant.userId, adminId));
    await database
      .update(competition)
      .set({ status: "STARTED", startedAt: resultTime })
      .where(eq(competition.id, competitionValue.id));
    const roundId = randomUUID();
    const questionId = randomUUID();
    const finishedAt = new Date(resultTime.valueOf() - 86_400_000);
    await database.insert(round).values({
      id: roundId,
      competitionId: competitionValue.id,
      sequence: 1,
      name: "Jornada empatada",
      startsAt: new Date(resultTime.valueOf() - 172_800_000),
      status: "FINISHED",
      unansweredPenalty: -1,
      publishedAt: new Date(resultTime.valueOf() - 172_800_000),
      finishedAt,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: finishedAt,
      updatedAt: finishedAt,
    });
    await database.insert(question).values({
      id: questionId,
      roundId,
      sequence: 1,
      type: "MATCH_SCORE",
      prompt: null,
      deadlineMode: "ROUND_START",
      deadlineAt: null,
      usesDefaultScoring: false,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: finishedAt,
      updatedAt: finishedAt,
    });
    await database.insert(questionScoring).values({
      questionId,
      points: null,
      exactScorePoints: 3,
      goalDifferencePoints: 2,
      normalResultPoints: 1,
      againstRival: null,
    });
    await database.insert(matchQuestionConfig).values({
      questionId,
      homeLabel: "Local",
      awayLabel: "Visita",
    });
    for (const [index, membershipId] of [adminMembership!.id, participant.id].entries())
      await database.insert(answer).values({
        id: randomUUID(),
        questionId,
        participantId: membershipId,
        homeScore: 2,
        awayScore: 1,
        submittedAt: new Date(finishedAt.valueOf() - 60_000 + index),
        updatedAt: finishedAt,
      });
    await database.insert(officialResult).values({
      id: randomUUID(),
      questionId,
      homeScore: 2,
      awayScore: 1,
      recordedByUserId: adminId,
      updatedByUserId: adminId,
      recordedAt: finishedAt,
      updatedAt: finishedAt,
    });
    return {
      competitionId: competitionValue.id,
      participantUserId: participantUser.id,
      participantIds: [adminMembership!.id, participant.id],
    };
  }

  it("derives standings and appends auditable whole-group corrections atomically", async () => {
    const value = await setupTie();
    const before = await getLeagueStandings(
      standings,
      { userId: adminId },
      value.competitionId,
      resultTime,
    );
    expect(before).toMatchObject({ ready: true, winner: null });
    expect(before?.unresolvedGroups[0]).toHaveLength(2);

    await resolveRankingTie(
      standings,
      { userId: adminId },
      {
        competitionId: value.competitionId,
        scope: "LEAGUE_STANDINGS",
        participantIds: value.participantIds,
      },
      resultTime,
    );
    await resolveRankingTie(
      standings,
      { userId: adminId },
      {
        competitionId: value.competitionId,
        scope: "LEAGUE_STANDINGS",
        participantIds: [...value.participantIds].reverse(),
      },
      new Date(resultTime.valueOf() + 1),
    );

    expect(
      (await database.select().from(manualRankingResolution)).map((item) => ({
        revision: item.revision,
        action: item.action,
        actor: item.actorUserId,
      })),
    ).toEqual([
      { revision: 1, action: "CREATED", actor: adminId },
      { revision: 2, action: "CORRECTED", actor: adminId },
    ]);
    expect(
      (await database.select({ count: count() }).from(manualRankingResolutionEntry))[0]
        ?.count,
    ).toBe(4);
    const after = await getLeagueStandings(
      standings,
      { userId: adminId },
      value.competitionId,
      resultTime,
    );
    expect(after?.winner?.id).toBe(value.participantIds[1]);

    await database
      .update(officialResult)
      .set({ updatedAt: new Date(resultTime.valueOf() + 2) });
    const invalidated = await getLeagueStandings(
      standings,
      { userId: adminId },
      value.competitionId,
      resultTime,
    );
    expect(invalidated).toMatchObject({ winner: null });
    expect(invalidated?.unresolvedGroups[0]).toHaveLength(2);
  });

  it("rejects Participant-only resolution and preserves zero audit rows", async () => {
    const value = await setupTie();
    await expect(
      resolveRankingTie(
        standings,
        { userId: value.participantUserId },
        {
          competitionId: value.competitionId,
          scope: "LEAGUE_STANDINGS",
          participantIds: value.participantIds,
        },
        resultTime,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      (await database.select({ count: count() }).from(manualRankingResolution))[0]?.count,
    ).toBe(0);
  });
});
