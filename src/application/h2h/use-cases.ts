import { createHash, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  classificationReadiness,
  deriveH2HMatchState,
  deriveH2HStandingValues,
  generateRoundRobinSchedule,
  H2HDomainError,
  qualifiedParticipantIds,
  requiredQualifierTieGroups,
  validateGroupAssignments,
  validateGroupPhaseConfiguration,
  validateLeaguePhaseConfiguration,
  type H2HPhaseConfiguration,
} from "@/domain/h2h/h2h";
import {
  calculateRoundScoreBreakdowns,
  isQuestionResultComplete,
} from "@/domain/scoring/scoring";
import { effectiveRoundStatus } from "@/domain/scoring/lifecycle";
import { rankH2H } from "@/domain/standings/standings";
import type {
  StandingsAggregate,
  StandingsRepository,
} from "@/application/standings/use-cases";
import {
  requireCompetitionActor,
  type CompetitionActor,
} from "@/application/competition/boundary";
import { ApplicationError } from "@/lib/errors/application-error";

export type H2HParticipant = Readonly<{ id: string; name: string }>;
export type H2HRound = Readonly<{
  id: string;
  sequence: number;
  status: "DRAFT" | "PUBLISHED" | "ACTIVE" | "FINISHED" | "FINALIZED";
}>;
export type H2HStructure = Readonly<{
  competition: Readonly<{
    id: string;
    type: "LEAGUE" | "LEAGUE_PLAYOFFS" | "GROUP_PLAYOFFS";
    status: "DRAFT" | "STARTED" | "COMPLETED";
  }>;
  actorIsAdmin: boolean;
  participants: readonly H2HParticipant[];
  rounds: readonly H2HRound[];
  configuration: H2HPhaseConfiguration | null;
  generated: boolean;
  currentParticipantId: string | null;
  drawOrder: readonly string[];
  groups: readonly Readonly<{
    id: string;
    position: number;
    participantIds: readonly string[];
  }>[];
  matchups: readonly Readonly<{
    id: string;
    roundId: string;
    groupId: string | null;
    participantAId: string;
    participantBId: string | null;
    position: number;
  }>[];
}>;

export type H2HGenerationWrite = Readonly<{
  drawOrder: readonly string[];
  groups: readonly Readonly<{
    id: string;
    position: number;
    participantIds: readonly string[];
  }>[];
  matchups: readonly Readonly<{
    id: string;
    roundId: string;
    groupId: string | null;
    participantAId: string;
    participantBId: string | null;
    position: number;
  }>[];
  actorUserId: string;
  generatedAt: Date;
}>;

export interface H2HRepository {
  get(competitionId: string, userId: string): Promise<H2HStructure | null>;
  configure(
    competitionId: string,
    userId: string,
    configuration: H2HPhaseConfiguration,
    now: Date,
  ): Promise<boolean>;
  generate(
    competitionId: string,
    userId: string,
    operation: (value: H2HStructure) => H2HGenerationWrite,
  ): Promise<H2HStructure | null>;
}

function invalid(message = "Revisa la configuración de la fase."): never {
  throw new ApplicationError("INVALID_INPUT", message);
}
function authorize(value: H2HStructure | null) {
  if (!value)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible completar la operación.");
  if (!value.actorIsAdmin)
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No tienes permiso para realizar esta acción.",
    );
  return value;
}
function domain<T>(operation: () => T) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof H2HDomainError) invalid();
    throw error;
  }
}
function secureShuffle(values: readonly string[]) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled;
}

export async function configureLeaguePhase(
  input: unknown,
  actor: CompetitionActor,
  repository: H2HRepository,
  now = new Date(),
) {
  const session = requireCompetitionActor(actor);
  const parsed = z
    .object({
      competitionId: z.uuid(),
      roundCount: z.coerce.number().int(),
      qualifierCount: z.coerce.number().int(),
    })
    .safeParse(input);
  if (!parsed.success) invalid();
  const aggregate = authorize(
    await repository.get(parsed.data.competitionId, session.userId),
  );
  if (
    aggregate.competition.type !== "LEAGUE_PLAYOFFS" ||
    aggregate.competition.status !== "DRAFT"
  )
    invalid();
  const configuration = domain(() =>
    validateLeaguePhaseConfiguration({
      participantCount: aggregate.participants.length,
      roundCount: parsed.data.roundCount,
      qualifierCount: parsed.data.qualifierCount,
    }),
  );
  if (
    !(await repository.configure(
      aggregate.competition.id,
      session.userId,
      configuration,
      now,
    ))
  )
    authorize(null);
  return configuration;
}

export async function configureGroups(
  input: unknown,
  actor: CompetitionActor,
  repository: H2HRepository,
  now = new Date(),
) {
  const session = requireCompetitionActor(actor);
  const parsed = z
    .object({
      competitionId: z.uuid(),
      groupSize: z.coerce.number().int(),
      advancersPerGroup: z.coerce.number().int(),
    })
    .safeParse(input);
  if (!parsed.success) invalid();
  const aggregate = authorize(
    await repository.get(parsed.data.competitionId, session.userId),
  );
  if (
    aggregate.competition.type !== "GROUP_PLAYOFFS" ||
    aggregate.competition.status !== "DRAFT"
  )
    invalid();
  const configuration = domain(() =>
    validateGroupPhaseConfiguration({
      participantCount: aggregate.participants.length,
      groupSize: parsed.data.groupSize,
      advancersPerGroup: parsed.data.advancersPerGroup,
    }),
  );
  if (
    !(await repository.configure(
      aggregate.competition.id,
      session.userId,
      configuration,
      now,
    ))
  )
    authorize(null);
  return configuration;
}

export async function generateLeaguePhaseSchedule(
  input: unknown,
  actor: CompetitionActor,
  repository: H2HRepository,
  now = new Date(),
) {
  const session = requireCompetitionActor(actor);
  const parsed = z.object({ competitionId: z.uuid() }).safeParse(input);
  if (!parsed.success) invalid();
  const result = await repository.generate(
    parsed.data.competitionId,
    session.userId,
    (aggregate) => {
      authorize(aggregate);
      if (aggregate.generated)
        return {
          drawOrder: [],
          groups: [],
          matchups: [],
          actorUserId: session.userId,
          generatedAt: now,
        };
      if (
        aggregate.competition.type !== "LEAGUE_PLAYOFFS" ||
        aggregate.competition.status !== "STARTED" ||
        aggregate.configuration?.type !== "LEAGUE_PLAYOFFS"
      )
        invalid();
      if (
        aggregate.rounds.length !== aggregate.configuration.roundCount ||
        aggregate.rounds.some((round) => round.status !== "DRAFT")
      )
        invalid("Prepara el número exacto de jornadas antes de sortear.");
      const drawOrder = secureShuffle(
        aggregate.participants.map((participant) => participant.id),
      );
      const bySequence = new Map(
        aggregate.rounds.map((round) => [round.sequence, round.id]),
      );
      const schedule = generateRoundRobinSchedule(
        drawOrder,
        aggregate.configuration.roundCount,
      );
      return {
        drawOrder,
        groups: [],
        matchups: schedule.map((item) => ({
          id: randomUUID(),
          roundId: bySequence.get(item.slot)!,
          groupId: null,
          participantAId: item.participantAId,
          participantBId: item.participantBId,
          position: item.position,
        })),
        actorUserId: session.userId,
        generatedAt: now,
      };
    },
  );
  return authorize(result);
}

export async function generateGroups(
  input: unknown,
  actor: CompetitionActor,
  repository: H2HRepository,
  now = new Date(),
) {
  const session = requireCompetitionActor(actor);
  const parsed = z
    .object({
      competitionId: z.uuid(),
      groups: z.array(z.object({ participantIds: z.array(z.uuid()) })),
    })
    .safeParse(input);
  if (!parsed.success) invalid();
  const result = await repository.generate(
    parsed.data.competitionId,
    session.userId,
    (aggregate) => {
      authorize(aggregate);
      if (aggregate.generated)
        return {
          drawOrder: [],
          groups: [],
          matchups: [],
          actorUserId: session.userId,
          generatedAt: now,
        };
      if (
        aggregate.competition.type !== "GROUP_PLAYOFFS" ||
        aggregate.competition.status !== "STARTED" ||
        aggregate.configuration?.type !== "GROUP_PLAYOFFS"
      )
        invalid();
      const requiredRounds = aggregate.configuration.groupSize - 1;
      if (
        aggregate.rounds.length !== requiredRounds ||
        aggregate.rounds.some((round) => round.status !== "DRAFT")
      )
        invalid("Prepara el número exacto de jornadas antes de confirmar los grupos.");
      domain(() =>
        validateGroupAssignments({
          participantIds: aggregate.participants.map((participant) => participant.id),
          groupSize:
            aggregate.configuration!.type === "GROUP_PLAYOFFS"
              ? aggregate.configuration!.groupSize
              : 4,
          groups: parsed.data.groups,
        }),
      );
      const rounds = new Map(aggregate.rounds.map((round) => [round.sequence, round.id]));
      const groups = parsed.data.groups.map((group, index) => ({
        id: randomUUID(),
        position: index + 1,
        participantIds: group.participantIds,
      }));
      return {
        drawOrder: [],
        groups,
        matchups: groups.flatMap((group) =>
          generateRoundRobinSchedule(group.participantIds).map((item) => ({
            id: randomUUID(),
            roundId: rounds.get(item.slot)!,
            groupId: group.id,
            participantAId: item.participantAId,
            participantBId: item.participantBId,
            position:
              (group.position - 1) *
                (aggregate.configuration!.type === "GROUP_PLAYOFFS"
                  ? aggregate.configuration!.groupSize / 2
                  : 1) +
              item.position,
          })),
        ),
        actorUserId: session.userId,
        generatedAt: now,
      };
    },
  );
  return authorize(result);
}

export async function getH2HStructure(
  input: unknown,
  actor: CompetitionActor,
  repository: H2HRepository,
) {
  const session = requireCompetitionActor(actor);
  const parsed = z.object({ competitionId: z.uuid() }).safeParse(input);
  if (!parsed.success) invalid();
  const value = await repository.get(parsed.data.competitionId, session.userId);
  if (!value) return authorize(null);
  return value;
}

function roundScoreModel(
  aggregate: StandingsAggregate,
  structure: H2HStructure,
  now: Date,
) {
  const scores = new Map<string, Map<string, { total: number; exact: number }>>();
  const states = new Map<string, ReturnType<typeof deriveH2HMatchState>>();
  for (const item of aggregate.rounds) {
    const status = effectiveRoundStatus(item.round, now);
    const eligibleIds = aggregate.participants
      .map((participant) => participant.id)
      .filter(
        (participantId) =>
          status === "FINALIZED" ||
          !aggregate.restrictedParticipantIds.has(participantId),
      );
    const eligible = new Set(eligibleIds);
    const roundMatchups = structure.matchups.filter(
      (matchup) => matchup.roundId === item.round.id,
    );
    const rivals = new Map<string, string | null>();
    for (const matchup of roundMatchups) {
      rivals.set(matchup.participantAId, matchup.participantBId);
      if (matchup.participantBId)
        rivals.set(matchup.participantBId, matchup.participantAId);
    }
    const breakdowns = calculateRoundScoreBreakdowns({
      questions: item.questions,
      participantIds: eligibleIds,
      answers: item.answers.filter((answer) => eligible.has(answer.participantId)),
      results: item.results,
      judgments: item.judgments,
      unansweredPenalty: item.round.unansweredPenalty,
      now,
      rivalParticipantIdByParticipant: rivals,
    }).byParticipant;
    scores.set(
      item.round.id,
      new Map(
        aggregate.participants.map((participant) => {
          const value = breakdowns.get(participant.id);
          return [
            participant.id,
            { total: value?.total ?? 0, exact: value?.exactScorePoints ?? 0 },
          ];
        }),
      ),
    );
    const complete = item.questions.filter(
      (question) =>
        now.valueOf() >= question.deadlineAt.valueOf() &&
        isQuestionResultComplete({
          question,
          answers: item.answers.filter((answer) => answer.questionId === question.id),
          result:
            item.results.find((result) => result.questionId === question.id) ?? null,
          judgments: item.judgments,
        }),
    ).length;
    states.set(
      item.round.id,
      deriveH2HMatchState({
        resultCompleteQuestionCount: complete,
        requiredQuestionCount: item.questions.length,
        effectiveRoundStatus: status,
      }),
    );
  }
  return { scores, states };
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function h2hSourceFingerprint(
  aggregate: StandingsAggregate,
  structure: H2HStructure,
  now: Date,
) {
  const byId = <T extends { id: string }>(values: readonly T[]) =>
    [...values].sort((left, right) => left.id.localeCompare(right.id));
  return hash({
    configuration: structure.configuration,
    drawOrder: structure.drawOrder,
    groups: [...structure.groups].sort((left, right) => left.position - right.position),
    matchups: [...structure.matchups].sort(
      (left, right) =>
        structure.rounds.find((item) => item.id === left.roundId)!.sequence -
          structure.rounds.find((item) => item.id === right.roundId)!.sequence ||
        left.position - right.position ||
        left.id.localeCompare(right.id),
    ),
    participants: structure.participants.map((item) => item.id).sort(),
    rounds: aggregate.rounds.map((item) => ({
      round: item.round,
      effectiveStatus: effectiveRoundStatus(item.round, now),
      eligibleParticipantIds: aggregate.participants
        .map((participant) => participant.id)
        .filter(
          (participantId) =>
            effectiveRoundStatus(item.round, now) === "FINALIZED" ||
            !aggregate.restrictedParticipantIds.has(participantId),
        )
        .sort(),
      questions: [...item.questions].sort(
        (left, right) => left.sequence - right.sequence,
      ),
      answers: byId(item.answers),
      results: byId(item.results),
      judgments: [...item.judgments].sort((left, right) =>
        left.answerId.localeCompare(right.answerId),
      ),
    })),
  });
}

function h2hTieFingerprint(participantIds: readonly string[]) {
  return hash([...participantIds].sort());
}

/** Privacy-safe derived H2H center. Answers never leave the application layer. */
export async function getH2HMatchups(
  input: unknown,
  actor: CompetitionActor,
  structureRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  now = new Date(),
) {
  const structure = await getH2HStructure(input, actor, structureRepository);
  const session = requireCompetitionActor(actor);
  const aggregate = await standingsRepository.getCompetition(
    structure.competition.id,
    session.userId,
  );
  if (!aggregate) authorize(null);
  const model = roundScoreModel(aggregate!, structure, now);
  const names = new Map(structure.participants.map((item) => [item.id, item.name]));
  const rounds = new Map(structure.rounds.map((item) => [item.id, item.sequence]));
  const groups = new Map(structure.groups.map((item) => [item.id, item.position]));
  return structure.matchups.map((matchup) => ({
    id: matchup.id,
    roundId: matchup.roundId,
    roundLabel: `Jornada ${rounds.get(matchup.roundId)}`,
    groupId: matchup.groupId,
    groupLabel: matchup.groupId
      ? `Grupo ${String.fromCharCode(64 + (groups.get(matchup.groupId) ?? 1))}`
      : null,
    participantA: {
      id: matchup.participantAId,
      name: names.get(matchup.participantAId)!,
      predictionScore:
        model.scores.get(matchup.roundId)?.get(matchup.participantAId)?.total ?? 0,
    },
    participantB: matchup.participantBId
      ? {
          id: matchup.participantBId,
          name: names.get(matchup.participantBId)!,
          predictionScore:
            model.scores.get(matchup.roundId)?.get(matchup.participantBId)?.total ?? 0,
        }
      : null,
    state: model.states.get(matchup.roundId) ?? "POR_JUGAR",
  }));
}

export async function getMyH2HMatchup(
  input: unknown,
  actor: CompetitionActor,
  structureRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  now = new Date(),
) {
  const structure = await getH2HStructure(input, actor, structureRepository);
  if (!structure.currentParticipantId) return null;
  const matchups = await getH2HMatchups(
    input,
    actor,
    structureRepository,
    standingsRepository,
    now,
  );
  const mine = matchups.filter(
    (item) =>
      item.participantA.id === structure.currentParticipantId ||
      item.participantB?.id === structure.currentParticipantId,
  );
  const selected = mine.find((item) => item.state !== "FINAL") ?? mine.at(-1) ?? null;
  if (!selected) return null;
  const participantIsA = selected.participantA.id === structure.currentParticipantId;
  return {
    ...selected,
    participant: participantIsA ? selected.participantA : selected.participantB!,
    rival: participantIsA ? selected.participantB : selected.participantA,
  };
}

export async function getH2HStandings(
  input: unknown,
  actor: CompetitionActor,
  structureRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  now = new Date(),
) {
  const structure = await getH2HStructure(input, actor, structureRepository);
  const session = requireCompetitionActor(actor);
  const aggregate = await standingsRepository.getCompetition(
    structure.competition.id,
    session.userId,
  );
  if (!aggregate) authorize(null);
  const model = roundScoreModel(aggregate!, structure, now);
  const sourceFingerprint = h2hSourceFingerprint(aggregate!, structure, now);
  const groupModels = (
    structure.competition.type === "GROUP_PLAYOFFS"
      ? structure.groups
      : [
          {
            id: null,
            position: 1,
            participantIds: structure.participants.map((p) => p.id),
          },
        ]
  ).map((group) => {
    const participantScores = group.participantIds.map((participantId) => ({
      participantId,
      predictionScore: [...model.scores.values()].reduce(
        (total, roundScores) => total + (roundScores.get(participantId)?.total ?? 0),
        0,
      ),
      exactScorePoints: [...model.scores.values()].reduce(
        (total, roundScores) => total + (roundScores.get(participantId)?.exact ?? 0),
        0,
      ),
    }));
    const values = deriveH2HStandingValues({
      participantScores,
      matchups: structure.matchups
        .filter((matchup) => matchup.groupId === group.id)
        .map((matchup) => ({
          ...matchup,
          participantAScore:
            model.scores.get(matchup.roundId)?.get(matchup.participantAId)?.total ?? 0,
          participantBScore: matchup.participantBId
            ? (model.scores.get(matchup.roundId)?.get(matchup.participantBId)?.total ?? 0)
            : null,
          hasResult: model.states.get(matchup.roundId) !== "POR_JUGAR",
        })),
    });
    const rankingValues = values.map((value) => ({ ...value, h2hWins: value.wins }));
    const rawRanking = rankH2H(rankingValues);
    const scope = group.id === null ? "H2H_PHASE" : "GROUP_STANDINGS";
    const resolutions = rawRanking.unresolvedGroups.flatMap((tie) => {
      const tieFingerprint = h2hTieFingerprint(tie);
      const current = aggregate!.resolutions
        .filter(
          (resolution) =>
            resolution.scope === scope &&
            resolution.groupId === group.id &&
            resolution.sourceFingerprint === sourceFingerprint &&
            resolution.tieFingerprint === tieFingerprint,
        )
        .sort((left, right) => right.revision - left.revision)[0];
      return current ? [{ participantIds: current.participantIds }] : [];
    });
    const ranking = rankH2H(rankingValues, resolutions);
    const qualifierCount =
      structure.configuration?.type === "LEAGUE_PLAYOFFS"
        ? structure.configuration.qualifierCount
        : structure.configuration?.type === "GROUP_PLAYOFFS"
          ? structure.configuration.advancersPerGroup
          : 0;
    const decisionGroups = requiredQualifierTieGroups({
      rows: rawRanking.rows.map((row) => ({
        participantId: row.participant.participantId,
        position: row.position,
        unresolved: row.unresolved,
      })),
      qualifierCount,
    });
    const requiredTies = requiredQualifierTieGroups({
      rows: ranking.rows.map((row) => ({
        participantId: row.participant.participantId,
        position: row.position,
        unresolved: row.unresolved,
      })),
      qualifierCount,
    });
    const readiness = classificationReadiness({
      roundStatuses: aggregate!.rounds.map((item) =>
        effectiveRoundStatus(item.round, now),
      ),
      unresolvedTieCount: requiredTies.length,
    });
    const official = new Set(
      qualifiedParticipantIds({
        orderedParticipantIds: ranking.rows.map((row) => row.participant.participantId),
        qualifierCount,
        readiness,
      }),
    );
    return {
      groupId: group.id,
      groupLabel: group.id ? `Grupo ${String.fromCharCode(64 + group.position)}` : null,
      sourceFingerprint,
      readiness,
      decisionGroups,
      requiredTieGroups: requiredTies,
      rows: ranking.rows.map((row) => ({
        participantId: row.participant.participantId,
        participantName:
          structure.participants.find((item) => item.id === row.participant.participantId)
            ?.name ?? "Participante",
        position: row.position,
        h2hPoints: row.participant.h2hPoints,
        predictionScore: row.participant.predictionScore,
        exactScorePoints: row.participant.exactScorePoints,
        played: values.find(
          (item) => item.participantId === row.participant.participantId,
        )!.played,
        wins: row.participant.h2hWins,
        unresolved: row.unresolved,
        qualification: official.has(row.participant.participantId)
          ? "OFICIAL"
          : row.position <= qualifierCount
            ? "PROVISIONAL"
            : "NO_CLASIFICA",
      })),
    };
  });
  return groupModels;
}

export const getGroupStandings = getH2HStandings;

export async function getH2HPoints(
  input: unknown,
  actor: CompetitionActor,
  structureRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  now = new Date(),
) {
  const groups = await getH2HStandings(
    input,
    actor,
    structureRepository,
    standingsRepository,
    now,
  );
  return groups.flatMap((group) =>
    group.rows.map((row) => ({
      participantId: row.participantId,
      h2hPoints: row.h2hPoints,
      played: row.played,
      wins: row.wins,
    })),
  );
}

const h2hResolutionInput = z.object({
  competitionId: z.uuid(),
  groupId: z.uuid().nullable().optional(),
  participantIds: z.array(z.uuid()).min(2),
});

async function resolveH2HTieInternal(
  input: unknown,
  actorValue: CompetitionActor,
  structureRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  expectedScope: "H2H_PHASE" | "GROUP_STANDINGS",
  now: Date,
) {
  const actor = requireCompetitionActor(actorValue);
  const parsed = h2hResolutionInput.safeParse(input);
  if (
    !parsed.success ||
    new Set(parsed.data.participantIds).size !== parsed.data.participantIds.length
  )
    invalid("Revisa el orden completo del desempate.");
  const groupId = parsed.data.groupId ?? null;
  if (
    (expectedScope === "H2H_PHASE" && groupId !== null) ||
    (expectedScope === "GROUP_STANDINGS" && groupId === null)
  )
    invalid("Este desempate no corresponde a la fase.");
  const structure = await getH2HStructure(
    { competitionId: parsed.data.competitionId },
    actorValue,
    structureRepository,
  );
  const view = await getH2HStandings(
    { competitionId: parsed.data.competitionId },
    actorValue,
    structureRepository,
    standingsRepository,
    now,
  );
  const target = view.find((item) => item.groupId === groupId);
  const submitted = parsed.data.participantIds;
  const tied = target?.decisionGroups.find(
    (candidate) =>
      candidate.length === submitted.length &&
      submitted.every((participantId) => candidate.includes(participantId)),
  );
  if (!target || !tied || target.readiness === "PROVISIONAL")
    invalid("El empate cambió o la fase todavía no es definitiva.");
  const changed = await standingsRepository.resolve(
    parsed.data.competitionId,
    actor.userId,
    now,
    (aggregate) => {
      if (!aggregate.actorIsAdmin)
        throw new ApplicationError(
          "UNAUTHORIZED",
          "No tienes permiso para resolver este empate.",
        );
      if (
        aggregate.rounds.length === 0 ||
        aggregate.rounds.some(
          (item) => effectiveRoundStatus(item.round, now) !== "FINALIZED",
        )
      )
        invalid("La fase todavía no es definitiva.");
      const sourceFingerprint = h2hSourceFingerprint(aggregate, structure, now);
      if (sourceFingerprint !== target.sourceFingerprint)
        invalid("Los resultados cambiaron. Actualiza la página.");
      const tieFingerprint = h2hTieFingerprint(tied);
      const previous = aggregate.resolutions
        .filter(
          (resolution) =>
            resolution.scope === expectedScope &&
            resolution.groupId === groupId &&
            resolution.sourceFingerprint === sourceFingerprint &&
            resolution.tieFingerprint === tieFingerprint,
        )
        .sort((left, right) => right.revision - left.revision)[0];
      return {
        id: randomUUID(),
        competitionId: aggregate.competition.id,
        scope: expectedScope,
        roundId: null,
        groupId,
        sourceFingerprint,
        tieFingerprint,
        revision: (previous?.revision ?? 0) + 1,
        supersedesResolutionId: previous?.id ?? null,
        action: previous ? ("CORRECTED" as const) : ("CREATED" as const),
        actorUserId: actor.userId,
        createdAt: now,
        participantIds: submitted,
      };
    },
  );
  if (!changed)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible guardar el desempate.");
  return { success: true } as const;
}

export function resolveH2HTie(
  input: unknown,
  actor: CompetitionActor,
  structureRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  now = new Date(),
) {
  return resolveH2HTieInternal(
    input,
    actor,
    structureRepository,
    standingsRepository,
    "H2H_PHASE",
    now,
  );
}

export function resolveGroupTie(
  input: unknown,
  actor: CompetitionActor,
  structureRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  now = new Date(),
) {
  return resolveH2HTieInternal(
    input,
    actor,
    structureRepository,
    standingsRepository,
    "GROUP_STANDINGS",
    now,
  );
}
