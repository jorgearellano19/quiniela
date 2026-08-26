import { describe, expect, it } from "vitest";
import { ApplicationError } from "@/lib/errors/application-error";
import { createQuestion, createRound } from "@/domain/round/round";
import type { Answer } from "@/domain/answer/answer";
import {
  getMyAnswers,
  submitAnswer,
  updateAnswer,
  type AnswerRepository,
  type ParticipantRoundAggregate,
} from "./use-cases";

const competitionId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const questionId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-08-26T12:00:00Z");
const round = createRound({
  id: roundId,
  competitionId,
  sequence: 1,
  name: "Jornada",
  actorUserId: "user",
  now,
});
const question = createQuestion({
  id: questionId,
  roundId,
  sequence: 1,
  type: "OPEN_TEXT",
  prompt: "Goleador",
  points: 1,
  deadlineAt: new Date("2026-08-27T12:00:00Z"),
  actorUserId: "user",
  now,
});
const activeRound = { ...round, status: "ACTIVE" as const, publishedAt: now };

class FakeRepository implements AnswerRepository {
  authorized = true;
  answer: Answer | null = null;
  aggregate: ParticipantRoundAggregate = {
    round: activeRound,
    participantId: "participant",
    questions: [question],
    answers: [],
  };
  async listPublished() {
    return this.authorized ? [] : null;
  }
  async getMine() {
    if (!this.authorized) return null;
    return { ...this.aggregate, answers: this.answer ? [this.answer] : [] };
  }
  async mutate(
    _competitionId: string,
    _roundId: string,
    _questionId: string,
    _userId: string,
    _now: Date,
    operation: Parameters<AnswerRepository["mutate"]>[5],
  ) {
    if (!this.authorized) return null;
    this.answer = operation({
      participantId: "participant",
      round: this.aggregate.round,
      question,
      current: this.answer,
    });
    return this.answer;
  }
}

describe("Answer use cases", () => {
  it("returns only caller-owned Answers with safe capability", async () => {
    const repository = new FakeRepository();
    const result = await getMyAnswers(
      repository,
      { userId: "user" },
      competitionId,
      roundId,
      now,
    );
    expect(result?.questions[0]).toMatchObject({
      id: questionId,
      answer: null,
      canEdit: true,
      scoring: { points: 1 },
    });
    expect(result?.questions[0]).not.toHaveProperty("editReason");
  });

  it("submits once and updates without resetting submittedAt", async () => {
    const repository = new FakeRepository();
    const actor = { userId: "user" };
    await submitAnswer(
      repository,
      actor,
      {
        competitionId,
        roundId,
        questionId,
        type: "OPEN_TEXT",
        value: "Primero",
      },
      now,
    );
    const submittedAt = repository.answer?.submittedAt;
    await expect(
      submitAnswer(
        repository,
        actor,
        {
          competitionId,
          roundId,
          questionId,
          type: "OPEN_TEXT",
          value: "Duplicado",
        },
        now,
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
    await updateAnswer(
      repository,
      actor,
      {
        competitionId,
        roundId,
        questionId,
        type: "OPEN_TEXT",
        value: "Editado",
      },
      new Date("2026-08-26T13:00:00Z"),
    );
    expect(repository.answer?.submittedAt).toBe(submittedAt);
    expect(repository.answer?.value).toEqual({ type: "OPEN_TEXT", value: "Editado" });
  });

  it("rejects blank Match scores instead of coercing them to zero", async () => {
    const repository = new FakeRepository();
    await expect(
      submitAnswer(
        repository,
        { userId: "user" },
        {
          competitionId,
          roundId,
          questionId,
          type: "MATCH_SCORE",
          homeScore: "",
          awayScore: "   ",
        },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: {
        homeScore: expect.any(String),
        awayScore: expect.any(String),
      },
    });
    expect(repository.answer).toBeNull();
  });

  it("fails safely for anonymous, unauthorized, late, and missing updates", async () => {
    const repository = new FakeRepository();
    await expect(
      submitAnswer(repository, null, {
        competitionId,
        roundId,
        questionId,
        type: "OPEN_TEXT",
        value: "Valor",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    repository.authorized = false;
    await expect(
      submitAnswer(
        repository,
        { userId: "other" },
        {
          competitionId,
          roundId,
          questionId,
          type: "OPEN_TEXT",
          value: "Valor",
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    repository.authorized = true;
    await expect(
      updateAnswer(
        repository,
        { userId: "user" },
        {
          competitionId,
          roundId,
          questionId,
          type: "OPEN_TEXT",
          value: "Valor",
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      submitAnswer(
        repository,
        { userId: "user" },
        {
          competitionId,
          roundId,
          questionId,
          type: "OPEN_TEXT",
          value: "Tarde",
        },
        question.deadlineAt,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
