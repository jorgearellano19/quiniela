import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createQuestion } from "@/domain/round/round";
import {
  competition,
  question,
  questionOption,
  questionScoring,
  round,
} from "@/infrastructure/db/schema";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createCompetitionRepository } from "@/infrastructure/competition/competition-repository";
import { createRoundRepository } from "./round-repository";
const { client, database } = createIntegrationDatabase();
const repository = createRoundRepository(database);
const competitionRepository = createCompetitionRepository(database);
const data = new IntegrationTestData(database);
const adminId = "m4-admin";
describe("Round persistence", () => {
  beforeEach(async () =>
    data.createUser({ id: adminId, email: "m4-admin@example.test" }),
  );
  afterEach(async () => data.cleanup());
  afterAll(async () => client.end());
  async function setup(status: "DRAFT" | "STARTED" = "DRAFT") {
    const value = data.competitionValue({ creatorId: adminId });
    await competitionRepository.createWithAdmin(value, randomUUID());
    if (status === "STARTED")
      await database
        .update(competition)
        .set({ status })
        .where(eq(competition.id, value.id));
    return value;
  }
  it("enforces Round and Question sequence constraints", async () => {
    const c = await setup();
    const first = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repository.create(first, adminId);
    await expect(
      repository.create({ ...first, id: randomUUID() }, adminId),
    ).rejects.toThrow();
    await expect(
      client`update round set sequence = 0 where id = ${first.id}`,
    ).rejects.toThrow();
  });
  it("round-trips typed options in order with audit fields", async () => {
    const c = await setup();
    const value = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repository.create(value, adminId);
    const q = createQuestion({
      id: randomUUID(),
      roundId: value.id,
      sequence: 1,
      prompt: "Elige",
      deadlineAt: new Date(Date.now() + 60_000),
      actorUserId: adminId,
      type: "OPTIONS",
      points: 1,
      options: [
        { id: randomUUID(), label: "B" },
        { id: randomUUID(), label: "A" },
      ],
    });
    await repository.mutateQuestion(value.id, adminId, () => ({
      kind: "save",
      value: q,
      isNew: true,
    }));
    const editor = await repository.getEditor(value.id, adminId);
    expect(editor?.questions[0]).toMatchObject({
      type: "OPTIONS",
      options: [
        { sequence: 1, label: "B" },
        { sequence: 2, label: "A" },
      ],
    });
    const rows = await database.select().from(questionOption);
    expect(rows).toHaveLength(2);
  });
  it("publishes atomically and idempotently only after Competition start", async () => {
    const c = await setup("STARTED");
    const value = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repository.create(value, adminId);
    const q = createQuestion({
      id: randomUUID(),
      roundId: value.id,
      sequence: 1,
      prompt: "Texto",
      deadlineAt: new Date(Date.now() + 60_000),
      actorUserId: adminId,
      type: "OPEN_TEXT",
      points: 1,
    });
    await repository.mutateQuestion(value.id, adminId, () => ({
      kind: "save",
      value: q,
      isNew: true,
    }));
    const first = await repository.publish(value.id, adminId, new Date());
    const second = await repository.publish(value.id, adminId, new Date());
    expect(first?.round.status).toBe("ACTIVE");
    expect(second?.round.publishedAt).toEqual(first?.round.publishedAt);
  });
  it("rolls back invalid publication", async () => {
    const c = await setup("STARTED");
    const value = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repository.create(value, adminId);
    await expect(repository.publish(value.id, adminId, new Date())).rejects.toThrow();
    const [stored] = await database.select().from(round).where(eq(round.id, value.id));
    expect(stored?.status).toBe("DRAFT");
  });
  it("rejects creation after Competition completion inside the write transaction", async () => {
    const c = await setup();
    await database
      .update(competition)
      .set({ status: "COMPLETED" })
      .where(eq(competition.id, c.id));
    const created = await repository.create(
      {
        id: randomUUID(),
        competitionId: c.id,
        sequence: 1,
        name: "Tarde",
        startsAt: new Date(Date.now() + 60_000),
        status: "DRAFT",
        unansweredPenalty: -1,
        publishedAt: null,
        finishedAt: null,
        finalizedAt: null,
        createdByUserId: adminId,
        updatedByUserId: adminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      adminId,
    );
    expect(created).toBe(false);
  });
  it("updates one Question without rewriting unrelated Questions", async () => {
    const c = await setup();
    const value = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repository.create(value, adminId);
    const first = createQuestion({
      id: randomUUID(),
      roundId: value.id,
      sequence: 1,
      prompt: "Primera",
      deadlineAt: new Date(Date.now() + 60_000),
      actorUserId: adminId,
      type: "OPEN_TEXT",
      points: 1,
    });
    const second = createQuestion({
      id: randomUUID(),
      roundId: value.id,
      sequence: 2,
      prompt: "Segunda",
      deadlineAt: new Date(Date.now() + 60_000),
      actorUserId: adminId,
      type: "EXACT_VALUE",
      points: 1,
    });
    await repository.mutateQuestion(value.id, adminId, () => ({
      kind: "save",
      value: first,
      isNew: true,
    }));
    await repository.mutateQuestion(value.id, adminId, () => ({
      kind: "save",
      value: second,
      isNew: true,
    }));
    const [before] = await database
      .select({ createdAt: question.createdAt, updatedAt: question.updatedAt })
      .from(question)
      .where(eq(question.id, second.id));
    await repository.mutateQuestion(value.id, adminId, () => ({
      kind: "save",
      value: { ...first, prompt: "Primera editada", updatedAt: new Date() },
      isNew: false,
    }));
    const [after] = await database
      .select({ createdAt: question.createdAt, updatedAt: question.updatedAt })
      .from(question)
      .where(eq(question.id, second.id));
    expect(after).toEqual(before);
  });
  it("rejects malformed scoring shapes at the database boundary", async () => {
    const c = await setup();
    const value = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repository.create(value, adminId);
    const questionId = randomUUID();
    await database.insert(question).values({
      id: questionId,
      roundId: value.id,
      sequence: 1,
      type: "MATCH_SCORE",
      prompt: null,
      deadlineMode: "CUSTOM",
      deadlineAt: new Date(Date.now() + 60_000),
      createdByUserId: adminId,
      updatedByUserId: adminId,
    });
    await expect(
      database.insert(questionScoring).values({
        questionId,
        exactScorePoints: 2,
        normalResultPoints: 2,
      }),
    ).rejects.toThrow();
  });
  it("serializes publication against a concurrent Question edit", async () => {
    const c = await setup("STARTED");
    const value = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await repository.create(value, adminId);
    const original = createQuestion({
      id: randomUUID(),
      roundId: value.id,
      sequence: 1,
      prompt: "Original",
      deadlineAt: new Date(Date.now() + 60_000),
      actorUserId: adminId,
      type: "OPEN_TEXT",
      points: 1,
    });
    await repository.mutateQuestion(value.id, adminId, () => ({
      kind: "save",
      value: original,
      isNew: true,
    }));
    const [, edit] = await Promise.allSettled([
      repository.publish(value.id, adminId, new Date()),
      repository.mutateQuestion(value.id, adminId, (lockedRound) => {
        if (lockedRound.status !== "DRAFT") throw new Error("Round is frozen.");
        return {
          kind: "save",
          value: { ...original, prompt: "Editada", updatedAt: new Date() },
          isNew: false,
        };
      }),
    ]);
    const editor = await repository.getEditor(value.id, adminId);
    expect(editor?.round.status).toBe("ACTIVE");
    expect(editor?.questions[0]?.prompt).toBe(
      edit.status === "fulfilled" ? "Editada" : "Original",
    );
  });
  it("enforces unique names and atomically reorders and deletes drafts", async () => {
    const c = await setup();
    const base = {
      id: randomUUID(),
      competitionId: c.id,
      sequence: 1,
      name: "Primera",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT" as const,
      unansweredPenalty: -1 as const,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const second = { ...base, id: randomUUID(), sequence: 2, name: "Segunda" };
    await repository.create(base, adminId);
    await repository.create(second, adminId);
    await expect(
      repository.create(
        { ...base, id: randomUUID(), sequence: 3, name: " primera " },
        adminId,
      ),
    ).rejects.toThrow();
    await expect(
      repository.reorderRounds(c.id, adminId, [second.id, base.id]),
    ).resolves.toBe(true);
    expect((await repository.list(c.id)).map(({ round }) => round.id)).toEqual([
      second.id,
      base.id,
    ]);
    const questionValue = createQuestion({
      id: randomUUID(),
      roundId: base.id,
      sequence: 1,
      prompt: "Temporal",
      deadlineAt: base.startsAt,
      actorUserId: adminId,
      type: "OPEN_TEXT",
      points: 1,
    });
    await repository.mutateQuestion(base.id, adminId, () => ({
      kind: "save",
      value: questionValue,
      isNew: true,
    }));
    await expect(repository.deleteDraft(base.id, c.id, adminId)).resolves.toBe(true);
    await expect(repository.getEditor(base.id, adminId)).resolves.toBeNull();
  });
});
