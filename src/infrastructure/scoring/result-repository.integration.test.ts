import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { submitAnswer } from "@/application/answer/use-cases";
import {
  correctOfficialResult,
  judgeOpenTextAnswer,
  recordOfficialResult,
} from "@/application/scoring/use-cases";
import { createQuestion } from "@/domain/round/round";
import {
  competition,
  officialResult,
  officialResultCorrectionEvent,
  openTextJudgmentCorrectionEvent,
  round,
} from "@/infrastructure/db/schema";
import { createAnswerRepository } from "@/infrastructure/answer/answer-repository";
import { createCompetitionRepository } from "@/infrastructure/competition/competition-repository";
import { createRoundRepository } from "@/infrastructure/round/round-repository";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createResultRepository } from "./result-repository";

const { client, database } = createIntegrationDatabase();
const data = new IntegrationTestData(database);
const competitions = createCompetitionRepository(database);
const rounds = createRoundRepository(database);
const answers = createAnswerRepository(database);
const results = createResultRepository(database);
const adminId = "m6-admin";

describe("Official Result persistence", () => {
  beforeEach(async () =>
    data.createUser({ id: adminId, email: "m6-admin@example.test", name: "Admin M6" }),
  );
  afterEach(async () => data.cleanup());
  afterAll(async () => client.end());

  async function setup() {
    const competitionValue = data.competitionValue({ creatorId: adminId });
    await competitions.createWithAdmin(competitionValue, randomUUID());
    const answerTime = new Date("2026-08-26T10:00:00.000Z");
    const deadline = new Date(answerTime.valueOf() + 60_000);
    await database
      .update(competition)
      .set({ status: "STARTED", startedAt: answerTime })
      .where(eq(competition.id, competitionValue.id));
    const roundId = randomUUID();
    await rounds.create(
      {
        id: roundId,
        competitionId: competitionValue.id,
        sequence: 1,
        name: "Jornada M6",
        startsAt: deadline,
        status: "DRAFT",
        unansweredPenalty: -1,
        publishedAt: null,
        finishedAt: null,
        finalizedAt: null,
        createdByUserId: adminId,
        updatedByUserId: adminId,
        createdAt: answerTime,
        updatedAt: answerTime,
      },
      adminId,
    );
    const exact = createQuestion({
      id: randomUUID(),
      roundId,
      sequence: 1,
      type: "EXACT_VALUE",
      prompt: "Valor",
      points: 2,
      deadlineAt: deadline,
      actorUserId: adminId,
      now: answerTime,
    });
    const open = createQuestion({
      id: randomUUID(),
      roundId,
      sequence: 2,
      type: "OPEN_TEXT",
      prompt: "Texto",
      points: 1,
      deadlineAt: deadline,
      actorUserId: adminId,
      now: answerTime,
    });
    for (const value of [exact, open])
      await rounds.mutateQuestion(roundId, adminId, () => ({
        kind: "save",
        value,
        isNew: true,
      }));
    await rounds.publish(roundId, adminId, answerTime);
    await submitAnswer(
      answers,
      { userId: adminId },
      {
        competitionId: competitionValue.id,
        roundId,
        questionId: exact.id,
        type: "EXACT_VALUE",
        value: "10",
      },
      answerTime,
    );
    const openAnswer = await submitAnswer(
      answers,
      { userId: adminId },
      {
        competitionId: competitionValue.id,
        roundId,
        questionId: open.id,
        type: "OPEN_TEXT",
        value: "Respuesta",
      },
      answerTime,
    );
    return {
      competitionId: competitionValue.id,
      roundId,
      exactId: exact.id,
      openAnswerId: openAnswer!.value
        ? (await answers.getMine(competitionValue.id, roundId, adminId))!.answers.find(
            (item) => item.questionId === open.id,
          )!.id
        : "",
      resultTime: deadline,
    };
  }

  it("finishes atomically only after typed Results and OPEN_TEXT judgments are complete", async () => {
    const value = await setup();
    await recordOfficialResult(
      results,
      { userId: adminId },
      { ...value, questionId: value.exactId, type: "EXACT_VALUE", value: "10.000000" },
      value.resultTime,
    );
    expect((await database.select().from(round))[0]?.status).toBe("ACTIVE");
    await judgeOpenTextAnswer(
      results,
      { userId: adminId },
      { ...value, answerId: value.openAnswerId, isCorrect: true },
      value.resultTime,
    );
    expect((await database.select().from(round))[0]).toMatchObject({
      status: "FINISHED",
      finishedAt: value.resultTime,
    });
  });

  it("audits real corrections, keeps retries idempotent, and reflects the current fact", async () => {
    const value = await setup();
    await recordOfficialResult(
      results,
      { userId: adminId },
      { ...value, questionId: value.exactId, type: "EXACT_VALUE", value: "10" },
      value.resultTime,
    );
    await correctOfficialResult(
      results,
      { userId: adminId },
      { ...value, questionId: value.exactId, type: "EXACT_VALUE", value: "11" },
      new Date(value.resultTime.valueOf() + 1_000),
    );
    await correctOfficialResult(
      results,
      { userId: adminId },
      { ...value, questionId: value.exactId, type: "EXACT_VALUE", value: "11.000000" },
      new Date(value.resultTime.valueOf() + 2_000),
    );
    expect((await database.select().from(officialResult))[0]?.numericValue).toBe(
      "11.000000",
    );
    expect(
      (await database.select({ count: count() }).from(officialResultCorrectionEvent))[0]
        ?.count,
    ).toBe(1);
  });

  it("audits judgment corrections and rejects participant-only mutation", async () => {
    const value = await setup();
    await judgeOpenTextAnswer(
      results,
      { userId: adminId },
      { ...value, answerId: value.openAnswerId, isCorrect: true },
      value.resultTime,
    );
    await judgeOpenTextAnswer(
      results,
      { userId: adminId },
      { ...value, answerId: value.openAnswerId, isCorrect: false },
      new Date(value.resultTime.valueOf() + 1_000),
    );
    expect(
      (await database.select({ count: count() }).from(openTextJudgmentCorrectionEvent))[0]
        ?.count,
    ).toBe(1);
    const participant = await data.createUser({ email: "m6-participant@example.test" });
    await data.createMembership({
      competitionId: value.competitionId,
      userId: participant.id,
      isAdmin: false,
      status: "ACTIVE",
      approvedAt: value.resultTime,
      updatedByUserId: adminId,
      statusChangedAt: value.resultTime,
    });
    await expect(
      correctOfficialResult(
        results,
        { userId: participant.id },
        { ...value, questionId: value.exactId, type: "EXACT_VALUE", value: "12" },
        new Date(value.resultTime.valueOf() + 2_000),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects corrections at effective finalization and enforces Result uniqueness", async () => {
    const value = await setup();
    await recordOfficialResult(
      results,
      { userId: adminId },
      { ...value, questionId: value.exactId, type: "EXACT_VALUE", value: "10" },
      value.resultTime,
    );
    await judgeOpenTextAnswer(
      results,
      { userId: adminId },
      { ...value, answerId: value.openAnswerId, isCorrect: true },
      value.resultTime,
    );
    await expect(
      correctOfficialResult(
        results,
        { userId: adminId },
        { ...value, questionId: value.exactId, type: "EXACT_VALUE", value: "12" },
        new Date(value.resultTime.valueOf() + 86_400_000),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const stored = (await database.select().from(officialResult))[0]!;
    await expect(
      database.insert(officialResult).values({
        ...stored,
        id: randomUUID(),
      }),
    ).rejects.toThrow();
  });
});
