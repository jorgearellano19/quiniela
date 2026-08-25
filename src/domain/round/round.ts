export const ROUND_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "ACTIVE",
  "FINISHED",
  "FINALIZED",
] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export const QUESTION_TYPES = [
  "MATCH_SCORE",
  "CLOSEST_VALUE",
  "OPTIONS",
  "OPEN_TEXT",
  "EXACT_VALUE",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_DEADLINE_MODES = ["ROUND_START", "CUSTOM"] as const;
export type QuestionDeadlineMode = (typeof QUESTION_DEADLINE_MODES)[number];
export type CompetitionScoringDefaults = Readonly<{
  matchScore: Readonly<{
    exactScorePoints: number;
    goalDifferencePoints: number | null;
    normalResultPoints: number;
  }>;
  closestValuePoints: number;
  optionsPoints: number;
  openTextPoints: number;
  exactValuePoints: number;
}>;
export const DEFAULT_COMPETITION_SCORING: CompetitionScoringDefaults = {
  matchScore: {
    exactScorePoints: 3,
    goalDifferencePoints: 2,
    normalResultPoints: 1,
  },
  closestValuePoints: 1,
  optionsPoints: 1,
  openTextPoints: 1,
  exactValuePoints: 1,
};

export type Round = Readonly<{
  id: string;
  competitionId: string;
  sequence: number;
  name: string;
  startsAt: Date;
  status: RoundStatus;
  unansweredPenalty: -1 | 0;
  publishedAt: Date | null;
  finishedAt: Date | null;
  finalizedAt: Date | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}>;
type BaseQuestion = Readonly<{
  id: string;
  roundId: string;
  sequence: number;
  prompt: string | null;
  deadlineMode: QuestionDeadlineMode;
  deadlineAt: Date;
  usesDefaultScoring: boolean;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}>;
export type MatchScoreQuestion = BaseQuestion &
  Readonly<{
    type: "MATCH_SCORE";
    homeLabel: string;
    awayLabel: string;
    exactScorePoints: number;
    goalDifferencePoints: number | null;
    normalResultPoints: number;
  }>;
export type ClosestValueQuestion = BaseQuestion &
  Readonly<{ type: "CLOSEST_VALUE"; points: number; againstRival: boolean }>;
export type OptionsQuestion = BaseQuestion &
  Readonly<{
    type: "OPTIONS";
    points: number;
    options: ReadonlyArray<{ id: string; sequence: number; label: string }>;
  }>;
export type SimpleQuestion = BaseQuestion &
  Readonly<{ type: "OPEN_TEXT" | "EXACT_VALUE"; points: number }>;
export type Question =
  MatchScoreQuestion | ClosestValueQuestion | OptionsQuestion | SimpleQuestion;
export class RoundDomainError extends Error {}

function text(value: string, label: string, max: number) {
  const v = value.trim();
  if (!v || v.length > max) throw new RoundDomainError(`Invalid ${label}.`);
  return v;
}
function positiveSequence(value: number) {
  if (!Number.isInteger(value) || value < 1)
    throw new RoundDomainError("Invalid sequence.");
  return value;
}
function points(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw new RoundDomainError("Invalid points.");
  return value;
}
export function validateCompetitionScoringDefaults(
  value: CompetitionScoringDefaults,
): CompetitionScoringDefaults {
  const exact = points(value.matchScore.exactScorePoints);
  const normal = points(value.matchScore.normalResultPoints);
  const difference =
    value.matchScore.goalDifferencePoints === null
      ? null
      : points(value.matchScore.goalDifferencePoints);
  if (!(exact > (difference ?? normal) && (difference === null || difference > normal)))
    throw new RoundDomainError("Invalid match hierarchy.");
  return {
    matchScore: {
      exactScorePoints: exact,
      goalDifferencePoints: difference,
      normalResultPoints: normal,
    },
    closestValuePoints: points(value.closestValuePoints),
    optionsPoints: points(value.optionsPoints),
    openTextPoints: points(value.openTextPoints),
    exactValuePoints: points(value.exactValuePoints),
  };
}
function base(input: {
  id: string;
  roundId: string;
  sequence: number;
  prompt?: string | null;
  deadlineMode?: QuestionDeadlineMode;
  deadlineAt: Date;
  usesDefaultScoring?: boolean;
  actorUserId: string;
  now?: Date;
}): BaseQuestion {
  if (!(input.deadlineAt instanceof Date) || Number.isNaN(input.deadlineAt.valueOf()))
    throw new RoundDomainError("Invalid deadline.");
  const now = input.now ?? new Date();
  return {
    id: input.id,
    roundId: input.roundId,
    sequence: positiveSequence(input.sequence),
    prompt: input.prompt == null ? null : text(input.prompt, "prompt", 500),
    deadlineMode: input.deadlineMode ?? "CUSTOM",
    deadlineAt: input.deadlineAt,
    usesDefaultScoring: input.usesDefaultScoring ?? false,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
}
export function createRound(input: {
  id: string;
  competitionId: string;
  sequence: number;
  name: string;
  startsAt?: Date;
  unansweredPenalty?: -1 | 0;
  actorUserId: string;
  now?: Date;
}): Round {
  const now = input.now ?? new Date();
  const startsAt = input.startsAt ?? new Date(now.valueOf() + 86_400_000);
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.valueOf()))
    throw new RoundDomainError("Invalid Round start.");
  if (input.unansweredPenalty !== undefined && ![-1, 0].includes(input.unansweredPenalty))
    throw new RoundDomainError("Invalid unanswered penalty.");
  return {
    id: input.id,
    competitionId: input.competitionId,
    sequence: positiveSequence(input.sequence),
    name: text(input.name, "name", 120),
    startsAt,
    status: "DRAFT",
    unansweredPenalty: input.unansweredPenalty ?? -1,
    publishedAt: null,
    finishedAt: null,
    finalizedAt: null,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };
}
export function updateRound(
  round: Round,
  input: {
    sequence: number;
    name: string;
    startsAt?: Date;
    unansweredPenalty: -1 | 0;
    actorUserId: string;
    now?: Date;
  },
): Round {
  if (round.status !== "DRAFT") throw new RoundDomainError("Round is frozen.");
  return {
    ...round,
    sequence: positiveSequence(input.sequence),
    name: text(input.name, "name", 120),
    startsAt:
      input.startsAt === undefined
        ? round.startsAt
        : input.startsAt instanceof Date && !Number.isNaN(input.startsAt.valueOf())
          ? input.startsAt
          : (() => {
              throw new RoundDomainError("Invalid Round start.");
            })(),
    unansweredPenalty:
      input.unansweredPenalty === -1 || input.unansweredPenalty === 0
        ? input.unansweredPenalty
        : (() => {
            throw new RoundDomainError("Invalid unanswered penalty.");
          })(),
    updatedByUserId: input.actorUserId,
    updatedAt: input.now ?? new Date(),
  };
}
export function createQuestion(
  input: { type: QuestionType } & Record<string, unknown> & {
      id: string;
      roundId: string;
      sequence: number;
      prompt?: string | null;
      deadlineMode?: QuestionDeadlineMode;
      deadlineAt: Date;
      usesDefaultScoring?: boolean;
      actorUserId: string;
      now?: Date;
    },
): Question {
  const b = base(input);
  if (input.type === "MATCH_SCORE") {
    if (b.prompt !== null) throw new RoundDomainError("Match prompt is not allowed.");
    const homeLabel = text(String(input.homeLabel ?? ""), "home label", 120),
      awayLabel = text(String(input.awayLabel ?? ""), "away label", 120);
    if (homeLabel.toLocaleLowerCase() === awayLabel.toLocaleLowerCase())
      throw new RoundDomainError("Teams must be distinct.");
    const exact = points(Number(input.exactScorePoints)),
      normal = points(Number(input.normalResultPoints));
    const gd =
      input.goalDifferencePoints == null
        ? null
        : points(Number(input.goalDifferencePoints));
    if (!(exact > (gd ?? normal) && (gd == null || gd > normal)))
      throw new RoundDomainError("Invalid match hierarchy.");
    return {
      ...b,
      type: input.type,
      homeLabel,
      awayLabel,
      exactScorePoints: exact,
      goalDifferencePoints: gd,
      normalResultPoints: normal,
    };
  }
  if (b.prompt === null) throw new RoundDomainError("Question prompt is required.");
  const valuePoints = points(Number(input.points));
  if (input.type === "CLOSEST_VALUE")
    return {
      ...b,
      type: input.type,
      points: valuePoints,
      againstRival: input.againstRival === true,
    };
  if (input.type === "OPTIONS") {
    if (
      !Array.isArray(input.options) ||
      input.options.length < 2 ||
      input.options.length > 20
    )
      throw new RoundDomainError("Invalid options.");
    const seen = new Set<string>();
    const options = input.options.map((raw, i) => {
      const label = text(
        String((raw as { label?: unknown }).label ?? raw),
        "option",
        120,
      );
      const key = label.toLocaleLowerCase();
      if (seen.has(key)) throw new RoundDomainError("Duplicate option.");
      seen.add(key);
      return { id: String((raw as { id?: unknown }).id ?? ""), sequence: i + 1, label };
    });
    return { ...b, type: input.type, points: valuePoints, options };
  }
  return { ...b, type: input.type, points: valuePoints };
}
export function reviseQuestion(
  current: Question,
  input: Parameters<typeof createQuestion>[0],
): Question {
  const next = createQuestion({
    ...input,
    id: current.id,
    roundId: current.roundId,
    now: current.createdAt,
  });
  return {
    ...next,
    createdAt: current.createdAt,
    createdByUserId: current.createdByUserId,
    updatedAt: input.now ?? new Date(),
    updatedByUserId: input.actorUserId,
  };
}
export function publishRound(
  round: Round,
  questions: readonly Question[],
  now = new Date(),
): Round {
  if (round.status === "ACTIVE") return round;
  if (round.status !== "DRAFT") throw new RoundDomainError("Round cannot be published.");
  if (!questions.length || questions.some((q) => q.deadlineAt <= now))
    throw new RoundDomainError("Round is not ready to publish.");
  return { ...round, status: "ACTIVE", publishedAt: now, updatedAt: now };
}
