import type { Question, RoundStatus } from "@/domain/round/round";

export type AnswerValue =
  | Readonly<{ type: "MATCH_SCORE"; homeScore: number; awayScore: number }>
  | Readonly<{ type: "CLOSEST_VALUE" | "EXACT_VALUE"; value: string }>
  | Readonly<{ type: "OPTIONS"; optionId: string }>
  | Readonly<{ type: "OPEN_TEXT"; value: string }>;

export type Answer = Readonly<{
  id: string;
  questionId: string;
  participantId: string;
  value: AnswerValue;
  submittedAt: Date;
  updatedAt: Date;
}>;

export class AnswerDomainError extends Error {}

export function normalizeDecimal(input: string): string {
  const value = input.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(value))
    throw new AnswerDomainError("Invalid numeric Answer.");
  const negative = value.startsWith("-");
  const [rawInteger = "", rawFraction = ""] = (negative ? value.slice(1) : value).split(
    ".",
  );
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  if (integer.length > 12 || rawFraction.length > 6)
    throw new AnswerDomainError("Invalid numeric Answer precision.");
  const fraction = rawFraction.replace(/0+$/, "");
  const normalized = fraction ? `${integer}.${fraction}` : integer;
  return negative && normalized !== "0" ? `-${normalized}` : normalized;
}

export function validateAnswerValue(question: Question, input: AnswerValue): AnswerValue {
  if (question.type !== input.type)
    throw new AnswerDomainError("Answer type does not match Question.");
  if (input.type === "MATCH_SCORE") {
    if (
      !Number.isInteger(input.homeScore) ||
      !Number.isInteger(input.awayScore) ||
      input.homeScore < 0 ||
      input.homeScore > 999 ||
      input.awayScore < 0 ||
      input.awayScore > 999
    )
      throw new AnswerDomainError("Invalid match Answer.");
    return input;
  }
  if (input.type === "CLOSEST_VALUE" || input.type === "EXACT_VALUE")
    return { ...input, value: normalizeDecimal(input.value) };
  if (input.type === "OPTIONS") {
    if (question.type !== "OPTIONS")
      throw new AnswerDomainError("Answer type does not match Question.");
    if (!question.options.some((option) => option.id === input.optionId))
      throw new AnswerDomainError("Invalid option Answer.");
    return input;
  }
  const value = input.value.trim();
  if (!value || value.length > 500)
    throw new AnswerDomainError("Invalid open-text Answer.");
  return { ...input, value };
}

export function canEditAnswer(roundStatus: RoundStatus, deadlineAt: Date, now: Date) {
  return roundStatus === "ACTIVE" && now.valueOf() < deadlineAt.valueOf();
}

export function createAnswer(input: {
  id: string;
  question: Question;
  participantId: string;
  value: AnswerValue;
  now: Date;
}): Answer {
  return {
    id: input.id,
    questionId: input.question.id,
    participantId: input.participantId,
    value: validateAnswerValue(input.question, input.value),
    submittedAt: input.now,
    updatedAt: input.now,
  };
}

export function updateAnswer(
  answer: Answer,
  question: Question,
  value: AnswerValue,
  now: Date,
): Answer {
  if (answer.questionId !== question.id)
    throw new AnswerDomainError("Answer does not belong to Question.");
  return { ...answer, value: validateAnswerValue(question, value), updatedAt: now };
}
