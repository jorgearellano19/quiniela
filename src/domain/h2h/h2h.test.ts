import { describe, expect, it } from "vitest";
import {
  classificationReadiness,
  deriveH2HMatchState,
  deriveH2HOutcome,
  deriveH2HStandingValues,
  generateRoundRobinSchedule,
  validateGroupAssignments,
  validateGroupPhaseConfiguration,
  validateLeaguePhaseConfiguration,
  qualifiedParticipantIds,
  requiredQualifierTieGroups,
} from "./h2h";

describe("H2H regular phases", () => {
  it("validates partial league phases and playoff fields", () => {
    expect(
      validateLeaguePhaseConfiguration({
        participantCount: 10,
        roundCount: 3,
        qualifierCount: 4,
      }),
    ).toMatchObject({ roundCount: 3 });
    expect(() =>
      validateLeaguePhaseConfiguration({
        participantCount: 10,
        roundCount: 10,
        qualifierCount: 4,
      }),
    ).toThrow();
    expect(
      validateGroupPhaseConfiguration({
        participantCount: 16,
        groupSize: 4,
        advancersPerGroup: 2,
      }),
    ).toMatchObject({ groupSize: 4 });
    expect(() =>
      validateGroupPhaseConfiguration({
        participantCount: 8,
        groupSize: 8,
        advancersPerGroup: 1,
      }),
    ).toThrow();
  });

  it.each([2, 3, 4, 5, 8, 15, 30])(
    "generates a complete cycle without duplicate pairs for %i participants",
    (count) => {
      const ids = Array.from({ length: count }, (_, index) => `p${index + 1}`);
      const schedule = generateRoundRobinSchedule(
        ids,
        count % 2 === 0 ? count - 1 : count,
      );
      const pairs = schedule
        .filter((item) => item.participantBId)
        .map((item) => [item.participantAId, item.participantBId!].sort().join(":"));
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(pairs).toHaveLength((count * (count - 1)) / 2);
      for (let slot = 1; slot <= (count % 2 === 0 ? count - 1 : count); slot += 1) {
        const participants = schedule
          .filter((item) => item.slot === slot)
          .flatMap((item) => [item.participantAId, item.participantBId].filter(Boolean));
        expect(new Set(participants).size).toBe(count);
      }
    },
  );

  it("uses the visible order for a partial schedule and distributes odd byes", () => {
    const schedule = generateRoundRobinSchedule(["a", "b", "c", "d", "e"], 3);
    expect(schedule.filter((item) => item.participantBId === null)).toHaveLength(3);
    expect(
      new Set(
        schedule
          .filter((item) => item.participantBId === null)
          .map((item) => item.participantAId),
      ).size,
    ).toBe(3);
  });

  it("requires exact group coverage", () => {
    expect(() =>
      validateGroupAssignments({
        participantIds: ["a", "b", "c", "d"],
        groupSize: 4,
        groups: [{ participantIds: ["a", "b", "c", "c"] }],
      }),
    ).toThrow();
  });

  it("derives 3/1/0 without awarding a bye", () => {
    expect(deriveH2HOutcome({ participantAScore: 8, participantBScore: 3 })).toEqual({
      participantA: { points: 3, win: true },
      participantB: { points: 0, win: false },
    });
    expect(
      deriveH2HOutcome({ participantAScore: 4, participantBScore: 4 }).participantA
        .points,
    ).toBe(1);
    expect(
      deriveH2HOutcome({ participantAScore: 9, participantBScore: null }).participantA
        .points,
    ).toBe(0);
  });

  it("exposes match and qualification states explicitly", () => {
    expect(
      deriveH2HMatchState({
        resultCompleteQuestionCount: 0,
        requiredQuestionCount: 2,
        effectiveRoundStatus: "ACTIVE",
      }),
    ).toBe("POR_JUGAR");
    expect(
      deriveH2HMatchState({
        resultCompleteQuestionCount: 1,
        requiredQuestionCount: 2,
        effectiveRoundStatus: "ACTIVE",
      }),
    ).toBe("PROVISIONAL");
    expect(
      deriveH2HMatchState({
        resultCompleteQuestionCount: 2,
        requiredQuestionCount: 2,
        effectiveRoundStatus: "FINISHED",
      }),
    ).toBe("PROVISIONAL");
    expect(
      deriveH2HMatchState({
        resultCompleteQuestionCount: 2,
        requiredQuestionCount: 2,
        effectiveRoundStatus: "FINALIZED",
      }),
    ).toBe("FINAL");
    expect(
      classificationReadiness({ roundStatuses: ["FINALIZED"], unresolvedTieCount: 1 }),
    ).toBe("PENDING_RESOLUTION");
    expect(
      classificationReadiness({ roundStatuses: ["FINALIZED"], unresolvedTieCount: 0 }),
    ).toBe("OFFICIAL");
    expect(
      qualifiedParticipantIds({
        orderedParticipantIds: ["a", "b", "c"],
        qualifierCount: 2,
        readiness: "OFFICIAL",
      }),
    ).toEqual(["a", "b"]);
    expect(
      qualifiedParticipantIds({
        orderedParticipantIds: ["a", "b"],
        qualifierCount: 1,
        readiness: "PROVISIONAL",
      }),
    ).toEqual([]);
  });

  it("requires only ties that affect the ordered qualifier set", () => {
    expect(
      requiredQualifierTieGroups({
        qualifierCount: 3,
        rows: [
          { participantId: "a", position: 1, unresolved: true },
          { participantId: "b", position: 1, unresolved: true },
          { participantId: "c", position: 3, unresolved: false },
          { participantId: "d", position: 4, unresolved: true },
          { participantId: "e", position: 4, unresolved: true },
        ],
      }),
    ).toEqual([["a", "b"]]);
    expect(
      requiredQualifierTieGroups({
        qualifierCount: 3,
        rows: [
          { participantId: "a", position: 1, unresolved: false },
          { participantId: "b", position: 2, unresolved: false },
          { participantId: "c", position: 3, unresolved: true },
          { participantId: "d", position: 3, unresolved: true },
        ],
      }),
    ).toEqual([["c", "d"]]);
  });

  it("aggregates played matches, points and wins while ignoring byes", () => {
    expect(
      deriveH2HStandingValues({
        participantScores: [
          { participantId: "a", predictionScore: 7, exactScorePoints: 3 },
          { participantId: "b", predictionScore: 4, exactScorePoints: 0 },
        ],
        matchups: [
          {
            participantAId: "a",
            participantBId: "b",
            participantAScore: 7,
            participantBScore: 4,
            hasResult: true,
          },
          {
            participantAId: "a",
            participantBId: null,
            participantAScore: 2,
            participantBScore: null,
            hasResult: true,
          },
        ],
      }),
    ).toEqual([
      {
        participantId: "a",
        predictionScore: 7,
        exactScorePoints: 3,
        h2hPoints: 3,
        played: 1,
        wins: 1,
      },
      {
        participantId: "b",
        predictionScore: 4,
        exactScorePoints: 0,
        h2hPoints: 0,
        played: 1,
        wins: 0,
      },
    ]);
  });
});
