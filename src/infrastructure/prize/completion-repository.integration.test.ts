import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { competition } from "@/infrastructure/db/schema";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createCompletionRepository } from "./completion-repository";

const { client, database } = createIntegrationDatabase();
const repository = createCompletionRepository(database);
const testData = new IntegrationTestData(database);
const adminId = "m11-completion-admin";
const outsiderId = "m11-completion-outsider";

describe("Competition completion persistence", () => {
  beforeEach(async () => {
    await testData.createUser({
      id: adminId,
      name: "Admin M11",
      email: "m11-admin@example.test",
    });
    await testData.createUser({
      id: outsiderId,
      name: "Fuera M11",
      email: "m11-outsider@example.test",
    });
  });
  afterEach(async () => testData.cleanup());
  afterAll(async () => client.end());

  async function startedCompetition() {
    const value = testData.competitionValue({ creatorId: adminId });
    await database.insert(competition).values({
      ...value,
      status: "STARTED",
      startedAt: value.createdAt,
    });
    await testData.createMembership({
      id: randomUUID(),
      competitionId: value.id,
      userId: adminId,
      isAdmin: true,
      status: "ACTIVE",
      updatedByUserId: adminId,
    });
    return value;
  }

  it("re-evaluates inside the transaction and attributes completion", async () => {
    const value = await startedCompetition();
    const completedAt = new Date("2026-08-29T20:00:00Z");
    let transactionSourcesSeen = false;
    await expect(
      repository.complete(value.id, adminId, completedAt, async (sources) => {
        transactionSourcesSeen = Boolean(
          sources.paymentRepository &&
          sources.standingsRepository &&
          sources.playoffRepository,
        );
        return true;
      }),
    ).resolves.toBe(true);
    const [row] = await database
      .select({
        status: competition.status,
        completedAt: competition.completedAt,
        updatedByUserId: competition.updatedByUserId,
      })
      .from(competition)
      .where(eq(competition.id, value.id));
    expect(transactionSourcesSeen).toBe(true);
    expect(row).toEqual({ status: "COMPLETED", completedAt, updatedByUserId: adminId });
  });

  it("rolls back when authoritative readiness changes and denies outsiders", async () => {
    const value = await startedCompetition();
    await expect(
      repository.complete(value.id, adminId, new Date(), async () => false),
    ).resolves.toBe(false);
    await expect(
      repository.complete(value.id, outsiderId, new Date(), async () => true),
    ).resolves.toBe(false);
    const [row] = await database
      .select({ status: competition.status, completedAt: competition.completedAt })
      .from(competition)
      .where(eq(competition.id, value.id));
    expect(row).toEqual({ status: "STARTED", completedAt: null });
  });

  it("cannot complete twice", async () => {
    const value = await startedCompetition();
    await expect(
      repository.complete(value.id, adminId, new Date(), async () => true),
    ).resolves.toBe(true);
    await expect(
      repository.complete(value.id, adminId, new Date(), async () => true),
    ).resolves.toBe(false);
  });
});
