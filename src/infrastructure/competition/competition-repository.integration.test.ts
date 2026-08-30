import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  competition as competitionTable,
  competitionParticipant,
  prizeConfiguration,
  prizeConfigurationEvent,
} from "@/infrastructure/db/schema";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createCompetitionRepository } from "./competition-repository";

const { client, database } = createIntegrationDatabase();
const repository = createCompetitionRepository(database);
const testData = new IntegrationTestData(database);
const userOne = "m2-user-one";
const userTwo = "m2-user-two";

describe("Competition persistence", () => {
  beforeEach(async () => {
    await testData.createUser({ id: userOne, name: "Uno", email: "m2-one@example.com" });
    await testData.createUser({ id: userTwo, name: "Dos", email: "m2-two@example.com" });
  });

  afterEach(async () => testData.cleanup());

  afterAll(async () => {
    await client.end();
  });

  const value = () => testData.competitionValue({ creatorId: userOne, name: "Copa M2" });

  it("atomically creates a DRAFT MXN Competition and creator Admin membership", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID());
    const [row] = await database
      .select({
        status: competitionTable.status,
        currency: competitionTable.currency,
        isAdmin: competitionParticipant.isAdmin,
      })
      .from(competitionTable)
      .innerJoin(
        competitionParticipant,
        eq(competitionParticipant.competitionId, competitionTable.id),
      )
      .where(eq(competitionTable.id, competition.id));
    expect(row).toMatchObject({
      status: "DRAFT",
      currency: "MXN",
      isAdmin: true,
    });
  });
  it("atomically includes approved payment and Round-prize configuration", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID(), {
      financialFeaturesEnabled: true,
      roundFeeAmount: 25_000,
      maximumDebt: 50_000,
      prizes: { ROUND_WINNER: 100_000 },
    });
    const [configured] = await database
      .select({
        financialFeaturesEnabled: competitionTable.financialFeaturesEnabled,
        roundFeeAmount: competitionTable.roundFeeAmount,
        maximumDebt: competitionTable.maximumDebt,
      })
      .from(competitionTable)
      .where(eq(competitionTable.id, competition.id));
    const [prize] = await database
      .select()
      .from(prizeConfiguration)
      .where(eq(prizeConfiguration.competitionId, competition.id));
    const [event] = await database
      .select()
      .from(prizeConfigurationEvent)
      .where(eq(prizeConfigurationEvent.competitionId, competition.id));
    expect(configured).toEqual({
      financialFeaturesEnabled: true,
      roundFeeAmount: 25_000,
      maximumDebt: 50_000,
    });
    expect(prize).toMatchObject({ type: "ROUND_WINNER", amount: 100_000 });
    expect(event).toMatchObject({
      type: "ROUND_WINNER",
      action: "UPSERTED",
      beforeAmount: null,
      afterAmount: 100_000,
      actorUserId: userOne,
    });
  });
  it("rejects a DRAFT type change that would retain an unsupported prize", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID(), {
      financialFeaturesEnabled: true,
      roundFeeAmount: null,
      maximumDebt: null,
      prizes: { LEAGUE_WINNER: 100_000 },
    });
    expect(
      await repository.updateDraft({ ...competition, type: "LEAGUE_PLAYOFFS" }, userOne),
    ).toBe(false);
    await expect(repository.findForUser(competition.id, userOne)).resolves.toMatchObject({
      type: "LEAGUE",
    });
  });
  it("enforces unique membership, restrictive foreign keys, and fixed currency", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID());
    await expect(
      client`insert into competition_participant (id, competition_id, user_id) values (${randomUUID()}, ${competition.id}, ${userOne})`,
    ).rejects.toThrow();
    await expect(client`delete from "user" where id = ${userOne}`).rejects.toThrow();
    await expect(
      client`update competition set currency = 'USD' where id = ${competition.id}`,
    ).rejects.toThrow();
  });
  it("rolls back the Competition when creator membership insertion fails", async () => {
    const first = value();
    const membershipId = randomUUID();
    await repository.createWithAdmin(first, membershipId);
    const second = value();
    await expect(repository.createWithAdmin(second, membershipId)).rejects.toThrow();
    const rows = await database
      .select({ id: competitionTable.id })
      .from(competitionTable)
      .where(eq(competitionTable.id, second.id));
    expect(rows).toHaveLength(0);
  });
  it("scopes list/detail to membership and conditionally updates DRAFT with attribution", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID());
    expect(await repository.listForUser(userTwo)).toEqual([]);
    expect(await repository.findForUser(competition.id, userTwo)).toBeNull();
    const updated = {
      ...competition,
      name: "Actualizada",
      updatedByUserId: userOne,
      updatedAt: new Date(),
    };
    expect(await repository.updateDraft(updated, userOne)).toBe(true);
    const [row] = await database
      .select({
        name: competitionTable.name,
        updatedByUserId: competitionTable.updatedByUserId,
      })
      .from(competitionTable)
      .where(eq(competitionTable.id, competition.id));
    expect(row).toMatchObject({
      name: "Actualizada",
      updatedByUserId: userOne,
    });
    await database
      .update(competitionTable)
      .set({ status: "STARTED" })
      .where(eq(competitionTable.id, competition.id));
    expect(await repository.updateDraft({ ...updated, name: "No" }, userOne)).toBe(false);
  });

  it("hides rejected and removed memberships from list and direct detail access", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID());
    const membershipId = randomUUID();
    await testData.createMembership({
      id: membershipId,
      competitionId: competition.id,
      userId: userTwo,
      status: "ACTIVE",
      statusChangedAt: new Date(),
      updatedByUserId: userOne,
    });

    expect(await repository.findForUser(competition.id, userTwo)).not.toBeNull();
    await database
      .update(competitionParticipant)
      .set({ status: "REJECTED" })
      .where(eq(competitionParticipant.id, membershipId));
    expect(await repository.listForUser(userTwo)).toEqual([]);
    expect(await repository.findForUser(competition.id, userTwo)).toBeNull();

    await database
      .update(competitionParticipant)
      .set({ status: "REMOVED" })
      .where(eq(competitionParticipant.id, membershipId));
    expect(await repository.findForUser(competition.id, userTwo)).toBeNull();
  });
});
