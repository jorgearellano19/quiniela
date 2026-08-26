import { describe, expect, it, vi } from "vitest";
import {
  createQuestion,
  createRound,
  type Question,
  type Round,
} from "@/domain/round/round";
import type { Answer } from "@/domain/answer/answer";
import type { OfficialResult } from "@/domain/scoring/scoring";
import {
  correctOfficialResult,
  getRoundResults,
  judgeOpenTextAnswer,
  recordOfficialResult,
  type ResultRepository,
  type ResultRoundAggregate,
} from "./use-cases";

const ids = {
  competition: "00000000-0000-4000-8000-000000000001",
  round: "00000000-0000-4000-8000-000000000002",
  question: "00000000-0000-4000-8000-000000000003",
  answer: "00000000-0000-4000-8000-000000000004",
  participantA: "00000000-0000-4000-8000-000000000005",
  participantB: "00000000-0000-4000-8000-000000000006",
};
const now = new Date("2026-08-26T12:00:00.000Z");

function activeRound(): Round {
  return {
    ...createRound({
      id: ids.round,
      competitionId: ids.competition,
      sequence: 1,
      name: "Uno",
      actorUserId: "admin",
      now,
    }),
    status: "ACTIVE",
    publishedAt: now,
  };
}

function match(deadlineAt = now): Question {
  return createQuestion({
    id: ids.question,
    roundId: ids.round,
    sequence: 1,
    type: "MATCH_SCORE",
    homeLabel: "Local",
    awayLabel: "Visita",
    exactScorePoints: 3,
    goalDifferencePoints: 2,
    normalResultPoints: 1,
    deadlineAt,
    actorUserId: "admin",
  });
}

function aggregate(question = match()): ResultRoundAggregate {
  const answers: Answer[] = [
    {
      id: ids.answer,
      questionId: ids.question,
      participantId: ids.participantA,
      value: { type: "MATCH_SCORE", homeScore: 2, awayScore: 1 },
      submittedAt: now,
      updatedAt: now,
    },
  ];
  const results: OfficialResult[] = [
    {
      id: "result",
      questionId: ids.question,
      value: { type: "MATCH_SCORE", homeScore: 2, awayScore: 1 },
      recordedAt: now,
      updatedAt: now,
      updatedByUserId: "admin",
    },
  ];
  return {
    round: activeRound(),
    questions: [question],
    participants: [
      { id: ids.participantA, userId: "a", name: "Ana" },
      { id: ids.participantB, userId: "b", name: "Beto" },
    ],
    answers,
    results,
    judgments: [],
    actorParticipantId: ids.participantA,
    actorIsAdmin: false,
  };
}

function repository(value: ResultRoundAggregate): ResultRepository {
  return {
    getRound: vi.fn(async () => value),
    mutateResult: vi.fn(async (_c, _r, _q, _u, _n, operation) => {
      operation({
        round: value.round,
        question: value.questions[0]!,
        current: value.results[0] ?? null,
      });
      return value;
    }),
    mutateJudgment: vi.fn(async () => value),
  };
}

describe("scoring application use cases", () => {
  it("reveals peer predictions at the deadline and derives partial totals", async () => {
    const result = await getRoundResults(
      repository(aggregate()),
      { userId: "a" },
      ids.competition,
      ids.round,
      now,
    );
    expect(result?.questions[0]?.entries).toHaveLength(2);
    expect(result?.participants).toMatchObject([
      { name: "Ana", total: 3 },
      { name: "Beto", total: -1 },
    ]);
  });

  it("keeps peer predictions private before the deadline and does not apply penalties", async () => {
    const future = new Date(now.valueOf() + 1);
    const value = aggregate(match(future));
    value.results.splice(0);
    const result = await getRoundResults(
      repository(value),
      { userId: "a" },
      ids.competition,
      ids.round,
      now,
    );
    expect(result?.questions[0]?.entries).toHaveLength(1);
    expect(result?.participants.map((item) => item.total)).toEqual([0, 0]);
  });

  it("rejects anonymous reads and result entry before the deadline", async () => {
    await expect(
      getRoundResults(repository(aggregate()), null, ids.competition, ids.round, now),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const futureValue = aggregate(match(new Date(now.valueOf() + 1)));
    futureValue.results.splice(0);
    await expect(
      recordOfficialResult(
        repository(futureValue),
        { userId: "admin" },
        {
          competitionId: ids.competition,
          roundId: ids.round,
          questionId: ids.question,
          type: "MATCH_SCORE",
          homeScore: 1,
          awayScore: 0,
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("treats identical record/correction retries as idempotent", async () => {
    const repo = repository(aggregate());
    await recordOfficialResult(
      repo,
      { userId: "admin" },
      {
        competitionId: ids.competition,
        roundId: ids.round,
        questionId: ids.question,
        type: "MATCH_SCORE",
        homeScore: 2,
        awayScore: 1,
      },
      now,
    );
    await correctOfficialResult(
      repo,
      { userId: "admin" },
      {
        competitionId: ids.competition,
        roundId: ids.round,
        questionId: ids.question,
        type: "MATCH_SCORE",
        homeScore: 2,
        awayScore: 1,
      },
      now,
    );
    expect(repo.mutateResult).toHaveBeenCalledTimes(2);
  });

  it("validates OPEN_TEXT targets at the application boundary", async () => {
    const repo = repository(aggregate());
    repo.mutateJudgment = vi.fn(async (_c, _r, _a, _u, _n, operation) => {
      operation({
        round: aggregate().round,
        question: aggregate().questions[0]!,
        answer: aggregate().answers[0]!,
        current: null,
      });
      return aggregate();
    });
    await expect(
      judgeOpenTextAnswer(
        repo,
        { userId: "admin" },
        {
          competitionId: ids.competition,
          roundId: ids.round,
          answerId: ids.answer,
          isCorrect: true,
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
