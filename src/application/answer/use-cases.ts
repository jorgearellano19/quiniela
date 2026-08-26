import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AnswerDomainError,
  canEditAnswer,
  createAnswer as makeAnswer,
  updateAnswer as reviseAnswer,
  type Answer,
  type AnswerValue,
} from "@/domain/answer/answer";
import type { Question, Round } from "@/domain/round/round";
import {
  requireCompetitionActor,
  type CompetitionActor,
} from "@/application/competition/boundary";
import { ApplicationError } from "@/lib/errors/application-error";

export type ParticipantRoundSummary = Readonly<{
  id: string;
  sequence: number;
  name: string;
  status: Round["status"];
  questionCount: number;
  answeredCount: number;
}>;

export type ParticipantQuestion = Readonly<{
  question: Question;
  answer: Answer | null;
  canEdit: boolean;
}>;

type PublicQuestionBase = Readonly<{
  id: string;
  sequence: number;
  prompt: string | null;
  deadlineAt: string;
}>;
export type AnswerQuestionSummary =
  | (PublicQuestionBase &
      Readonly<{
        type: "MATCH_SCORE";
        homeLabel: string;
        awayLabel: string;
        scoring: Readonly<{
          exactScorePoints: number;
          goalDifferencePoints: number | null;
          normalResultPoints: number;
        }>;
      }>)
  | (PublicQuestionBase &
      Readonly<{
        type: "OPTIONS";
        options: ReadonlyArray<{ id: string; sequence: number; label: string }>;
        scoring: Readonly<{ points: number }>;
      }>)
  | (PublicQuestionBase &
      Readonly<{
        type: "CLOSEST_VALUE";
        againstRival: boolean;
        scoring: Readonly<{ points: number }>;
      }>)
  | (PublicQuestionBase &
      Readonly<{
        type: "OPEN_TEXT" | "EXACT_VALUE";
        scoring: Readonly<{ points: number }>;
      }>);

export type ParticipantRoundAggregate = Readonly<{
  round: Round;
  participantId: string;
  questions: Question[];
  answers: Answer[];
}>;

export interface AnswerRepository {
  listPublished(
    competitionId: string,
    userId: string,
  ): Promise<ParticipantRoundSummary[] | null>;
  getMine(
    competitionId: string,
    roundId: string,
    userId: string,
  ): Promise<ParticipantRoundAggregate | null>;
  mutate(
    competitionId: string,
    roundId: string,
    questionId: string,
    userId: string,
    now: Date,
    operation: (context: {
      participantId: string;
      round: Round;
      question: Question;
      current: Answer | null;
    }) => Answer,
  ): Promise<Answer | null>;
}

const ids = z.object({
  competitionId: z.uuid(),
  roundId: z.uuid(),
  questionId: z.uuid(),
});
const matchScore = z.union([
  z.number(),
  z.string().trim().regex(/^\d+$/).transform(Number),
]);
const valueSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MATCH_SCORE"),
    homeScore: matchScore,
    awayScore: matchScore,
  }),
  z.object({ type: z.literal("CLOSEST_VALUE"), value: z.string() }),
  z.object({ type: z.literal("EXACT_VALUE"), value: z.string() }),
  z.object({ type: z.literal("OPTIONS"), optionId: z.uuid() }),
  z.object({ type: z.literal("OPEN_TEXT"), value: z.string() }),
]);

const fieldMessage: Readonly<Record<string, string>> = {
  homeScore: "Escribe un marcador local entero entre 0 y 999.",
  awayScore: "Escribe un marcador visitante entero entre 0 y 999.",
  optionId: "Elige una opción.",
  value: "Escribe una respuesta válida.",
};

function invalid(
  message = "Revisa este pronóstico.",
  fieldErrors?: Readonly<Record<string, string>>,
): never {
  throw new ApplicationError("INVALID_INPUT", message, undefined, fieldErrors);
}
function fieldsFor(value: AnswerValue): Readonly<Record<string, string>> {
  if (value.type === "MATCH_SCORE")
    return {
      homeScore: fieldMessage.homeScore!,
      awayScore: fieldMessage.awayScore!,
    };
  return value.type === "OPTIONS"
    ? { optionId: fieldMessage.optionId! }
    : { value: fieldMessage.value! };
}
function safeDomain<T>(operation: () => T, value: AnswerValue): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof AnswerDomainError)
      invalid("Revisa los campos marcados.", fieldsFor(value));
    throw error;
  }
}

function validationFields(error: z.ZodError): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "value");
    if (field in fieldMessage) result[field] = fieldMessage[field]!;
  }
  return result;
}
function publicQuestion(question: Question): AnswerQuestionSummary {
  const common = {
    id: question.id,
    sequence: question.sequence,
    prompt: question.prompt,
    deadlineAt: question.deadlineAt.toISOString(),
  };
  if (question.type === "MATCH_SCORE")
    return {
      ...common,
      type: question.type,
      homeLabel: question.homeLabel,
      awayLabel: question.awayLabel,
      scoring: {
        exactScorePoints: question.exactScorePoints,
        goalDifferencePoints: question.goalDifferencePoints,
        normalResultPoints: question.normalResultPoints,
      },
    } as const;
  if (question.type === "OPTIONS")
    return {
      ...common,
      type: question.type,
      options: question.options.map(({ id, sequence, label }) => ({
        id,
        sequence,
        label,
      })),
      scoring: { points: question.points },
    } as const;
  if (question.type === "CLOSEST_VALUE")
    return {
      ...common,
      type: question.type,
      scoring: { points: question.points },
      againstRival: question.againstRival,
    };
  return { ...common, type: question.type, scoring: { points: question.points } };
}
function publicAnswer(answer: Answer | null) {
  return answer
    ? {
        value: answer.value,
        submittedAt: answer.submittedAt.toISOString(),
        updatedAt: answer.updatedAt.toISOString(),
      }
    : null;
}

export async function listParticipantRounds(
  repository: AnswerRepository,
  actorValue: CompetitionActor,
  competitionId: string,
) {
  const actor = requireCompetitionActor(actorValue);
  if (!z.uuid().safeParse(competitionId).success) return null;
  return repository.listPublished(competitionId, actor.userId);
}

export async function getMyAnswers(
  repository: AnswerRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (!z.uuid().safeParse(competitionId).success || !z.uuid().safeParse(roundId).success)
    return null;
  const value = await repository.getMine(competitionId, roundId, actor.userId);
  if (!value) return null;
  return {
    id: value.round.id,
    competitionId: value.round.competitionId,
    sequence: value.round.sequence,
    name: value.round.name,
    status: value.round.status,
    questions: value.questions.map((question) => {
      const answer =
        value.answers.find((item) => item.questionId === question.id) ?? null;
      return {
        ...publicQuestion(question),
        answer: publicAnswer(answer),
        canEdit: canEditAnswer(value.round.status, question.deadlineAt, now),
      };
    }),
  };
}

async function write(
  mode: "submit" | "update",
  repository: AnswerRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now: Date,
) {
  const actor = requireCompetitionActor(actorValue);
  const candidate = typeof input === "object" && input ? input : {};
  const identity = ids.safeParse(candidate);
  const value = valueSchema.safeParse(candidate);
  if (!identity.success)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible guardar el pronóstico.");
  if (!value.success)
    invalid("Revisa los campos marcados.", validationFields(value.error));
  const result = await repository.mutate(
    identity.data.competitionId,
    identity.data.roundId,
    identity.data.questionId,
    actor.userId,
    now,
    ({ participantId, round, question, current }) => {
      if (!canEditAnswer(round.status, question.deadlineAt, now))
        throw new ApplicationError(
          "UNAUTHORIZED",
          "No fue posible guardar el pronóstico.",
        );
      if (mode === "submit") {
        if (current) invalid("Este pronóstico ya fue guardado.");
        return safeDomain(
          () =>
            makeAnswer({
              id: randomUUID(),
              participantId,
              question,
              value: value.data as AnswerValue,
              now,
            }),
          value.data as AnswerValue,
        );
      }
      if (!current) invalid("Este pronóstico todavía no existe.");
      return safeDomain(
        () => reviseAnswer(current, question, value.data as AnswerValue, now),
        value.data as AnswerValue,
      );
    },
  );
  if (!result)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible guardar el pronóstico.");
  return publicAnswer(result);
}

export const submitAnswer = (
  repository: AnswerRepository,
  actor: CompetitionActor,
  input: unknown,
  now = new Date(),
) => write("submit", repository, actor, input, now);

export const updateAnswer = (
  repository: AnswerRepository,
  actor: CompetitionActor,
  input: unknown,
  now = new Date(),
) => write("update", repository, actor, input, now);

export type MyAnswersDetail = NonNullable<Awaited<ReturnType<typeof getMyAnswers>>>;
