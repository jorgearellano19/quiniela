import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Answer, AnswerValue } from "@/domain/answer/answer";
import type { Question, Round } from "@/domain/round/round";
import {
  calculateQuestionScores,
  calculateRoundScoreBreakdowns,
  officialResultValuesEqual,
  ScoringDomainError,
  validateOfficialResult,
  type OfficialResult,
  type OfficialResultValue,
  type OpenTextJudgment,
  type QuestionScore,
} from "@/domain/scoring/scoring";
import {
  assertResultMutable,
  effectiveRoundStatus,
  ResultLifecycleError,
} from "@/domain/scoring/lifecycle";
import {
  requireCompetitionActor,
  type CompetitionActor,
} from "@/application/competition/boundary";
import { ApplicationError } from "@/lib/errors/application-error";

export type ResultParticipant = Readonly<{
  id: string;
  userId: string;
  name: string;
}>;

export type ResultRoundAggregate = Readonly<{
  round: Round;
  questions: Question[];
  participants: ResultParticipant[];
  answers: Answer[];
  results: OfficialResult[];
  judgments: OpenTextJudgment[];
  actorParticipantId: string | null;
  actorIsAdmin: boolean;
  restrictedParticipantIds: ReadonlySet<string>;
  rivalParticipantIdByParticipant?: ReadonlyMap<string, string | null> | undefined;
  tiebreakerQuestionId?: string | null | undefined;
}>;

export type ResultMutationDecision = Readonly<{
  kind: "record" | "correct" | "unchanged";
  value: OfficialResult;
}>;

export type JudgmentMutationDecision = Readonly<{
  kind: "record" | "correct" | "unchanged";
  value: OpenTextJudgment;
}>;

export interface ResultRepository {
  getRound(
    competitionId: string,
    roundId: string,
    userId: string,
  ): Promise<ResultRoundAggregate | null>;
  mutateResult(
    competitionId: string,
    roundId: string,
    questionId: string,
    userId: string,
    now: Date,
    operation: (context: {
      round: Round;
      question: Question;
      current: OfficialResult | null;
    }) => ResultMutationDecision,
  ): Promise<ResultRoundAggregate | null>;
  mutateJudgment(
    competitionId: string,
    roundId: string,
    answerId: string,
    userId: string,
    now: Date,
    operation: (context: {
      round: Round;
      question: Question;
      answer: Answer;
      current: OpenTextJudgment | null;
    }) => JudgmentMutationDecision,
  ): Promise<ResultRoundAggregate | null>;
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
const resultValue = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MATCH_SCORE"),
    homeScore: matchScore,
    awayScore: matchScore,
  }),
  z.object({ type: z.literal("CLOSEST_VALUE"), value: z.string() }),
  z.object({ type: z.literal("EXACT_VALUE"), value: z.string() }),
  z.object({ type: z.literal("OPTIONS"), optionId: z.uuid() }),
]);
const judgmentInput = z.object({
  competitionId: z.uuid(),
  roundId: z.uuid(),
  answerId: z.uuid(),
  isCorrect: z.union([
    z.boolean(),
    z.literal("true").transform(() => true),
    z.literal("false").transform(() => false),
  ]),
});

function invalid(message = "Revisa el resultado."): never {
  throw new ApplicationError("INVALID_INPUT", message);
}

function safeDomain<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ScoringDomainError || error instanceof ResultLifecycleError)
      throw new ApplicationError("INVALID_INPUT", "No fue posible guardar el resultado.");
    throw error;
  }
}

function valueForPublic(value: AnswerValue | OfficialResultValue) {
  return value;
}

function questionForPublic(question: Question) {
  const common = {
    id: question.id,
    sequence: question.sequence,
    type: question.type,
    prompt: question.prompt,
    deadlineAt: question.deadlineAt.toISOString(),
  };
  if (question.type === "MATCH_SCORE")
    return {
      ...common,
      homeLabel: question.homeLabel,
      awayLabel: question.awayLabel,
      scoring: {
        exactScorePoints: question.exactScorePoints,
        goalDifferencePoints: question.goalDifferencePoints,
        normalResultPoints: question.normalResultPoints,
      },
    };
  if (question.type === "OPTIONS")
    return {
      ...common,
      options: question.options.map(({ id, sequence, label }) => ({
        id,
        sequence,
        label,
      })),
      scoring: { points: question.points },
    };
  return {
    ...common,
    ...(question.type === "CLOSEST_VALUE" ? { againstRival: question.againstRival } : {}),
    scoring: { points: question.points },
  };
}

export function reviewRoundResults(aggregate: ResultRoundAggregate, now: Date) {
  const finalized = effectiveRoundStatus(aggregate.round, now) === "FINALIZED";
  const eligibleParticipantIds = aggregate.participants
    .map((participant) => participant.id)
    .filter(
      (participantId) =>
        finalized || !aggregate.restrictedParticipantIds.has(participantId),
    );
  const eligibleParticipantIdSet = new Set(eligibleParticipantIds);
  const eligibleAnswers = aggregate.answers.filter((answer) =>
    eligibleParticipantIdSet.has(answer.participantId),
  );
  const totals = calculateRoundScoreBreakdowns({
    questions: aggregate.questions,
    participantIds: eligibleParticipantIds,
    answers: eligibleAnswers,
    results: aggregate.results,
    judgments: aggregate.judgments,
    unansweredPenalty: aggregate.round.unansweredPenalty,
    rivalParticipantIdByParticipant: aggregate.rivalParticipantIdByParticipant,
    tiebreakerQuestionId: aggregate.tiebreakerQuestionId,
    now,
  }).byParticipant;
  const questions = aggregate.questions.map((question) => {
    const closed = now.valueOf() >= question.deadlineAt.valueOf();
    const answers = aggregate.answers.filter(
      (answer) => answer.questionId === question.id,
    );
    const eligibleQuestionAnswers = answers.filter((answer) =>
      eligibleParticipantIdSet.has(answer.participantId),
    );
    const result =
      aggregate.results.find((item) => item.questionId === question.id) ?? null;
    let scores: ReadonlyMap<string, QuestionScore> = new Map(
      aggregate.participants.map((participant) => [
        participant.id,
        { state: "PENDING", points: null, awardedRule: null } as const,
      ]),
    );
    if (closed)
      scores = calculateQuestionScores({
        question,
        participantIds: eligibleParticipantIds,
        answers: eligibleQuestionAnswers,
        result,
        judgments: aggregate.judgments,
        unansweredPenalty: aggregate.round.unansweredPenalty,
        isTiebreaker: question.id === aggregate.tiebreakerQuestionId,
        rivalParticipantIdByParticipant: aggregate.rivalParticipantIdByParticipant,
      });
    const visibleParticipants = closed
      ? aggregate.participants
      : aggregate.participants.filter(
          (participant) => participant.id === aggregate.actorParticipantId,
        );
    return {
      ...questionForPublic(question),
      closed,
      result: closed && result ? valueForPublic(result.value) : null,
      entries: visibleParticipants.map((participant) => {
        const answer =
          answers.find((item) => item.participantId === participant.id) ?? null;
        const judgment = answer
          ? (aggregate.judgments.find((item) => item.answerId === answer.id) ?? null)
          : null;
        return {
          participantId: participant.id,
          participantName: participant.name,
          answerId: answer?.id ?? null,
          answer: answer ? valueForPublic(answer.value) : null,
          score:
            aggregate.restrictedParticipantIds.has(participant.id) && !finalized
              ? { state: "SCORED", points: 0, awardedRule: null }
              : (scores.get(participant.id) ?? null),
          judgment: question.type === "OPEN_TEXT" ? (judgment?.isCorrect ?? null) : null,
        };
      }),
    };
  });
  return {
    id: aggregate.round.id,
    competitionId: aggregate.round.competitionId,
    sequence: aggregate.round.sequence,
    name: aggregate.round.name,
    status: effectiveRoundStatus(aggregate.round, now),
    persistedStatus: aggregate.round.status,
    finishedAt: aggregate.round.finishedAt?.toISOString() ?? null,
    correctionEndsAt: aggregate.round.finishedAt
      ? new Date(aggregate.round.finishedAt.valueOf() + 86_400_000).toISOString()
      : null,
    canManage: aggregate.actorIsAdmin,
    participants: aggregate.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      total: totals.get(participant.id)?.total ?? 0,
    })),
    questions,
  };
}

export async function getRoundResults(
  repository: ResultRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (!z.uuid().safeParse(competitionId).success || !z.uuid().safeParse(roundId).success)
    return null;
  const aggregate = await repository.getRound(competitionId, roundId, actor.userId);
  return aggregate ? reviewRoundResults(aggregate, now) : null;
}

async function writeResult(
  mode: "record" | "correct",
  repository: ResultRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now: Date,
) {
  const actor = requireCompetitionActor(actorValue);
  const candidate = typeof input === "object" && input ? input : {};
  const identity = ids.safeParse(candidate);
  const parsedValue = resultValue.safeParse(candidate);
  if (!identity.success)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible guardar el resultado.");
  if (!parsedValue.success) invalid();
  const aggregate = await repository.mutateResult(
    identity.data.competitionId,
    identity.data.roundId,
    identity.data.questionId,
    actor.userId,
    now,
    ({ round, question, current }) => {
      safeDomain(() => assertResultMutable(round, question.deadlineAt, now));
      const normalized = safeDomain(() =>
        validateOfficialResult(question, parsedValue.data as OfficialResultValue),
      );
      if (mode === "record" && current) {
        if (officialResultValuesEqual(current.value, normalized))
          return { kind: "unchanged", value: current };
        invalid("Este resultado ya existe. Usa la corrección.");
      }
      if (mode === "correct" && !current) invalid("Primero registra el resultado.");
      if (current && officialResultValuesEqual(current.value, normalized))
        return { kind: "unchanged", value: current };
      return {
        kind: current ? "correct" : "record",
        value: {
          id: current?.id ?? randomUUID(),
          questionId: question.id,
          value: normalized,
          recordedAt: current?.recordedAt ?? now,
          updatedAt: now,
          updatedByUserId: actor.userId,
        },
      };
    },
  );
  if (!aggregate)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible guardar el resultado.");
  return reviewRoundResults(aggregate, now);
}

export const recordOfficialResult = (
  repository: ResultRepository,
  actor: CompetitionActor,
  input: unknown,
  now = new Date(),
) => writeResult("record", repository, actor, input, now);

export const correctOfficialResult = (
  repository: ResultRepository,
  actor: CompetitionActor,
  input: unknown,
  now = new Date(),
) => writeResult("correct", repository, actor, input, now);

export async function judgeOpenTextAnswer(
  repository: ResultRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  const parsed = judgmentInput.safeParse(input);
  if (!parsed.success) invalid("Revisa el juicio del pronóstico.");
  const aggregate = await repository.mutateJudgment(
    parsed.data.competitionId,
    parsed.data.roundId,
    parsed.data.answerId,
    actor.userId,
    now,
    ({ round, question, answer, current }) => {
      safeDomain(() => assertResultMutable(round, question.deadlineAt, now));
      if (question.type !== "OPEN_TEXT" || answer.value.type !== "OPEN_TEXT")
        invalid("Este pronóstico no admite juicio manual.");
      if (current?.isCorrect === parsed.data.isCorrect)
        return { kind: "unchanged", value: current };
      return {
        kind: current ? "correct" : "record",
        value: {
          answerId: answer.id,
          isCorrect: parsed.data.isCorrect,
          judgedAt: current?.judgedAt ?? now,
          updatedAt: now,
          updatedByUserId: actor.userId,
        },
      };
    },
  );
  if (!aggregate)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible guardar el juicio.");
  return reviewRoundResults(aggregate, now);
}

export type RoundResultsDetail = NonNullable<Awaited<ReturnType<typeof getRoundResults>>>;
