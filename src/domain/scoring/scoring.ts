import { normalizeDecimal, type Answer } from "@/domain/answer/answer";
import type { Question } from "@/domain/round/round";

export type OfficialResultValue =
  | Readonly<{ type: "MATCH_SCORE"; homeScore: number; awayScore: number }>
  | Readonly<{ type: "CLOSEST_VALUE"; value: string }>
  | Readonly<{ type: "EXACT_VALUE"; value: string }>
  | Readonly<{ type: "OPTIONS"; optionId: string }>;

export type OfficialResult = Readonly<{
  id: string;
  questionId: string;
  value: OfficialResultValue;
  recordedAt: Date;
  updatedAt: Date;
  updatedByUserId: string;
}>;

export type OpenTextJudgment = Readonly<{
  answerId: string;
  isCorrect: boolean;
  judgedAt: Date;
  updatedAt: Date;
  updatedByUserId: string;
}>;

export type AwardedRule =
  | "EXACT_SCORE"
  | "GOAL_DIFFERENCE"
  | "NORMAL_RESULT"
  | "CLOSEST_VALUE"
  | "OPTIONS"
  | "OPEN_TEXT"
  | "EXACT_VALUE"
  | "UNANSWERED"
  | "NO_POINTS";

export type QuestionScore = Readonly<{
  state: "PENDING" | "SCORED";
  points: number | null;
  awardedRule: AwardedRule | null;
}>;

export type PredictionScoreBreakdown = Readonly<{
  total: number;
  exactScorePoints: number;
  matchQuestionPoints: number;
  completedAt: Date | null;
}>;

export class ScoringDomainError extends Error {}

const pending = (): QuestionScore => ({
  state: "PENDING",
  points: null,
  awardedRule: null,
});

function scored(points: number, awardedRule: AwardedRule): QuestionScore {
  return { state: "SCORED", points, awardedRule };
}

function outcome(home: number, away: number) {
  return Math.sign(home - away);
}

function validateMatch(value: { homeScore: number; awayScore: number }) {
  if (
    !Number.isInteger(value.homeScore) ||
    !Number.isInteger(value.awayScore) ||
    value.homeScore < 0 ||
    value.homeScore > 999 ||
    value.awayScore < 0 ||
    value.awayScore > 999
  )
    throw new ScoringDomainError("Invalid match score.");
}

export function validateOfficialResult(
  question: Question,
  value: OfficialResultValue,
): OfficialResultValue {
  if (question.type === "OPEN_TEXT" || question.type !== value.type)
    throw new ScoringDomainError("Result type does not match Question.");
  if (value.type === "MATCH_SCORE") {
    validateMatch(value);
    return value;
  }
  if (value.type === "CLOSEST_VALUE" || value.type === "EXACT_VALUE")
    return { ...value, value: normalizeDecimal(value.value) };
  if (
    question.type !== "OPTIONS" ||
    !question.options.some((o) => o.id === value.optionId)
  )
    throw new ScoringDomainError("Invalid result option.");
  return value;
}

export function officialResultValuesEqual(
  left: OfficialResultValue,
  right: OfficialResultValue,
) {
  if (left.type !== right.type) return false;
  if (left.type === "MATCH_SCORE" && right.type === "MATCH_SCORE")
    return left.homeScore === right.homeScore && left.awayScore === right.awayScore;
  if (left.type === "OPTIONS" && right.type === "OPTIONS")
    return left.optionId === right.optionId;
  if (
    (left.type === "CLOSEST_VALUE" || left.type === "EXACT_VALUE") &&
    (right.type === "CLOSEST_VALUE" || right.type === "EXACT_VALUE")
  )
    return (
      left.type === right.type && decimalMicros(left.value) === decimalMicros(right.value)
    );
  return false;
}

export function scoreMatchAnswer(
  question: Extract<Question, { type: "MATCH_SCORE" }>,
  answer: Extract<Answer["value"], { type: "MATCH_SCORE" }>,
  result: Extract<OfficialResultValue, { type: "MATCH_SCORE" }>,
): QuestionScore {
  validateMatch(answer);
  validateMatch(result);
  if (answer.homeScore === result.homeScore && answer.awayScore === result.awayScore)
    return scored(question.exactScorePoints, "EXACT_SCORE");
  const resultOutcome = outcome(result.homeScore, result.awayScore);
  if (
    question.goalDifferencePoints !== null &&
    resultOutcome !== 0 &&
    outcome(answer.homeScore, answer.awayScore) === resultOutcome &&
    answer.homeScore - answer.awayScore === result.homeScore - result.awayScore
  )
    return scored(question.goalDifferencePoints, "GOAL_DIFFERENCE");
  if (outcome(answer.homeScore, answer.awayScore) === resultOutcome)
    return scored(question.normalResultPoints, "NORMAL_RESULT");
  return scored(0, "NO_POINTS");
}

export function decimalMicros(value: string): bigint {
  const normalized = normalizeDecimal(value);
  const negative = normalized.startsWith("-");
  const [integer = "0", fraction = ""] = (
    negative ? normalized.slice(1) : normalized
  ).split(".");
  const micros = BigInt(integer) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  return negative ? -micros : micros;
}

function distance(left: string, right: string) {
  const value = decimalMicros(left) - decimalMicros(right);
  return value < 0n ? -value : value;
}

export function scoreClosestValueAgainstRival(input: {
  officialValue: string;
  firstValue: string | null;
  secondValue: string | null;
  points: number;
  unansweredPenalty: -1 | 0;
}): readonly [QuestionScore, QuestionScore] {
  const missing = scored(input.unansweredPenalty, "UNANSWERED");
  if (input.firstValue === null && input.secondValue === null) return [missing, missing];
  if (input.firstValue === null) return [missing, scored(input.points, "CLOSEST_VALUE")];
  if (input.secondValue === null) return [scored(input.points, "CLOSEST_VALUE"), missing];
  const first = distance(input.firstValue, input.officialValue);
  const second = distance(input.secondValue, input.officialValue);
  if (first === 0n && second === 0n)
    return [scored(input.points, "CLOSEST_VALUE"), scored(input.points, "CLOSEST_VALUE")];
  if (first === second) return [scored(0, "NO_POINTS"), scored(0, "NO_POINTS")];
  return first < second
    ? [scored(input.points, "CLOSEST_VALUE"), scored(0, "NO_POINTS")]
    : [scored(0, "NO_POINTS"), scored(input.points, "CLOSEST_VALUE")];
}

export function scoreClosestValueAgainstAverage(input: {
  officialValue: string;
  participantValue: string | null;
  eligibleOtherValues: readonly string[];
  points: number;
  unansweredPenalty: -1 | 0;
}): QuestionScore {
  if (input.participantValue === null)
    return scored(input.unansweredPenalty, "UNANSWERED");
  if (input.eligibleOtherValues.length === 0) return scored(0, "NO_POINTS");
  const official = decimalMicros(input.officialValue);
  const own = decimalMicros(input.participantValue);
  if (own === official) return scored(input.points, "CLOSEST_VALUE");
  const count = BigInt(input.eligibleOtherValues.length);
  const sum = input.eligibleOtherValues.reduce(
    (total, value) => total + decimalMicros(value),
    0n,
  );
  // Compare exact rational distances without rounding the arithmetic mean.
  const ownDistanceScaled = (own > official ? own - official : official - own) * count;
  const averageDistanceScaled =
    sum > official * count ? sum - official * count : official * count - sum;
  return ownDistanceScaled < averageDistanceScaled
    ? scored(input.points, "CLOSEST_VALUE")
    : scored(0, "NO_POINTS");
}

export function calculateQuestionScores(input: {
  question: Question;
  participantIds: readonly string[];
  answers: readonly Answer[];
  result: OfficialResult | null;
  judgments: readonly OpenTextJudgment[];
  unansweredPenalty: -1 | 0;
  isTiebreaker?: boolean;
}): ReadonlyMap<string, QuestionScore> {
  const byParticipant = new Map(input.answers.map((a) => [a.participantId, a]));
  const penalty = input.isTiebreaker ? 0 : input.unansweredPenalty;
  const scores = new Map<string, QuestionScore>();
  if (input.question.type === "OPEN_TEXT") {
    const byAnswer = new Map(input.judgments.map((j) => [j.answerId, j]));
    if (input.answers.some((answer) => !byAnswer.has(answer.id))) {
      for (const id of input.participantIds) scores.set(id, pending());
      return scores;
    }
    for (const id of input.participantIds) {
      const answer = byParticipant.get(id);
      scores.set(
        id,
        answer
          ? scored(
              byAnswer.get(answer.id)!.isCorrect ? input.question.points : 0,
              byAnswer.get(answer.id)!.isCorrect ? "OPEN_TEXT" : "NO_POINTS",
            )
          : scored(penalty, "UNANSWERED"),
      );
    }
    return scores;
  }
  if (!input.result) {
    for (const id of input.participantIds) scores.set(id, pending());
    return scores;
  }
  if (input.question.type !== input.result.value.type)
    throw new ScoringDomainError("Persisted result type does not match Question.");
  if (input.question.type === "CLOSEST_VALUE" && input.question.againstRival)
    throw new ScoringDomainError("Rival context is required.");
  let closest = new Set<string>();
  if (input.question.type === "CLOSEST_VALUE") {
    const official = input.result.value as Extract<
      OfficialResultValue,
      { type: "CLOSEST_VALUE" }
    >;
    const distances = input.answers.map((answer) => ({
      participantId: answer.participantId,
      value: distance((answer.value as { value: string }).value, official.value),
    }));
    const minimum = distances.reduce<bigint | null>(
      (current, item) =>
        current === null || item.value < current ? item.value : current,
      null,
    );
    closest = new Set(
      distances
        .filter((item) => item.value === minimum)
        .map((item) => item.participantId),
    );
  }
  for (const id of input.participantIds) {
    const answer = byParticipant.get(id);
    if (!answer) {
      scores.set(id, scored(penalty, "UNANSWERED"));
      continue;
    }
    if (input.question.type === "MATCH_SCORE") {
      scores.set(
        id,
        scoreMatchAnswer(
          input.question,
          answer.value as Extract<Answer["value"], { type: "MATCH_SCORE" }>,
          input.result.value as Extract<OfficialResultValue, { type: "MATCH_SCORE" }>,
        ),
      );
    } else if (input.question.type === "CLOSEST_VALUE") {
      scores.set(
        id,
        closest.has(id)
          ? scored(input.question.points, "CLOSEST_VALUE")
          : scored(0, "NO_POINTS"),
      );
    } else if (input.question.type === "OPTIONS") {
      const correct =
        (answer.value as Extract<Answer["value"], { type: "OPTIONS" }>).optionId ===
        (input.result.value as Extract<OfficialResultValue, { type: "OPTIONS" }>)
          .optionId;
      scores.set(
        id,
        scored(correct ? input.question.points : 0, correct ? "OPTIONS" : "NO_POINTS"),
      );
    } else {
      const correct =
        decimalMicros((answer.value as { value: string }).value) ===
        decimalMicros(
          (input.result.value as Extract<OfficialResultValue, { type: "EXACT_VALUE" }>)
            .value,
        );
      scores.set(
        id,
        scored(
          correct ? input.question.points : 0,
          correct ? "EXACT_VALUE" : "NO_POINTS",
        ),
      );
    }
  }
  return scores;
}

export function isQuestionResultComplete(input: {
  question: Question;
  answers: readonly Answer[];
  result: OfficialResult | null;
  judgments: readonly OpenTextJudgment[];
}) {
  if (input.question.type !== "OPEN_TEXT") return input.result !== null;
  const judged = new Set(input.judgments.map((item) => item.answerId));
  return input.answers.every((answer) => judged.has(answer.id));
}

export function calculateRoundScoreBreakdowns(input: {
  questions: readonly Question[];
  participantIds: readonly string[];
  answers: readonly Answer[];
  results: readonly OfficialResult[];
  judgments: readonly OpenTextJudgment[];
  unansweredPenalty: -1 | 0;
  now: Date;
  rivalParticipantIdByParticipant?: ReadonlyMap<string, string | null>;
}): Readonly<{
  supported: boolean;
  byParticipant: ReadonlyMap<string, PredictionScoreBreakdown>;
}> {
  const mutable = new Map(
    input.participantIds.map((participantId) => [
      participantId,
      {
        total: 0,
        exactScorePoints: 0,
        matchQuestionPoints: 0,
        completedAt: null as Date | null,
      },
    ]),
  );
  let supported = true;
  for (const question of input.questions) {
    if (input.now.valueOf() < question.deadlineAt.valueOf()) continue;
    let scores: ReadonlyMap<string, QuestionScore>;
    if (question.type === "CLOSEST_VALUE" && question.againstRival) {
      const rivals = input.rivalParticipantIdByParticipant;
      const result = input.results.find((item) => item.questionId === question.id);
      if (!rivals) {
        supported = false;
        continue;
      }
      if (!result) continue;
      if (result.value.type !== "CLOSEST_VALUE")
        throw new ScoringDomainError("Persisted result type does not match Question.");
      const answers = new Map(
        input.answers
          .filter((answer) => answer.questionId === question.id)
          .map((answer) => [
            answer.participantId,
            (answer.value as { value: string }).value,
          ]),
      );
      const calculated = new Map<string, QuestionScore>();
      for (const participantId of input.participantIds) {
        const rivalId = rivals.get(participantId);
        if (rivalId === undefined) {
          supported = false;
          continue;
        }
        if (rivalId === null) {
          calculated.set(
            participantId,
            scoreClosestValueAgainstAverage({
              officialValue: result.value.value,
              participantValue: answers.get(participantId) ?? null,
              eligibleOtherValues: input.participantIds
                .filter((id) => id !== participantId)
                .flatMap((id) => {
                  const value = answers.get(id);
                  return value === undefined ? [] : [value];
                }),
              points: question.points,
              unansweredPenalty: input.unansweredPenalty,
            }),
          );
        } else {
          const pair = scoreClosestValueAgainstRival({
            officialValue: result.value.value,
            firstValue: answers.get(participantId) ?? null,
            secondValue: answers.get(rivalId) ?? null,
            points: question.points,
            unansweredPenalty: input.unansweredPenalty,
          });
          calculated.set(participantId, pair[0]);
        }
      }
      scores = calculated;
    } else
      scores = calculateQuestionScores({
        question,
        participantIds: input.participantIds,
        answers: input.answers.filter((answer) => answer.questionId === question.id),
        result: input.results.find((result) => result.questionId === question.id) ?? null,
        judgments: input.judgments,
        unansweredPenalty: input.unansweredPenalty,
      });
    for (const [participantId, score] of scores) {
      if (score.state !== "SCORED") continue;
      const current = mutable.get(participantId);
      if (!current) throw new ScoringDomainError("Unknown participant score.");
      current.total += score.points ?? 0;
      if (score.awardedRule === "EXACT_SCORE")
        current.exactScorePoints += score.points ?? 0;
      if (question.type === "MATCH_SCORE")
        current.matchQuestionPoints += score.points ?? 0;
    }
  }
  for (const participantId of input.participantIds) {
    const participantAnswers = input.answers.filter(
      (answer) => answer.participantId === participantId,
    );
    const questionIds = new Set(participantAnswers.map((answer) => answer.questionId));
    if (
      input.questions.length > 0 &&
      input.questions.every((q) => questionIds.has(q.id))
    ) {
      const latest = participantAnswers.reduce<Date | null>(
        (value, answer) =>
          value === null || answer.submittedAt.valueOf() > value.valueOf()
            ? answer.submittedAt
            : value,
        null,
      );
      mutable.get(participantId)!.completedAt = latest;
    }
  }
  return { supported, byParticipant: mutable };
}
