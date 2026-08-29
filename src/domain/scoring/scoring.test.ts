import { describe, expect, it } from "vitest";
import type { Answer } from "@/domain/answer/answer";
import {
  createQuestion,
  createRound,
  type MatchScoreQuestion,
} from "@/domain/round/round";
import {
  calculateQuestionScores,
  decimalMicros,
  isQuestionResultComplete,
  scoreClosestValueAgainstRival,
  scoreClosestValueAgainstAverage,
  scoreMatchAnswer,
  validateOfficialResult,
  type OfficialResult,
} from "./scoring";
import {
  CORRECTION_WINDOW_MS,
  assertResultMutable,
  effectiveRoundStatus,
  finishRound,
} from "./lifecycle";

describe("CLOSEST_VALUE against the bye average", () => {
  it("compares against the exact decimal mean without rounding", () => {
    expect(
      scoreClosestValueAgainstAverage({
        officialValue: "1",
        participantValue: "1.2",
        eligibleOtherValues: ["0", "2.1"],
        points: 1,
        unansweredPenalty: -1,
      }),
    ).toMatchObject({ points: 0 });
    expect(
      scoreClosestValueAgainstAverage({
        officialValue: "1",
        participantValue: "1.01",
        eligibleOtherValues: ["0", "2.1"],
        points: 1,
        unansweredPenalty: -1,
      }),
    ).toMatchObject({ points: 1 });
  });

  it("preserves exact, missing and no-eligible-answer behavior", () => {
    expect(
      scoreClosestValueAgainstAverage({
        officialValue: "5",
        participantValue: "5",
        eligibleOtherValues: ["100"],
        points: 2,
        unansweredPenalty: -1,
      }).points,
    ).toBe(2);
    expect(
      scoreClosestValueAgainstAverage({
        officialValue: "5",
        participantValue: null,
        eligibleOtherValues: ["5"],
        points: 2,
        unansweredPenalty: -1,
      }).points,
    ).toBe(-1);
    expect(
      scoreClosestValueAgainstAverage({
        officialValue: "5",
        participantValue: "4",
        eligibleOtherValues: [],
        points: 2,
        unansweredPenalty: -1,
      }).points,
    ).toBe(0);
  });
});

const now = new Date("2026-08-26T12:00:00.000Z");
const match = createQuestion({
  id: "q",
  roundId: "r",
  sequence: 1,
  type: "MATCH_SCORE",
  homeLabel: "Local",
  awayLabel: "Visita",
  exactScorePoints: 3,
  goalDifferencePoints: 2,
  normalResultPoints: 1,
  deadlineAt: now,
  actorUserId: "u",
}) as MatchScoreQuestion;

function answer(
  participantId: string,
  value: Answer["value"],
  id = participantId,
): Answer {
  return { id, questionId: "q", participantId, value, submittedAt: now, updatedAt: now };
}

function result(value: OfficialResult["value"]): OfficialResult {
  return {
    id: "result",
    questionId: "q",
    value,
    recordedAt: now,
    updatedAt: now,
    updatedByUserId: "u",
  };
}

describe("scoring", () => {
  it("uses the highest successful match rule without stacking", () => {
    expect(
      scoreMatchAnswer(
        match,
        { type: "MATCH_SCORE", homeScore: 3, awayScore: 1 },
        { type: "MATCH_SCORE", homeScore: 3, awayScore: 1 },
      ),
    ).toMatchObject({ points: 3, awardedRule: "EXACT_SCORE" });
    expect(
      scoreMatchAnswer(
        match,
        { type: "MATCH_SCORE", homeScore: 2, awayScore: 0 },
        { type: "MATCH_SCORE", homeScore: 3, awayScore: 1 },
      ),
    ).toMatchObject({ points: 2, awardedRule: "GOAL_DIFFERENCE" });
    expect(
      scoreMatchAnswer(
        match,
        { type: "MATCH_SCORE", homeScore: 1, awayScore: 0 },
        { type: "MATCH_SCORE", homeScore: 3, awayScore: 1 },
      ),
    ).toMatchObject({ points: 1, awardedRule: "NORMAL_RESULT" });
  });

  it("preserves signed goal direction, excludes draws, and supports disabled difference", () => {
    expect(
      scoreMatchAnswer(
        match,
        { type: "MATCH_SCORE", homeScore: 0, awayScore: 2 },
        { type: "MATCH_SCORE", homeScore: 3, awayScore: 1 },
      ).points,
    ).toBe(0);
    expect(
      scoreMatchAnswer(
        match,
        { type: "MATCH_SCORE", homeScore: 1, awayScore: 1 },
        { type: "MATCH_SCORE", homeScore: 2, awayScore: 2 },
      ).awardedRule,
    ).toBe("NORMAL_RESULT");
    expect(
      scoreMatchAnswer(
        { ...match, goalDifferencePoints: null },
        { type: "MATCH_SCORE", homeScore: 2, awayScore: 0 },
        { type: "MATCH_SCORE", homeScore: 3, awayScore: 1 },
      ).awardedRule,
    ).toBe("NORMAL_RESULT");
  });

  it("compares exact decimals without floating point loss", () => {
    expect(decimalMicros("900719925474.000001")).toBe(900719925474000001n);
    expect(decimalMicros("-0.100000")).toBe(-100000n);
  });

  it("awards every equal closest participant and penalizes unanswered only when resolved", () => {
    const question = createQuestion({
      id: "q",
      roundId: "r",
      sequence: 1,
      type: "CLOSEST_VALUE",
      prompt: "Valor",
      points: 2,
      againstRival: false,
      deadlineAt: now,
      actorUserId: "u",
    });
    const answers = [
      answer("a", { type: "CLOSEST_VALUE", value: "9" }),
      answer("b", { type: "CLOSEST_VALUE", value: "11" }),
    ];
    const scores = calculateQuestionScores({
      question,
      participantIds: ["a", "b", "c"],
      answers,
      result: result({ type: "CLOSEST_VALUE", value: "10" }),
      judgments: [],
      unansweredPenalty: -1,
    });
    expect([...scores.values()].map((item) => item.points)).toEqual([2, 2, -1]);
    const pending = calculateQuestionScores({
      question,
      participantIds: ["c"],
      answers: [],
      result: null,
      judgments: [],
      unansweredPenalty: -1,
    });
    expect(pending.get("c")?.state).toBe("PENDING");
  });

  it("handles rival exact, equal non-zero, closer, and unanswered cases", () => {
    expect(
      scoreClosestValueAgainstRival({
        officialValue: "10",
        firstValue: "10",
        secondValue: "10",
        points: 1,
        unansweredPenalty: -1,
      }).map((v) => v.points),
    ).toEqual([1, 1]);
    expect(
      scoreClosestValueAgainstRival({
        officialValue: "10",
        firstValue: "9",
        secondValue: "11",
        points: 1,
        unansweredPenalty: -1,
      }).map((v) => v.points),
    ).toEqual([0, 0]);
    expect(
      scoreClosestValueAgainstRival({
        officialValue: "10",
        firstValue: "10",
        secondValue: "12",
        points: 1,
        unansweredPenalty: -1,
      }).map((v) => v.points),
    ).toEqual([1, 0]);
    expect(
      scoreClosestValueAgainstRival({
        officialValue: "10",
        firstValue: null,
        secondValue: "12",
        points: 1,
        unansweredPenalty: -1,
      }).map((v) => v.points),
    ).toEqual([-1, 1]);
  });

  it("scores options, exact value, OPEN_TEXT, and tiebreaker unanswered", () => {
    const optionQuestion = createQuestion({
      id: "q",
      roundId: "r",
      sequence: 1,
      type: "OPTIONS",
      prompt: "Elige",
      points: 2,
      options: [
        { id: "o1", label: "Uno" },
        { id: "o2", label: "Dos" },
      ],
      deadlineAt: now,
      actorUserId: "u",
    });
    expect(
      calculateQuestionScores({
        question: optionQuestion,
        participantIds: ["a"],
        answers: [answer("a", { type: "OPTIONS", optionId: "o1" })],
        result: result({ type: "OPTIONS", optionId: "o1" }),
        judgments: [],
        unansweredPenalty: -1,
      }).get("a")?.points,
    ).toBe(2);
    const exact = createQuestion({
      id: "q",
      roundId: "r",
      sequence: 1,
      type: "EXACT_VALUE",
      prompt: "Valor",
      points: 3,
      deadlineAt: now,
      actorUserId: "u",
    });
    expect(
      calculateQuestionScores({
        question: exact,
        participantIds: ["a", "b"],
        answers: [answer("a", { type: "EXACT_VALUE", value: "1.0" })],
        result: result({ type: "EXACT_VALUE", value: "1" }),
        judgments: [],
        unansweredPenalty: -1,
        isTiebreaker: true,
      }).get("b")?.points,
    ).toBe(0);
    const open = createQuestion({
      id: "q",
      roundId: "r",
      sequence: 1,
      type: "OPEN_TEXT",
      prompt: "Texto",
      points: 4,
      deadlineAt: now,
      actorUserId: "u",
    });
    const openAnswer = answer("a", { type: "OPEN_TEXT", value: "Respuesta" }, "open");
    expect(
      calculateQuestionScores({
        question: open,
        participantIds: ["a"],
        answers: [openAnswer],
        result: null,
        judgments: [],
        unansweredPenalty: -1,
      }).get("a")?.state,
    ).toBe("PENDING");
    expect(
      calculateQuestionScores({
        question: open,
        participantIds: ["a", "b"],
        answers: [openAnswer],
        result: null,
        judgments: [
          {
            answerId: "open",
            isCorrect: true,
            judgedAt: now,
            updatedAt: now,
            updatedByUserId: "u",
          },
        ],
        unansweredPenalty: -1,
      }).get("b")?.points,
    ).toBe(-1);
  });

  it("validates typed results and OPEN_TEXT completeness", () => {
    expect(
      validateOfficialResult(match, { type: "MATCH_SCORE", homeScore: 1, awayScore: 0 })
        .type,
    ).toBe("MATCH_SCORE");
    expect(() =>
      validateOfficialResult(match, { type: "EXACT_VALUE", value: "1" }),
    ).toThrow();
    const open = createQuestion({
      id: "q",
      roundId: "r",
      sequence: 1,
      type: "OPEN_TEXT",
      prompt: "Texto",
      points: 1,
      deadlineAt: now,
      actorUserId: "u",
    });
    expect(
      isQuestionResultComplete({
        question: open,
        answers: [],
        result: null,
        judgments: [],
      }),
    ).toBe(true);
  });
});

describe("result lifecycle", () => {
  const round = {
    ...createRound({
      id: "r",
      competitionId: "c",
      sequence: 1,
      name: "Uno",
      actorUserId: "u",
      now,
    }),
    status: "ACTIVE" as const,
    publishedAt: now,
  };

  it("opens result entry exactly at the deadline and finishes exactly once", () => {
    expect(() => assertResultMutable(round, now, new Date(now.valueOf() - 1))).toThrow();
    expect(() => assertResultMutable(round, now, now)).not.toThrow();
    const finished = finishRound(round, true, "admin", now);
    expect(finished).toMatchObject({
      status: "FINISHED",
      finishedAt: now,
      updatedByUserId: "admin",
    });
    expect(finishRound(finished, true, "admin", new Date(now.valueOf() + 1))).toBe(
      finished,
    );
  });

  it("enforces effective finalization at the exact 24-hour boundary", () => {
    const finished = finishRound(round, true, "admin", now);
    const before = new Date(now.valueOf() + CORRECTION_WINDOW_MS - 1);
    const boundary = new Date(now.valueOf() + CORRECTION_WINDOW_MS);
    expect(effectiveRoundStatus(finished, before)).toBe("FINISHED");
    expect(effectiveRoundStatus(finished, boundary)).toBe("FINALIZED");
    expect(() => assertResultMutable(finished, now, before)).not.toThrow();
    expect(() => assertResultMutable(finished, now, boundary)).toThrow();
  });
});
