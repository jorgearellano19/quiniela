import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createQuestion as makeQuestion,
  createRound as makeRound,
  reviseQuestion,
  RoundDomainError,
  updateRound as reviseRound,
  validateCompetitionScoringDefaults,
  type CompetitionScoringDefaults,
  type Question,
  type Round,
} from "@/domain/round/round";
import type { CompetitionType } from "@/domain/competition/competition";
import { ApplicationError } from "@/lib/errors/application-error";
import {
  requireCompetitionActor,
  type CompetitionActor,
} from "@/application/competition/boundary";
export type RoundSummary = Readonly<{
  id: string;
  competitionId: string;
  sequence: number;
  name: string;
  startsAt: string;
  status: Round["status"];
  unansweredPenalty: Round["unansweredPenalty"];
  publishedAt: string | null;
  updatedAt: string;
  questionCount: number;
}>;
type QuestionEditorBase = Readonly<{
  id: string;
  sequence: number;
  prompt: string | null;
  deadlineMode: "ROUND_START" | "CUSTOM";
  deadlineAt: string;
  usesDefaultScoring: boolean;
}>;
export type QuestionEditor =
  | (QuestionEditorBase &
      Readonly<{
        type: "MATCH_SCORE";
        homeLabel: string;
        awayLabel: string;
        exactScorePoints: number;
        goalDifferencePoints: number | null;
        normalResultPoints: number;
      }>)
  | (QuestionEditorBase &
      Readonly<{ type: "CLOSEST_VALUE"; points: number; againstRival: boolean }>)
  | (QuestionEditorBase &
      Readonly<{
        type: "OPTIONS";
        points: number;
        options: ReadonlyArray<{ sequence: number; label: string }>;
      }>)
  | (QuestionEditorBase &
      Readonly<{ type: "OPEN_TEXT" | "EXACT_VALUE"; points: number }>);
export type RoundEditorDetail = RoundSummary & {
  competitionType: CompetitionType;
  competitionStatus: "DRAFT" | "STARTED" | "COMPLETED";
  scoringDefaults: CompetitionScoringDefaults;
  questions: readonly QuestionEditor[];
  readOnly: boolean;
};
export type RoundAggregate = Readonly<{
  round: Round;
  competitionType: CompetitionType;
  competitionStatus: "DRAFT" | "STARTED" | "COMPLETED";
  scoringDefaults: CompetitionScoringDefaults;
  questions: Question[];
}>;
type QuestionWrite =
  | Readonly<{ kind: "save"; value: Question; isNew: boolean }>
  | Readonly<{ kind: "remove"; questionId: string }>;
export interface RoundRepository {
  getCompetitionForAdmin(
    competitionId: string,
    userId: string,
  ): Promise<{
    id: string;
    type: CompetitionType;
    status: "DRAFT" | "STARTED" | "COMPLETED";
    scoringDefaults: CompetitionScoringDefaults;
  } | null>;
  create(value: Round, userId: string): Promise<boolean>;
  list(competitionId: string): Promise<Array<{ round: Round; questionCount: number }>>;
  getEditor(roundId: string, userId: string): Promise<RoundAggregate | null>;
  updateDraft(value: Round, userId: string): Promise<boolean>;
  mutateQuestion(
    roundId: string,
    userId: string,
    operation: (round: Round, questions: Question[]) => QuestionWrite,
  ): Promise<Question | null>;
  publish(roundId: string, userId: string, now: Date): Promise<RoundAggregate | null>;
  updateScoringDefaults(
    competitionId: string,
    userId: string,
    value: CompetitionScoringDefaults,
  ): Promise<boolean>;
  reorderRounds(competitionId: string, userId: string, ids: string[]): Promise<boolean>;
  reorderQuestions(roundId: string, userId: string, ids: string[]): Promise<boolean>;
  deleteDraft(roundId: string, competitionId: string, userId: string): Promise<boolean>;
}
function questionEditor(value: Question): QuestionEditor {
  const common = {
    id: value.id,
    sequence: value.sequence,
    prompt: value.prompt,
    deadlineMode: value.deadlineMode,
    deadlineAt: value.deadlineAt.toISOString(),
    usesDefaultScoring: value.usesDefaultScoring,
  };
  if (value.type === "MATCH_SCORE")
    return {
      ...common,
      type: value.type,
      homeLabel: value.homeLabel,
      awayLabel: value.awayLabel,
      exactScorePoints: value.exactScorePoints,
      goalDifferencePoints: value.goalDifferencePoints,
      normalResultPoints: value.normalResultPoints,
    };
  if (value.type === "CLOSEST_VALUE")
    return {
      ...common,
      type: value.type,
      points: value.points,
      againstRival: value.againstRival,
    };
  if (value.type === "OPTIONS")
    return {
      ...common,
      type: value.type,
      points: value.points,
      options: value.options.map(({ sequence, label }) => ({ sequence, label })),
    };
  return { ...common, type: value.type, points: value.points };
}
function summary(value: Round, questionCount: number): RoundSummary {
  return {
    id: value.id,
    competitionId: value.competitionId,
    sequence: value.sequence,
    name: value.name,
    startsAt: value.startsAt.toISOString(),
    status: value.status,
    unansweredPenalty: value.unansweredPenalty,
    publishedAt: value.publishedAt?.toISOString() ?? null,
    updatedAt: value.updatedAt.toISOString(),
    questionCount,
  };
}
function editor(value: RoundAggregate): RoundEditorDetail {
  return {
    ...summary(value.round, value.questions.length),
    competitionType: value.competitionType,
    competitionStatus: value.competitionStatus,
    scoringDefaults: value.scoringDefaults,
    questions: value.questions.map(questionEditor),
    readOnly: value.round.status !== "DRAFT",
  };
}
const id = z.uuid();
const roundFields = z.object({
  competitionId: id,
  sequence: z.coerce.number().int().positive(),
  name: z.string(),
  startsAt: z.coerce.date(),
  unansweredPenalty: z.coerce
    .number()
    .int()
    .refine((v) => v === -1 || v === 0),
});
const baseQuestion = {
  roundId: id,
  sequence: z.coerce.number().int().positive(),
  prompt: z.string().nullable().optional(),
  deadlineMode: z.enum(["ROUND_START", "CUSTOM"]),
  deadlineAt: z.coerce.date().nullable(),
  usesDefaultScoring: z.boolean(),
};
const questionInput = z.discriminatedUnion("type", [
  z.object({
    ...baseQuestion,
    type: z.literal("MATCH_SCORE"),
    homeLabel: z.string(),
    awayLabel: z.string(),
    exactScorePoints: z.coerce.number(),
    goalDifferencePoints: z.union([z.coerce.number(), z.null()]),
    normalResultPoints: z.coerce.number(),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("CLOSEST_VALUE"),
    points: z.coerce.number(),
    againstRival: z.boolean(),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("OPTIONS"),
    points: z.coerce.number(),
    options: z.array(z.object({ id: z.string().optional(), label: z.string() })),
  }),
  z.object({ ...baseQuestion, type: z.literal("OPEN_TEXT"), points: z.coerce.number() }),
  z.object({
    ...baseQuestion,
    type: z.literal("EXACT_VALUE"),
    points: z.coerce.number(),
  }),
]);
function invalid(): never {
  throw new ApplicationError("INVALID_INPUT", "Revisa la configuración de la jornada.");
}
function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RoundDomainError) invalid();
    throw e;
  }
}
async function admin(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
) {
  const actor = requireCompetitionActor(actorValue);
  if (!id.safeParse(competitionId).success)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible administrar la jornada.");
  const competition = await repository.getCompetitionForAdmin(
    competitionId,
    actor.userId,
  );
  if (!competition)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible administrar la jornada.");
  return { actor, competition };
}
const scoringDefaultsInput = z.object({
  matchScore: z.object({
    exactScorePoints: z.coerce.number(),
    goalDifferencePoints: z.union([z.coerce.number(), z.null()]),
    normalResultPoints: z.coerce.number(),
  }),
  closestValuePoints: z.coerce.number(),
  optionsPoints: z.coerce.number(),
  openTextPoints: z.coerce.number(),
  exactValuePoints: z.coerce.number(),
});
export async function updateCompetitionScoringDefaults(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  input: unknown,
) {
  const { actor, competition } = await admin(repository, actorValue, competitionId);
  if (competition.status === "COMPLETED") invalid();
  const parsed = scoringDefaultsInput.safeParse(input);
  if (!parsed.success) invalid();
  const value = domain(() => validateCompetitionScoringDefaults(parsed.data));
  if (!(await repository.updateScoringDefaults(competitionId, actor.userId, value)))
    invalid();
  return value;
}
export async function createRound(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  input: unknown,
) {
  const parsed = roundFields.safeParse(input);
  if (!parsed.success) invalid();
  const { actor, competition } = await admin(
    repository,
    actorValue,
    parsed.data.competitionId,
  );
  if (competition.status === "COMPLETED") invalid();
  const value = domain(() =>
    makeRound({
      id: randomUUID(),
      ...parsed.data,
      unansweredPenalty: parsed.data.unansweredPenalty as -1 | 0,
      actorUserId: actor.userId,
    }),
  );
  if (!(await repository.create(value, actor.userId))) invalid();
  return summary(value, 0);
}
export async function listRounds(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
) {
  await admin(repository, actorValue, competitionId);
  return (await repository.list(competitionId)).map(({ round, questionCount }) =>
    summary(round, questionCount),
  );
}
export async function getCompetitionScoringDefaults(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
) {
  return (await admin(repository, actorValue, competitionId)).competition.scoringDefaults;
}
const orderedIds = z
  .array(id)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length);
export async function reorderRounds(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  input: unknown,
) {
  const { actor, competition } = await admin(repository, actorValue, competitionId);
  if (competition.status === "COMPLETED") invalid();
  const parsed = orderedIds.safeParse(input);
  if (!parsed.success) invalid();
  if (!(await repository.reorderRounds(competitionId, actor.userId, parsed.data)))
    invalid();
}
export async function reorderQuestions(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
  input: unknown,
) {
  const { actor, competition } = await admin(repository, actorValue, competitionId);
  if (competition.status === "COMPLETED" || !id.safeParse(roundId).success) invalid();
  const parsed = orderedIds.safeParse(input);
  if (!parsed.success) invalid();
  if (!(await repository.reorderQuestions(roundId, actor.userId, parsed.data))) invalid();
}
export async function deleteRound(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
) {
  const { actor, competition } = await admin(repository, actorValue, competitionId);
  if (competition.status === "COMPLETED" || !id.safeParse(roundId).success) invalid();
  if (!(await repository.deleteDraft(roundId, competitionId, actor.userId))) invalid();
}
export async function getRoundEditor(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
) {
  const { actor } = await admin(repository, actorValue, competitionId);
  const result = await repository.getEditor(roundId, actor.userId);
  return result?.round.competitionId === competitionId ? editor(result) : null;
}
export async function updateRound(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  input: unknown,
) {
  const parsed = roundFields.extend({ roundId: id }).safeParse(input);
  if (!parsed.success) invalid();
  const { actor, competition } = await admin(
    repository,
    actorValue,
    parsed.data.competitionId,
  );
  if (competition.status === "COMPLETED") invalid();
  const editor = await repository.getEditor(parsed.data.roundId, actor.userId);
  if (!editor || editor.round.competitionId !== competition.id)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible administrar la jornada.");
  const value = domain(() =>
    reviseRound(editor.round, {
      ...parsed.data,
      unansweredPenalty: parsed.data.unansweredPenalty as -1 | 0,
      actorUserId: actor.userId,
    }),
  );
  if (!(await repository.updateDraft(value, actor.userId))) invalid();
  return value;
}
async function questionMutation(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  input: unknown,
  questionId?: string,
  remove = false,
) {
  const candidate = typeof input === "object" && input ? input : {};
  const parsedBase = z.object({ competitionId: id, roundId: id }).safeParse(candidate);
  if (!parsedBase.success) invalid();
  const { actor, competition } = await admin(
    repository,
    actorValue,
    parsedBase.data.competitionId,
  );
  if (competition.status === "COMPLETED") invalid();
  let parsed: z.infer<typeof questionInput> | null = null;
  if (!remove) {
    const p = questionInput.safeParse(candidate);
    if (!p.success) invalid();
    parsed = p.data;
    if (
      parsed.type === "CLOSEST_VALUE" &&
      parsed.againstRival &&
      competition.type === "LEAGUE"
    )
      invalid();
  }
  return repository.mutateQuestion(
    parsedBase.data.roundId,
    actor.userId,
    (round, questions) => {
      if (round.competitionId !== competition.id || round.status !== "DRAFT") invalid();
      if (remove) {
        const found = questions.find((q) => q.id === questionId);
        if (!found)
          throw new ApplicationError(
            "UNAUTHORIZED",
            "No fue posible administrar la pregunta.",
          );
        return { kind: "remove", questionId: found.id };
      }
      const current = questionId ? questions.find((q) => q.id === questionId) : null;
      if (questionId && !current)
        throw new ApplicationError(
          "UNAUTHORIZED",
          "No fue posible administrar la pregunta.",
        );
      const data = {
        ...parsed!,
        prompt: parsed!.type === "MATCH_SCORE" ? null : (parsed!.prompt ?? null),
        deadlineAt:
          parsed!.deadlineMode === "ROUND_START"
            ? round.startsAt
            : (parsed!.deadlineAt ?? round.startsAt),
        id: current?.id ?? randomUUID(),
        actorUserId: actor.userId,
        options:
          parsed?.type === "OPTIONS"
            ? parsed.options.map((o) => ({ ...o, id: o.id || randomUUID() }))
            : undefined,
      };
      const defaults = competition.scoringDefaults;
      if (data.usesDefaultScoring) {
        if (data.type === "MATCH_SCORE") Object.assign(data, defaults.matchScore);
        else if (data.type === "CLOSEST_VALUE") data.points = defaults.closestValuePoints;
        else if (data.type === "OPTIONS") data.points = defaults.optionsPoints;
        else if (data.type === "OPEN_TEXT") data.points = defaults.openTextPoints;
        else data.points = defaults.exactValuePoints;
      }
      const value = domain(() =>
        current ? reviseQuestion(current, data) : makeQuestion(data),
      );
      return { kind: "save", value, isNew: !current };
    },
  );
}
export const createQuestion = (r: RoundRepository, a: CompetitionActor, i: unknown) =>
  questionMutation(r, a, i);
export const updateQuestion = (
  r: RoundRepository,
  a: CompetitionActor,
  questionId: string,
  i: unknown,
) => questionMutation(r, a, i, questionId);
export const removeQuestion = (
  r: RoundRepository,
  a: CompetitionActor,
  competitionId: string,
  roundId: string,
  questionId: string,
) => questionMutation(r, a, { competitionId, roundId }, questionId, true);
export async function publishRound(
  repository: RoundRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
  now = new Date(),
) {
  const { actor, competition } = await admin(repository, actorValue, competitionId);
  if (competition.status !== "STARTED") invalid();
  const result = await repository.publish(roundId, actor.userId, now);
  if (!result || result.round.competitionId !== competitionId)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible publicar la jornada.");
  return editor(result);
}
