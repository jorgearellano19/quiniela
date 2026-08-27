import { describe, expect, it, vi } from "vitest";
import type { Answer } from "@/domain/answer/answer";
import { createQuestion, createRound } from "@/domain/round/round";
import type { OfficialResult } from "@/domain/scoring/scoring";
import {
  getLeagueStandings,
  getLeagueWinner,
  resolveRankingTie,
  type StandingsAggregate,
  type StandingsRepository,
} from "./use-cases";

const ids = {
  competition: "00000000-0000-4000-8000-000000000001",
  round: "00000000-0000-4000-8000-000000000002",
  question: "00000000-0000-4000-8000-000000000003",
  participantA: "00000000-0000-4000-8000-000000000004",
  participantB: "00000000-0000-4000-8000-000000000005",
  answerA: "00000000-0000-4000-8000-000000000006",
  answerB: "00000000-0000-4000-8000-000000000007",
};
const now = new Date("2026-08-26T12:00:00.000Z");

function aggregate(tied = false): StandingsAggregate {
  const base = createRound({
    id: ids.round,
    competitionId: ids.competition,
    sequence: 1,
    name: "Uno",
    actorUserId: "admin",
    now,
  });
  const round = {
    ...base,
    status: "FINISHED" as const,
    publishedAt: new Date(now.valueOf() - 172_800_000),
    finishedAt: new Date(now.valueOf() - 86_400_000),
  };
  const question = createQuestion({
    id: ids.question,
    roundId: ids.round,
    sequence: 1,
    type: "MATCH_SCORE",
    homeLabel: "Local",
    awayLabel: "Visita",
    exactScorePoints: 3,
    goalDifferencePoints: 2,
    normalResultPoints: 1,
    deadlineAt: new Date(now.valueOf() - 172_800_000),
    actorUserId: "admin",
    now,
  });
  const answers: Answer[] = [
    {
      id: ids.answerA,
      questionId: ids.question,
      participantId: ids.participantA,
      value: { type: "MATCH_SCORE", homeScore: 2, awayScore: 1 },
      submittedAt: new Date(now.valueOf() - 200_000_000),
      updatedAt: now,
    },
    {
      id: ids.answerB,
      questionId: ids.question,
      participantId: ids.participantB,
      value: tied
        ? { type: "MATCH_SCORE", homeScore: 2, awayScore: 1 }
        : { type: "MATCH_SCORE", homeScore: 1, awayScore: 0 },
      submittedAt: new Date(now.valueOf() - 199_000_000),
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
    competition: {
      id: ids.competition,
      name: "Liga",
      type: "LEAGUE",
      status: "STARTED",
    },
    participants: [
      { id: ids.participantA, name: "Ana", email: "ana@example.test" },
      { id: ids.participantB, name: "Beto", email: "beto@example.test" },
    ],
    rounds: [{ round, questions: [question], answers, results, judgments: [] }],
    resolutions: [],
    actorIsAdmin: true,
  };
}

function repository(value: StandingsAggregate): StandingsRepository {
  return {
    getCompetition: vi.fn(async () => value),
    resolve: vi.fn(async (_competitionId, _userId, _now, operation) => {
      operation(value);
      return value;
    }),
  };
}

describe("standings application", () => {
  it("derives a stable League classification and winner from source facts", async () => {
    const result = await getLeagueStandings(
      repository(aggregate()),
      { userId: "admin" },
      ids.competition,
      now,
    );
    expect(result).toMatchObject({
      ready: true,
      winner: { id: ids.participantA, name: "Ana" },
      rows: [
        { participantId: ids.participantA, predictionScore: 3, exactScorePoints: 3 },
        { participantId: ids.participantB, predictionScore: 2, exactScorePoints: 0 },
      ],
    });
    await expect(
      getLeagueWinner(repository(aggregate()), { userId: "admin" }, ids.competition, now),
    ).resolves.toMatchObject({ state: "resolved", winner: { id: ids.participantA } });
  });

  it("recomputes the classification after an Official Result correction", async () => {
    const before = aggregate();
    const corrected = {
      ...before,
      rounds: before.rounds.map((item) => ({
        ...item,
        results: item.results.map((result) => ({
          ...result,
          value: { type: "MATCH_SCORE" as const, homeScore: 1, awayScore: 0 },
          updatedAt: new Date(now.valueOf() + 1),
        })),
      })),
    };
    const result = await getLeagueStandings(
      repository(corrected),
      { userId: "admin" },
      ids.competition,
      now,
    );
    expect(result?.rows.map((row) => row.participantId)).toEqual([
      ids.participantB,
      ids.participantA,
    ]);
  });

  it("blocks the winner while a DRAFT Round exists", async () => {
    const value = aggregate();
    const draft = createRound({
      id: "00000000-0000-4000-8000-000000000008",
      competitionId: ids.competition,
      sequence: 2,
      name: "Dos",
      actorUserId: "admin",
      now,
    });
    const withDraft = {
      ...value,
      rounds: [
        ...value.rounds,
        { round: draft, questions: [], answers: [], results: [], judgments: [] },
      ],
    };
    const result = await getLeagueStandings(
      repository(withDraft),
      { userId: "admin" },
      ids.competition,
      now,
    );
    expect(result).toMatchObject({ ready: false, winner: null });
  });

  it("requires Admin authority and an exact current tied group", async () => {
    const nonAdmin = { ...aggregate(true), actorIsAdmin: false };
    await expect(
      resolveRankingTie(
        repository(nonAdmin),
        { userId: "participant" },
        {
          competitionId: ids.competition,
          scope: "LEAGUE_STANDINGS",
          participantIds: [ids.participantA, ids.participantB],
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      resolveRankingTie(
        repository(aggregate(true)),
        { userId: "admin" },
        {
          competitionId: ids.competition,
          scope: "LEAGUE_STANDINGS",
          participantIds: [ids.participantA, "00000000-0000-4000-8000-000000000099"],
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects anonymous and cross-Competition resolution attempts", async () => {
    const input = {
      competitionId: ids.competition,
      scope: "LEAGUE_STANDINGS",
      participantIds: [ids.participantA, ids.participantB],
    };
    await expect(
      resolveRankingTie(repository(aggregate(true)), null, input, now),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const crossCompetition: StandingsRepository = {
      getCompetition: vi.fn(async () => null),
      resolve: vi.fn(async () => null),
    };
    await expect(
      resolveRankingTie(crossCompetition, { userId: "admin" }, input, now),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("creates an audited whole-group resolution write", async () => {
    const repo = repository(aggregate(true));
    await resolveRankingTie(
      repo,
      { userId: "admin" },
      {
        competitionId: ids.competition,
        scope: "LEAGUE_STANDINGS",
        participantIds: [ids.participantB, ids.participantA],
      },
      now,
    );
    expect(repo.resolve).toHaveBeenCalledOnce();
  });
});
