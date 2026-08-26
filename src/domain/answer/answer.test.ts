import { describe, expect, it } from "vitest";
import {
  AnswerDomainError,
  canEditAnswer,
  createAnswer,
  normalizeDecimal,
  updateAnswer,
} from "./answer";
import { createQuestion } from "@/domain/round/round";

const now = new Date("2026-08-26T12:00:00Z");
const common = {
  id: "question",
  roundId: "round",
  sequence: 1,
  deadlineAt: new Date("2026-08-27T12:00:00Z"),
  actorUserId: "user",
  now,
};

describe("Answer", () => {
  it("normalizes signed decimals without rounding", () => {
    expect(normalizeDecimal("-00012.340000")).toBe("-12.34");
    expect(normalizeDecimal("-0.000000")).toBe("0");
    expect(() => normalizeDecimal("1.1234567")).toThrow(AnswerDomainError);
    expect(() => normalizeDecimal("1000000000000")).toThrow(AnswerDomainError);
    expect(() => normalizeDecimal("1e3")).toThrow(AnswerDomainError);
  });

  it("validates every typed Answer shape", () => {
    const match = createQuestion({
      ...common,
      type: "MATCH_SCORE",
      homeLabel: "Local",
      awayLabel: "Visitante",
      exactScorePoints: 3,
      goalDifferencePoints: 2,
      normalResultPoints: 1,
    });
    expect(
      createAnswer({
        id: "answer",
        question: match,
        participantId: "participant",
        value: { type: "MATCH_SCORE", homeScore: 2, awayScore: 1 },
        now,
      }).value,
    ).toEqual({ type: "MATCH_SCORE", homeScore: 2, awayScore: 1 });
    expect(() =>
      createAnswer({
        id: "answer",
        question: match,
        participantId: "participant",
        value: { type: "MATCH_SCORE", homeScore: 1000, awayScore: 0 },
        now,
      }),
    ).toThrow(AnswerDomainError);

    const options = createQuestion({
      ...common,
      type: "OPTIONS",
      prompt: "¿Quién gana?",
      points: 1,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    });
    expect(() =>
      createAnswer({
        id: "answer",
        question: options,
        participantId: "participant",
        value: { type: "OPTIONS", optionId: "forged" },
        now,
      }),
    ).toThrow(AnswerDomainError);

    const text = createQuestion({
      ...common,
      type: "OPEN_TEXT",
      prompt: "Respuesta",
      points: 1,
    });
    expect(
      createAnswer({
        id: "answer",
        question: text,
        participantId: "participant",
        value: { type: "OPEN_TEXT", value: "  Goleador  " },
        now,
      }).value,
    ).toEqual({ type: "OPEN_TEXT", value: "Goleador" });
    expect(() =>
      createAnswer({
        id: "answer",
        question: text,
        participantId: "participant",
        value: { type: "OPEN_TEXT", value: " ".repeat(501) },
        now,
      }),
    ).toThrow(AnswerDomainError);
  });

  it("uses an exclusive deadline and preserves submittedAt on update", () => {
    const question = createQuestion({
      ...common,
      type: "EXACT_VALUE",
      prompt: "Valor",
      points: 1,
    });
    expect(canEditAnswer("ACTIVE", question.deadlineAt, now)).toBe(true);
    expect(canEditAnswer("ACTIVE", question.deadlineAt, question.deadlineAt)).toBe(false);
    expect(canEditAnswer("DRAFT", question.deadlineAt, now)).toBe(false);
    const original = createAnswer({
      id: "answer",
      question,
      participantId: "participant",
      value: { type: "EXACT_VALUE", value: "1" },
      now,
    });
    const changed = updateAnswer(
      original,
      question,
      { type: "EXACT_VALUE", value: "2.50" },
      new Date("2026-08-26T13:00:00Z"),
    );
    expect(changed.submittedAt).toBe(original.submittedAt);
    expect(changed.updatedAt).not.toBe(original.updatedAt);
    expect(changed.value).toEqual({ type: "EXACT_VALUE", value: "2.5" });
  });
});
