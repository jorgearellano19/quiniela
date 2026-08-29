import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configureLeaguePhase,
  generateLeaguePhaseSchedule,
} from "@/application/h2h/use-cases";
import {
  competition,
  competitionGroup,
  competitionGroupParticipant,
  h2hDrawParticipant,
  h2hMatchup,
  round,
} from "@/infrastructure/db/schema";
import { createCompetitionRepository } from "@/infrastructure/competition/competition-repository";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createH2HRepository } from "./h2h-repository";

const { client, database } = createIntegrationDatabase();
const repository = createH2HRepository(database);
const competitionRepository = createCompetitionRepository(database);
const data = new IntegrationTestData(database);
const adminId = "m9-h2h-admin";

describe("H2H persistence", () => {
  beforeEach(async () => {
    await data.createUser({ id: adminId, email: "m9-h2h-admin@example.test" });
  });
  afterEach(async () => data.cleanup());
  afterAll(async () => client.end());

  it("persists one idempotent visible draw with a valid partial schedule", async () => {
    const value = data.competitionValue({
      creatorId: adminId,
      type: "LEAGUE_PLAYOFFS",
    });
    await competitionRepository.createWithAdmin(value, randomUUID());
    for (let index = 0; index < 3; index += 1) {
      const member = await data.createUser({
        email: `m9-h2h-${index}@example.test`,
      });
      await data.createMembership({
        competitionId: value.id,
        userId: member.id,
        status: "ACTIVE",
        statusChangedAt: new Date(),
        updatedByUserId: adminId,
      });
    }
    const actor = { userId: adminId, passwordChangeRequired: false } as const;
    await configureLeaguePhase(
      { competitionId: value.id, roundCount: 2, qualifierCount: 2 },
      actor,
      repository,
    );
    const now = new Date();
    const roundRows = [1, 2].map((sequence) => ({
      id: randomUUID(),
      competitionId: value.id,
      sequence,
      name: `Jornada ${sequence}`,
      startsAt: now,
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: now,
      updatedAt: now,
    }));
    await database.insert(round).values(roundRows);
    await database
      .update(competition)
      .set({ status: "STARTED", startedAt: now })
      .where(eq(competition.id, value.id));

    const first = await generateLeaguePhaseSchedule(
      { competitionId: value.id },
      actor,
      repository,
      now,
    );
    const second = await generateLeaguePhaseSchedule(
      { competitionId: value.id },
      actor,
      repository,
      now,
    );
    expect(second.drawOrder).toEqual(first.drawOrder);
    expect(second.matchups).toEqual(first.matchups);
    expect(first.drawOrder).toHaveLength(4);
    expect(first.matchups).toHaveLength(4);
    expect(first.matchups.slice(0, 2).map((item) => item.roundId)).toEqual([
      roundRows[0]!.id,
      roundRows[0]!.id,
    ]);

    const draws = await database
      .select()
      .from(h2hDrawParticipant)
      .where(eq(h2hDrawParticipant.competitionId, value.id));
    const matchups = await database
      .select()
      .from(h2hMatchup)
      .where(eq(h2hMatchup.competitionId, value.id));
    expect(draws).toHaveLength(4);
    expect(matchups).toHaveLength(4);
    expect(
      new Set(
        matchups.map((matchup) =>
          [matchup.participantAId, matchup.participantBId].sort().join(":"),
        ),
      ).size,
    ).toBe(4);
  });

  it("rejects a matchup whose participant belongs to another group", async () => {
    const value = data.competitionValue({
      creatorId: adminId,
      type: "GROUP_PLAYOFFS",
    });
    await competitionRepository.createWithAdmin(value, randomUUID());
    const participants = [(await repository.get(value.id, adminId))!.participants[0]!.id];
    for (let index = 1; index < 8; index += 1) {
      const member = await data.createUser({ email: `m9-group-${index}@example.test` });
      const membership = await data.createMembership({
        competitionId: value.id,
        userId: member.id,
        status: "ACTIVE",
        statusChangedAt: new Date(),
        updatedByUserId: adminId,
      });
      participants.push(membership.id);
    }
    const groupA = randomUUID();
    const groupB = randomUUID();
    const now = new Date();
    await database.insert(competitionGroup).values([
      {
        id: groupA,
        competitionId: value.id,
        position: 1,
        confirmedAt: now,
        confirmedByUserId: adminId,
      },
      {
        id: groupB,
        competitionId: value.id,
        position: 2,
        confirmedAt: now,
        confirmedByUserId: adminId,
      },
    ]);
    await database.insert(competitionGroupParticipant).values(
      participants.map((participantId, index) => ({
        groupId: index < 4 ? groupA : groupB,
        competitionId: value.id,
        participantId,
        position: (index % 4) + 1,
      })),
    );
    const roundId = randomUUID();
    await database.insert(round).values({
      id: roundId,
      competitionId: value.id,
      sequence: 1,
      name: "Jornada 1",
      startsAt: now,
      status: "DRAFT",
      unansweredPenalty: -1,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: now,
      updatedAt: now,
    });
    await expect(
      database.insert(h2hMatchup).values({
        id: randomUUID(),
        competitionId: value.id,
        roundId,
        groupId: groupA,
        participantAId: participants[0]!,
        participantBId: participants[4]!,
        position: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
  });
});
