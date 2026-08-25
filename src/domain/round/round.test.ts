import { describe, expect, it } from "vitest";
import {
  createQuestion,
  createRound,
  publishRound,
  RoundDomainError,
  updateRound,
} from "./round";
const now = new Date("2026-08-25T12:00:00Z");
const round = createRound({
  id: "r",
  competitionId: "c",
  sequence: 1,
  name: " Jornada 1 ",
  actorUserId: "u",
  now,
});
const common = {
  id: "q",
  roundId: "r",
  sequence: 1,
  prompt: "Marcador",
  deadlineAt: new Date("2026-08-26T12:00:00Z"),
  actorUserId: "u",
  now,
};
describe("Round", () => {
  it("creates and updates a draft with approved defaults", () => {
    expect(round.name).toBe("Jornada 1");
    expect(round.unansweredPenalty).toBe(-1);
    expect(
      updateRound(round, {
        sequence: 2,
        name: "Dos",
        unansweredPenalty: 0,
        actorUserId: "u",
        now,
      }).sequence,
    ).toBe(2);
  });
  it("validates all five typed question families", () => {
    expect(
      createQuestion({
        ...common,
        type: "MATCH_SCORE",
        prompt: null,
        homeLabel: "México",
        awayLabel: "Canadá",
        exactScorePoints: 3,
        goalDifferencePoints: 2,
        normalResultPoints: 1,
      }).type,
    ).toBe("MATCH_SCORE");
    expect(
      createQuestion({ ...common, type: "CLOSEST_VALUE", points: 1, againstRival: true })
        .type,
    ).toBe("CLOSEST_VALUE");
    expect(
      createQuestion({ ...common, type: "OPTIONS", points: 1, options: ["A", "B"] }).type,
    ).toBe("OPTIONS");
    expect(createQuestion({ ...common, type: "OPEN_TEXT", points: 1 }).type).toBe(
      "OPEN_TEXT",
    );
    expect(createQuestion({ ...common, type: "EXACT_VALUE", points: 1 }).type).toBe(
      "EXACT_VALUE",
    );
  });
  it("rejects invalid match hierarchy and duplicate options", () => {
    expect(() =>
      createQuestion({
        ...common,
        type: "MATCH_SCORE",
        prompt: null,
        homeLabel: "A",
        awayLabel: "B",
        exactScorePoints: 2,
        goalDifferencePoints: 2,
        normalResultPoints: 1,
      }),
    ).toThrow(RoundDomainError);
    expect(() =>
      createQuestion({ ...common, type: "OPTIONS", points: 1, options: [" A ", "a"] }),
    ).toThrow(RoundDomainError);
  });
  it("enforces text, sequence, point, penalty, and option limits", () => {
    expect(() =>
      createRound({
        id: "r2",
        competitionId: "c",
        sequence: 0,
        name: "Uno",
        actorUserId: "u",
      }),
    ).toThrow(RoundDomainError);
    expect(() =>
      createRound({
        id: "r2",
        competitionId: "c",
        sequence: 1,
        name: " ",
        actorUserId: "u",
      }),
    ).toThrow(RoundDomainError);
    expect(() => createQuestion({ ...common, type: "OPEN_TEXT", points: 101 })).toThrow(
      RoundDomainError,
    );
    expect(() =>
      createQuestion({
        ...common,
        type: "OPTIONS",
        points: 1,
        options: Array.from({ length: 21 }, (_, index) => `Opción ${index}`),
      }),
    ).toThrow(RoundDomainError);
  });
  it("requires distinct match labels and validates disabled goal-difference ordering", () => {
    expect(() =>
      createQuestion({
        ...common,
        type: "MATCH_SCORE",
        prompt: null,
        homeLabel: "México",
        awayLabel: " méxico ",
        exactScorePoints: 3,
        goalDifferencePoints: 2,
        normalResultPoints: 1,
      }),
    ).toThrow(RoundDomainError);
    expect(() =>
      createQuestion({
        ...common,
        type: "MATCH_SCORE",
        prompt: null,
        homeLabel: "A",
        awayLabel: "B",
        exactScorePoints: 1,
        goalDifferencePoints: null,
        normalResultPoints: 1,
      }),
    ).toThrow(RoundDomainError);
  });
  it("publishes atomically, freezes, and is idempotent", () => {
    const q = createQuestion({ ...common, type: "OPEN_TEXT", points: 1 });
    const active = publishRound(round, [q], now);
    expect(active.status).toBe("ACTIVE");
    expect(publishRound(active, [q], now)).toBe(active);
    expect(() =>
      updateRound(active, {
        sequence: 1,
        name: "x",
        unansweredPenalty: -1,
        actorUserId: "u",
      }),
    ).toThrow(RoundDomainError);
  });
  it("requires questions with future deadlines", () => {
    expect(() => publishRound(round, [], now)).toThrow(RoundDomainError);
    expect(() =>
      publishRound(
        round,
        [createQuestion({ ...common, type: "OPEN_TEXT", points: 1, deadlineAt: now })],
        now,
      ),
    ).toThrow(RoundDomainError);
  });
});
