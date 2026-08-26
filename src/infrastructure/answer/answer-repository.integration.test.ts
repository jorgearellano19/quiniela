import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { submitAnswer, updateAnswer } from "@/application/answer/use-cases";
import { createQuestion } from "@/domain/round/round";
import { answer, competition, competitionParticipant } from "@/infrastructure/db/schema";
import { createCompetitionRepository } from "@/infrastructure/competition/competition-repository";
import { createRoundRepository } from "@/infrastructure/round/round-repository";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createAnswerRepository } from "./answer-repository";

const { client, database } = createIntegrationDatabase();
const answers = createAnswerRepository(database);
const rounds = createRoundRepository(database);
const competitions = createCompetitionRepository(database);
const data = new IntegrationTestData(database);
const userId = "m5-participant";

describe("Answer persistence", () => {
  beforeEach(async () =>
    data.createUser({ id: userId, email: "m5-participant@example.test" }),
  );
  afterEach(async () => data.cleanup());
  afterAll(async () => client.end());

  async function setup() {
    const value = data.competitionValue({ creatorId: userId });
    await competitions.createWithAdmin(value, randomUUID());
    await database
      .update(competition)
      .set({ status: "STARTED", startedAt: new Date() })
      .where(eq(competition.id, value.id));
    const roundId = randomUUID();
    const now = new Date();
    await rounds.create(
      {
        id: roundId,
        competitionId: value.id,
        sequence: 1,
        name: "Jornada M5",
        startsAt: new Date(now.valueOf() + 86_400_000),
        status: "DRAFT",
        unansweredPenalty: -1,
        publishedAt: null,
        finishedAt: null,
        finalizedAt: null,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      },
      userId,
    );
    const question = createQuestion({
      id: randomUUID(),
      roundId,
      sequence: 1,
      type: "EXACT_VALUE",
      prompt: "Valor exacto",
      points: 1,
      deadlineAt: new Date(now.valueOf() + 86_400_000),
      actorUserId: userId,
      now,
    });
    await rounds.mutateQuestion(roundId, userId, () => ({
      kind: "save",
      value: question,
      isNew: true,
    }));
    await rounds.publish(roundId, userId, now);
    return { competitionId: value.id, roundId, questionId: question.id, now };
  }

  it("round-trips a typed Answer and preserves the original timestamp", async () => {
    const value = await setup();
    const first = await submitAnswer(
      answers,
      { userId },
      { ...value, type: "EXACT_VALUE", value: "-12.340000" },
      value.now,
    );
    const changedAt = new Date(value.now.valueOf() + 1_000);
    const changed = await updateAnswer(
      answers,
      { userId },
      { ...value, type: "EXACT_VALUE", value: "15.5" },
      changedAt,
    );
    expect(changed?.submittedAt).toBe(first?.submittedAt);
    expect(changed?.updatedAt).toBe(changedAt.toISOString());
    const mine = await answers.getMine(value.competitionId, value.roundId, userId);
    expect(mine?.answers[0]).toMatchObject({
      value: { type: "EXACT_VALUE", value: "15.5" },
    });
  });

  it("enforces uniqueness, typed shape, and original submittedAt in PostgreSQL", async () => {
    const value = await setup();
    await submitAnswer(
      answers,
      { userId },
      { ...value, type: "EXACT_VALUE", value: "1" },
      value.now,
    );
    const [stored] = await database.select().from(answer);
    await expect(
      database.insert(answer).values({
        id: randomUUID(),
        questionId: value.questionId,
        participantId: stored!.participantId,
        numericValue: "2",
        submittedAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
    await expect(
      database
        .update(answer)
        .set({ numericValue: null, textValue: "" })
        .where(eq(answer.id, stored!.id)),
    ).rejects.toThrow();
  });

  it("allows an ACTIVE participant without Admin capability and rejects inactive membership", async () => {
    const value = await setup();
    const participant = await data.createUser({
      id: "m5-participant-only",
      email: "m5-participant-only@example.test",
    });
    const membership = await data.createMembership({
      competitionId: value.competitionId,
      userId: participant.id,
      isAdmin: false,
      status: "ACTIVE",
      approvedAt: value.now,
      updatedByUserId: userId,
      statusChangedAt: value.now,
    });
    await expect(
      submitAnswer(
        answers,
        { userId: participant.id },
        { ...value, type: "EXACT_VALUE", value: "7" },
        value.now,
      ),
    ).resolves.toMatchObject({ value: { type: "EXACT_VALUE", value: "7" } });
    await database
      .update(competitionParticipant)
      .set({ status: "REMOVED" })
      .where(eq(competitionParticipant.id, membership.id));
    await expect(
      updateAnswer(
        answers,
        { userId: participant.id },
        { ...value, type: "EXACT_VALUE", value: "8" },
        new Date(value.now.valueOf() + 1_000),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      answers.getMine(randomUUID(), value.roundId, participant.id),
    ).resolves.toBeNull();
  });

  it("enforces Admin-only, pending, cross-participant, and cross-Competition boundaries", async () => {
    const first = await setup();
    await database
      .update(competitionParticipant)
      .set({ status: "REMOVED" })
      .where(
        and(
          eq(competitionParticipant.competitionId, first.competitionId),
          eq(competitionParticipant.userId, userId),
        ),
      );
    await expect(
      submitAnswer(
        answers,
        { userId },
        { ...first, type: "EXACT_VALUE", value: "1" },
        first.now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const pending = await data.createUser({
      id: "m5-pending",
      email: "m5-pending@example.test",
    });
    await data.createMembership({
      competitionId: first.competitionId,
      userId: pending.id,
      isAdmin: false,
      status: "PENDING",
      updatedByUserId: userId,
      statusChangedAt: first.now,
    });
    await expect(
      submitAnswer(
        answers,
        { userId: pending.id },
        { ...first, type: "EXACT_VALUE", value: "2" },
        first.now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const otherCompetition = await setup();
    await expect(
      submitAnswer(
        answers,
        { userId },
        { ...first, type: "EXACT_VALUE", value: "3" },
        first.now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(otherCompetition.competitionId).not.toBe(first.competitionId);

    const scoped = await setup();
    const participantA = await data.createUser({
      id: "m5-scope-a",
      email: "m5-scope-a@example.test",
    });
    const participantB = await data.createUser({
      id: "m5-scope-b",
      email: "m5-scope-b@example.test",
    });
    for (const participant of [participantA, participantB])
      await data.createMembership({
        competitionId: scoped.competitionId,
        userId: participant.id,
        isAdmin: false,
        status: "ACTIVE",
        approvedAt: scoped.now,
        updatedByUserId: userId,
        statusChangedAt: scoped.now,
      });
    await submitAnswer(
      answers,
      { userId: participantA.id },
      { ...scoped, type: "EXACT_VALUE", value: "4" },
      scoped.now,
    );
    await expect(
      updateAnswer(
        answers,
        { userId: participantB.id },
        { ...scoped, type: "EXACT_VALUE", value: "5" },
        scoped.now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      answers.getMine(scoped.competitionId, scoped.roundId, participantB.id),
    ).resolves.toMatchObject({ answers: [] });
  });
});
