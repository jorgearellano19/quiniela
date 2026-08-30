import { describe, expect, it } from "vitest";
import {
  expectedPlayoffRoundCount,
  generatePlayoffPairings,
  isCompletePlayoffBracket,
  resolvePlayoffWinner,
  validatePlayoffSeeds,
} from "./playoff";

const seeds = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    participantId: `p${index + 1}`,
    seed: index + 1,
  }));

describe("playoffs", () => {
  it.each([2, 4, 8, 16, 32])("pairs a %i field high against low", (count) => {
    const pairings = generatePlayoffPairings(seeds(count));
    expect(pairings).toHaveLength(count / 2);
    expect(pairings[0]).toMatchObject({ participantASeed: 1, participantBSeed: count });
    expect(
      new Set(pairings.flatMap((item) => [item.participantAId, item.participantBId]))
        .size,
    ).toBe(count);
    expect(expectedPlayoffRoundCount(count)).toBe(Math.log2(count));
  });

  it("rejects invalid or duplicate seed fields", () => {
    expect(() => validatePlayoffSeeds(seeds(3))).toThrow();
    expect(() =>
      validatePlayoffSeeds([
        { participantId: "p1", seed: 1 },
        { participantId: "p1", seed: 2 },
      ]),
    ).toThrow();
  });

  it("requires a contiguous finalized bracket with persisted advancement", () => {
    expect(
      isCompletePlayoffBracket({
        seeds: seeds(4),
        rounds: [
          {
            sequence: 1,
            finalized: true,
            advancementConfirmed: true,
            matchups: [
              { participantAId: "p1", participantBId: "p4", winnerParticipantId: "p1" },
              { participantAId: "p2", participantBId: "p3", winnerParticipantId: "p2" },
            ],
          },
          {
            sequence: 2,
            finalized: true,
            advancementConfirmed: true,
            matchups: [
              { participantAId: "p1", participantBId: "p2", winnerParticipantId: "p1" },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      isCompletePlayoffBracket({
        seeds: seeds(4),
        rounds: [
          {
            sequence: 1,
            finalized: true,
            advancementConfirmed: true,
            matchups: [
              { participantAId: "p1", participantBId: "p4", winnerParticipantId: "p1" },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("uses score before either advancement mode", () => {
    expect(
      resolvePlayoffWinner({
        participantAId: "a",
        participantASeed: 1,
        participantAScore: 4,
        participantBId: "b",
        participantBSeed: 8,
        participantBScore: 2,
        mode: "BEST_SEED",
      }),
    ).toMatchObject({ participantId: "a", decidedBy: "SCORE" });
  });

  it("uses the better original seed after a tied score", () => {
    expect(
      resolvePlayoffWinner({
        participantAId: "a",
        participantASeed: 2,
        participantAScore: 3,
        participantBId: "b",
        participantBSeed: 7,
        participantBScore: 3,
        mode: "BEST_SEED",
      }),
    ).toMatchObject({ participantId: "a", decidedBy: "SEED" });
  });

  it("compares tiebreaker points and leaves equal points unresolved", () => {
    const base = {
      participantAId: "a",
      participantASeed: 2,
      participantAScore: 3,
      participantATiebreakerPoints: 1,
      participantBId: "b",
      participantBSeed: 7,
      participantBScore: 3,
      mode: "TIEBREAKER_QUESTION" as const,
    };
    expect(
      resolvePlayoffWinner({ ...base, participantBTiebreakerPoints: 0 }),
    ).toMatchObject({ participantId: "a", decidedBy: "TIEBREAKER" });
    expect(resolvePlayoffWinner({ ...base, participantBTiebreakerPoints: 1 })).toEqual({
      state: "UNRESOLVED",
    });
  });
});
