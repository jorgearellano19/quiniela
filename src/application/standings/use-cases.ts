import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Answer } from "@/domain/answer/answer";
import type {
  CompetitionStatus,
  CompetitionType,
} from "@/domain/competition/competition";
import type { Question, Round } from "@/domain/round/round";
import {
  calculateRoundScoreBreakdowns,
  type OfficialResult,
  type OpenTextJudgment,
  type PredictionScoreBreakdown,
} from "@/domain/scoring/scoring";
import { effectiveRoundStatus } from "@/domain/scoring/lifecycle";
import {
  rankH2H,
  rankLeague,
  selectRoundWinner,
  type H2HStandingInput,
  type RankingResolution,
  type RoundWinnerInput,
} from "@/domain/standings/standings";
import {
  requireCompetitionActor,
  type CompetitionActor,
} from "@/application/competition/boundary";
import { ApplicationError } from "@/lib/errors/application-error";

export type RankingScope =
  "LEAGUE_STANDINGS" | "ROUND_WINNER" | "H2H_PHASE" | "GROUP_STANDINGS";

export type StandingParticipant = Readonly<{
  id: string;
  name: string;
  email: string;
}>;

export type StandingRound = Readonly<{
  round: Round;
  questions: readonly Question[];
  answers: readonly Answer[];
  results: readonly OfficialResult[];
  judgments: readonly OpenTextJudgment[];
}>;

export type StoredRankingResolution = Readonly<{
  id: string;
  scope: RankingScope;
  roundId: string | null;
  groupId: string | null;
  sourceFingerprint: string;
  tieFingerprint: string;
  revision: number;
  participantIds: readonly string[];
}>;

export type StandingsAggregate = Readonly<{
  competition: Readonly<{
    id: string;
    name: string;
    type: CompetitionType;
    status: CompetitionStatus;
  }>;
  participants: readonly StandingParticipant[];
  rounds: readonly StandingRound[];
  resolutions: readonly StoredRankingResolution[];
  actorIsAdmin: boolean;
  restrictedParticipantIds: ReadonlySet<string>;
}>;

type ResolutionWrite = Readonly<{
  id: string;
  competitionId: string;
  scope: RankingScope;
  roundId: string | null;
  groupId: string | null;
  sourceFingerprint: string;
  tieFingerprint: string;
  revision: number;
  supersedesResolutionId: string | null;
  action: "CREATED" | "CORRECTED";
  actorUserId: string;
  createdAt: Date;
  participantIds: readonly string[];
}>;

export interface StandingsRepository {
  getCompetition(
    competitionId: string,
    userId: string,
  ): Promise<StandingsAggregate | null>;
  resolve(
    competitionId: string,
    userId: string,
    now: Date,
    operation: (aggregate: StandingsAggregate) => ResolutionWrite,
  ): Promise<StandingsAggregate | null>;
}

const resolutionInput = z.object({
  competitionId: z.uuid(),
  scope: z.enum(["LEAGUE_STANDINGS", "ROUND_WINNER"]),
  roundId: z.uuid().nullable().optional(),
  participantIds: z.array(z.uuid()).min(2),
});

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function ordered<T extends { id: string }>(values: readonly T[]) {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

function fingerprint(
  aggregate: StandingsAggregate,
  rounds: readonly StandingRound[],
  now: Date,
) {
  return hash({
    participants: ordered(aggregate.participants).map((participant) => participant.id),
    rounds: [...rounds]
      .sort((left, right) => left.round.sequence - right.round.sequence)
      .map((item) => ({
        round: item.round,
        eligibleParticipantIds: ordered(aggregate.participants)
          .map((participant) => participant.id)
          .filter(
            (participantId) =>
              effectiveRoundStatus(item.round, now) === "FINALIZED" ||
              !aggregate.restrictedParticipantIds.has(participantId),
          ),
        questions: [...item.questions].sort((a, b) => a.sequence - b.sequence),
        answers: ordered(item.answers),
        results: ordered(item.results),
        judgments: [...item.judgments].sort((a, b) =>
          a.answerId.localeCompare(b.answerId),
        ),
      })),
  });
}

function tieFingerprint(participantIds: readonly string[]) {
  return hash([...participantIds].sort());
}

function scoresForRounds(
  aggregate: StandingsAggregate,
  rounds: readonly StandingRound[],
  now: Date,
) {
  const byRound = new Map<string, ReadonlyMap<string, PredictionScoreBreakdown>>();
  let supported = true;
  for (const item of rounds) {
    if (item.round.status === "DRAFT") continue;
    const finalized = effectiveRoundStatus(item.round, now) === "FINALIZED";
    const eligibleParticipantIds = aggregate.participants
      .map((participant) => participant.id)
      .filter(
        (participantId) =>
          finalized || !aggregate.restrictedParticipantIds.has(participantId),
      );
    const eligibleParticipantIdSet = new Set(eligibleParticipantIds);
    const result = calculateRoundScoreBreakdowns({
      questions: item.questions,
      participantIds: eligibleParticipantIds,
      answers: item.answers.filter((answer) =>
        eligibleParticipantIdSet.has(answer.participantId),
      ),
      results: item.results,
      judgments: item.judgments,
      unansweredPenalty: item.round.unansweredPenalty,
      now,
    });
    supported = supported && result.supported;
    byRound.set(item.round.id, result.byParticipant);
  }
  return { byRound, supported };
}

function matchingResolutions(
  aggregate: StandingsAggregate,
  scope: RankingScope,
  roundId: string | null,
  source: string,
  groups: readonly (readonly string[])[],
): RankingResolution[] {
  return groups.flatMap((group) => {
    const tie = tieFingerprint(group);
    const current = aggregate.resolutions
      .filter(
        (resolution) =>
          resolution.scope === scope &&
          resolution.roundId === roundId &&
          resolution.sourceFingerprint === source &&
          resolution.tieFingerprint === tie,
      )
      .sort((left, right) => right.revision - left.revision)[0];
    return current ? [{ participantIds: current.participantIds }] : [];
  });
}

function leagueModel(aggregate: StandingsAggregate, now: Date) {
  const source = fingerprint(aggregate, aggregate.rounds, now);
  const scored = scoresForRounds(aggregate, aggregate.rounds, now);
  const values = aggregate.participants.map((participant) => {
    const score = [...scored.byRound.values()].reduce<PredictionScoreBreakdown>(
      (total, roundScore) => {
        const value = roundScore.get(participant.id);
        return {
          total: total.total + (value?.total ?? 0),
          exactScorePoints: total.exactScorePoints + (value?.exactScorePoints ?? 0),
          matchQuestionPoints:
            total.matchQuestionPoints + (value?.matchQuestionPoints ?? 0),
          completedAt: null,
        };
      },
      { total: 0, exactScorePoints: 0, matchQuestionPoints: 0, completedAt: null },
    );
    return { participantId: participant.id, score };
  });
  const rawRanking = rankLeague(values);
  const resolutions = matchingResolutions(
    aggregate,
    "LEAGUE_STANDINGS",
    null,
    source,
    rawRanking.unresolvedGroups,
  );
  const ranking = rankLeague(values, resolutions);
  const ready =
    aggregate.competition.status !== "DRAFT" &&
    aggregate.rounds.length > 0 &&
    scored.supported &&
    aggregate.rounds.every(
      (item) => effectiveRoundStatus(item.round, now) === "FINALIZED",
    );
  return { source, rawRanking, ranking, ready };
}

function roundModel(aggregate: StandingsAggregate, roundId: string, now: Date) {
  const target = aggregate.rounds.find((item) => item.round.id === roundId);
  if (!target) return null;
  const rounds = aggregate.rounds.filter(
    (item) => item.round.sequence <= target.round.sequence,
  );
  const source = fingerprint(aggregate, rounds, now);
  const scored = scoresForRounds(aggregate, rounds, now);
  const targetScores = scored.byRound.get(target.round.id);
  const values: RoundWinnerInput[] = aggregate.participants.map((participant) => {
    const targetScore = targetScores?.get(participant.id);
    return {
      participantId: participant.id,
      roundScore: targetScore?.total ?? 0,
      matchQuestionPoints: targetScore?.matchQuestionPoints ?? 0,
      phaseScore: [...scored.byRound.values()].reduce(
        (total, item) => total + (item.get(participant.id)?.total ?? 0),
        0,
      ),
      completedAt: targetScore?.completedAt ?? null,
    };
  });
  const ready =
    rounds.length > 0 &&
    scored.supported &&
    rounds.every((item) => effectiveRoundStatus(item.round, now) === "FINALIZED");
  const rawOutcome = selectRoundWinner({ ready, values });
  const groups = rawOutcome.state === "unresolved" ? [rawOutcome.tiedParticipantIds] : [];
  const resolution = matchingResolutions(
    aggregate,
    "ROUND_WINNER",
    roundId,
    source,
    groups,
  )[0];
  return {
    source,
    target,
    rawOutcome,
    resolution,
    outcome: selectRoundWinner({ ready, values, resolution }),
  };
}

function participant(aggregate: StandingsAggregate, participantId: string) {
  const value = aggregate.participants.find((item) => item.id === participantId);
  if (!value) throw new Error("Ranking participant disappeared.");
  return value;
}

export function getH2HStandings(
  values: readonly H2HStandingInput[],
  resolutions?: readonly RankingResolution[],
) {
  return rankH2H(values, resolutions);
}

export async function getLeagueStandings(
  repository: StandingsRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (!z.uuid().safeParse(competitionId).success) return null;
  const aggregate = await repository.getCompetition(competitionId, actor.userId);
  if (!aggregate || aggregate.competition.type !== "LEAGUE") return null;
  const model = leagueModel(aggregate, now);
  const top = model.ranking.rows[0];
  const topUnresolved = top?.unresolved ?? false;
  return {
    competitionId,
    competitionName: aggregate.competition.name,
    competitionStatus: aggregate.competition.status,
    ready: model.ready,
    canManage: aggregate.actorIsAdmin,
    winner:
      model.ready && top && !topUnresolved
        ? {
            id: top.participant.participantId,
            name: participant(aggregate, top.participant.participantId).name,
          }
        : null,
    rows: model.ranking.rows.map((row) => {
      const person = participant(aggregate, row.participant.participantId);
      return {
        participantId: person.id,
        participantName: person.name,
        adminLabel: aggregate.actorIsAdmin ? person.email : null,
        position: row.position,
        predictionScore: row.participant.score.total,
        exactScorePoints: row.participant.score.exactScorePoints,
        unresolved: row.unresolved,
      };
    }),
    unresolvedGroups: model.ready ? model.ranking.unresolvedGroups : [],
    decisionGroups: model.ready
      ? model.rawRanking.unresolvedGroups.map((group) => {
          const orderedIds = model.ranking.rows
            .map((row) => row.participant.participantId)
            .filter((id) => group.includes(id));
          return {
            participantIds: orderedIds,
            resolved: !model.ranking.unresolvedGroups.some(
              (unresolved) =>
                unresolved.length === group.length &&
                unresolved.every((id) => group.includes(id)),
            ),
          };
        })
      : [],
  };
}

export async function getLeagueWinner(
  repository: StandingsRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  now = new Date(),
) {
  const standings = await getLeagueStandings(repository, actorValue, competitionId, now);
  if (!standings || !standings.ready) return { state: "notReady" } as const;
  const first = standings.rows[0];
  if (!first || first.unresolved)
    return {
      state: "unresolved",
      tiedParticipantIds: standings.unresolvedGroups[0] ?? [],
    } as const;
  return { state: "resolved", winner: standings.winner! } as const;
}

export async function getRoundWinner(
  repository: StandingsRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (!z.uuid().safeParse(competitionId).success || !z.uuid().safeParse(roundId).success)
    return null;
  const aggregate = await repository.getCompetition(competitionId, actor.userId);
  if (!aggregate || aggregate.competition.type === "GROUP_PLAYOFFS") return null;
  const model = roundModel(aggregate, roundId, now);
  if (!model) return null;
  const outcome = model.outcome;
  return {
    roundId,
    roundName: model.target.round.name,
    canManage: aggregate.actorIsAdmin,
    outcome:
      outcome.state === "resolved"
        ? {
            state: "resolved" as const,
            winner: {
              id: outcome.winner.participantId,
              name: participant(aggregate, outcome.winner.participantId).name,
            },
          }
        : outcome,
    manualTie: model.rawOutcome.state === "unresolved",
    tiedParticipants:
      model.rawOutcome.state === "unresolved"
        ? (model.resolution?.participantIds ?? model.rawOutcome.tiedParticipantIds).map(
            (id) => ({
              id,
              name: participant(aggregate, id).name,
              adminLabel: aggregate.actorIsAdmin
                ? participant(aggregate, id).email
                : null,
            }),
          )
        : [],
  };
}

export async function resolveRankingTie(
  repository: StandingsRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  const parsed = resolutionInput.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError("INVALID_INPUT", "Revisa el orden del desempate.");
  if (
    (parsed.data.scope === "LEAGUE_STANDINGS" && parsed.data.roundId) ||
    (parsed.data.scope === "ROUND_WINNER" && !parsed.data.roundId)
  )
    throw new ApplicationError("INVALID_INPUT", "Revisa el desempate.");
  const changed = await repository.resolve(
    parsed.data.competitionId,
    actor.userId,
    now,
    (aggregate) => {
      if (!aggregate.actorIsAdmin)
        throw new ApplicationError(
          "UNAUTHORIZED",
          "No fue posible guardar el desempate.",
        );
      let source: string;
      let groups: readonly (readonly string[])[];
      if (parsed.data.scope === "LEAGUE_STANDINGS") {
        if (aggregate.competition.type !== "LEAGUE")
          throw new ApplicationError("INVALID_INPUT", "Este desempate no corresponde.");
        const model = leagueModel(aggregate, now);
        if (!model.ready)
          throw new ApplicationError(
            "INVALID_INPUT",
            "La clasificación aún no es definitiva.",
          );
        source = model.source;
        groups = model.rawRanking.unresolvedGroups;
      } else {
        const model = roundModel(aggregate, parsed.data.roundId!, now);
        if (!model || model.rawOutcome.state !== "unresolved")
          throw new ApplicationError("INVALID_INPUT", "La jornada no tiene este empate.");
        source = model.source;
        groups = [model.rawOutcome.tiedParticipantIds];
      }
      const submitted = parsed.data.participantIds;
      if (new Set(submitted).size !== submitted.length)
        throw new ApplicationError(
          "INVALID_INPUT",
          "El orden contiene participantes repetidos.",
        );
      const group = groups.find(
        (candidate) =>
          candidate.length === submitted.length &&
          submitted.every((id) => candidate.includes(id)),
      );
      if (!group)
        throw new ApplicationError(
          "INVALID_INPUT",
          "El empate cambió. Actualiza la página.",
        );
      const tie = tieFingerprint(group);
      const previous = aggregate.resolutions
        .filter(
          (item) =>
            item.scope === parsed.data.scope &&
            item.roundId === (parsed.data.roundId ?? null) &&
            item.sourceFingerprint === source &&
            item.tieFingerprint === tie,
        )
        .sort((left, right) => right.revision - left.revision)[0];
      return {
        id: randomUUID(),
        competitionId: aggregate.competition.id,
        scope: parsed.data.scope,
        roundId: parsed.data.roundId ?? null,
        groupId: null,
        sourceFingerprint: source,
        tieFingerprint: tie,
        revision: (previous?.revision ?? 0) + 1,
        supersedesResolutionId: previous?.id ?? null,
        action: previous ? "CORRECTED" : "CREATED",
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

export type LeagueStandings = NonNullable<Awaited<ReturnType<typeof getLeagueStandings>>>;
export type RoundWinnerDetail = NonNullable<Awaited<ReturnType<typeof getRoundWinner>>>;
