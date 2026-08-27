import { describe, expect, it } from "vitest";
import { rankH2H, rankLeague, selectRoundWinner } from "./standings";

const score = (total: number, exactScorePoints: number) => ({
  total,
  exactScorePoints,
  matchQuestionPoints: 0,
  completedAt: null,
});

describe("standings", () => {
  it("uses score then EXACT_SCORE points and competition ranks unresolved groups", () => {
    const result = rankLeague([
      { participantId: "b", score: score(7, 2) },
      { participantId: "c", score: score(5, 9) },
      { participantId: "a", score: score(7, 2) },
    ]);
    expect(
      result.rows.map((row) => [row.position, row.participant.participantId]),
    ).toEqual([
      [1, "b"],
      [1, "a"],
      [3, "c"],
    ]);
    expect(new Set(result.unresolvedGroups[0])).toEqual(new Set(["a", "b"]));
  });

  it("applies a complete manual order without using identifiers as a hidden tiebreaker", () => {
    const values = [
      { participantId: "a", score: score(7, 2) },
      { participantId: "b", score: score(7, 2) },
    ];
    expect(rankLeague(values, [{ participantIds: ["b", "a"] }]).rows).toMatchObject([
      { position: 1, participant: { participantId: "b" }, unresolved: false },
      { position: 2, participant: { participantId: "a" }, unresolved: false },
    ]);
  });

  it("keeps H2H Points distinct and applies every approved ordering level", () => {
    const values = [
      {
        participantId: "a",
        h2hPoints: 4,
        predictionScore: 8,
        exactScorePoints: 2,
        h2hWins: 1,
      },
      {
        participantId: "b",
        h2hPoints: 5,
        predictionScore: 1,
        exactScorePoints: 0,
        h2hWins: 0,
      },
      {
        participantId: "c",
        h2hPoints: 4,
        predictionScore: 8,
        exactScorePoints: 2,
        h2hWins: 2,
      },
    ];
    expect(rankH2H(values).rows.map((row) => row.participant.participantId)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("selects the Round winner through every criterion and ranks incomplete sets last", () => {
    const result = selectRoundWinner({
      ready: true,
      values: [
        {
          participantId: "a",
          roundScore: 8,
          matchQuestionPoints: 4,
          phaseScore: 12,
          completedAt: null,
        },
        {
          participantId: "b",
          roundScore: 8,
          matchQuestionPoints: 4,
          phaseScore: 12,
          completedAt: new Date("2026-01-01"),
        },
      ],
    });
    expect(result).toMatchObject({ state: "resolved", winner: { participantId: "b" } });
  });

  it.each([
    [
      "Round score",
      { roundScore: 2, matchQuestionPoints: 0, phaseScore: 0 },
      { roundScore: 1, matchQuestionPoints: 99, phaseScore: 99 },
    ],
    [
      "Match Question points",
      { roundScore: 2, matchQuestionPoints: 2, phaseScore: 0 },
      { roundScore: 2, matchQuestionPoints: 1, phaseScore: 99 },
    ],
    [
      "phase score",
      { roundScore: 2, matchQuestionPoints: 2, phaseScore: 2 },
      { roundScore: 2, matchQuestionPoints: 2, phaseScore: 1 },
    ],
  ])("uses %s before lower Round-winner criteria", (_name, first, second) => {
    const outcome = selectRoundWinner({
      ready: true,
      values: [
        { participantId: "a", ...first, completedAt: new Date("2026-01-02") },
        { participantId: "b", ...second, completedAt: new Date("2026-01-01") },
      ],
    });
    expect(outcome).toMatchObject({ state: "resolved", winner: { participantId: "a" } });
  });

  it("produces the same unique League order for every input permutation", () => {
    const values = [
      { participantId: "a", score: score(3, 1) },
      { participantId: "b", score: score(2, 9) },
      { participantId: "c", score: score(1, 9) },
    ];
    const permutations = [
      values,
      [values[0]!, values[2]!, values[1]!],
      [values[1]!, values[0]!, values[2]!],
      [values[1]!, values[2]!, values[0]!],
      [values[2]!, values[0]!, values[1]!],
      [values[2]!, values[1]!, values[0]!],
    ];
    for (const permutation of permutations)
      expect(
        rankLeague(permutation).rows.map((row) => row.participant.participantId),
      ).toEqual(["a", "b", "c"]);
  });

  it("returns not-ready and explicit unresolved winner states", () => {
    expect(selectRoundWinner({ ready: false, values: [] })).toEqual({
      state: "notReady",
    });
    expect(
      selectRoundWinner({
        ready: true,
        values: [
          {
            participantId: "a",
            roundScore: 1,
            matchQuestionPoints: 1,
            phaseScore: 1,
            completedAt: null,
          },
          {
            participantId: "b",
            roundScore: 1,
            matchQuestionPoints: 1,
            phaseScore: 1,
            completedAt: null,
          },
        ],
      }),
    ).toEqual({ state: "unresolved", tiedParticipantIds: ["a", "b"] });
  });

  it("rejects duplicate participants", () => {
    expect(() =>
      rankLeague([
        { participantId: "a", score: score(1, 1) },
        { participantId: "a", score: score(2, 2) },
      ]),
    ).toThrow("Duplicate participant");
  });
});
