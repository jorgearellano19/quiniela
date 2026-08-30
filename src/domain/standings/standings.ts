import type { PredictionScoreBreakdown } from "@/domain/scoring/scoring";

export type RankingResolution = Readonly<{
  participantIds: readonly string[];
}>;

export type RankedRow<T> = Readonly<{
  participant: T;
  position: number;
  unresolved: boolean;
}>;

export type RankingResult<T> = Readonly<{
  rows: readonly RankedRow<T>[];
  unresolvedGroups: readonly (readonly string[])[];
}>;

export type LeagueRankingInput = Readonly<{
  participantId: string;
  score: PredictionScoreBreakdown;
}>;

export type H2HStandingInput = Readonly<{
  participantId: string;
  h2hPoints: number;
  predictionScore: number;
  exactScorePoints: number;
  h2hWins: number;
}>;

export type RoundWinnerInput = Readonly<{
  participantId: string;
  roundScore: number;
  matchQuestionPoints: number;
  phaseScore: number;
  completedAt: Date | null;
}>;

export type LeaguePhasePrizeInput = Readonly<{
  participantId: string;
  predictionScore: number;
  exactScorePoints: number;
}>;

export type DirectH2HResult = Readonly<{
  participantAId: string;
  participantBId: string;
  participantAPoints: 0 | 1 | 3;
  participantBPoints: 0 | 1 | 3;
}>;

export type WinnerResult<T> =
  | Readonly<{ state: "notReady" }>
  | Readonly<{ state: "unresolved"; tiedParticipantIds: readonly string[] }>
  | Readonly<{ state: "resolved"; winner: T }>;

export class StandingsDomainError extends Error {}

function assertUnique<T extends { participantId: string }>(values: readonly T[]) {
  if (new Set(values.map((value) => value.participantId)).size !== values.length)
    throw new StandingsDomainError("Duplicate participant in ranking input.");
}

function compareNumbers(left: number, right: number) {
  return right - left;
}

function order<T extends { participantId: string }>(input: {
  values: readonly T[];
  compare: (left: T, right: T) => number;
  resolutions?: readonly RankingResolution[] | undefined;
}): RankingResult<T> {
  assertUnique(input.values);
  const values = [...input.values].sort(input.compare);
  const rows: RankedRow<T>[] = [];
  const unresolvedGroups: string[][] = [];
  let index = 0;
  while (index < values.length) {
    const start = index;
    const group = [values[index]!];
    while (
      index + 1 < values.length &&
      input.compare(values[start]!, values[index + 1]!) === 0
    ) {
      index += 1;
      group.push(values[index]!);
    }
    const groupIds = group.map((item) => item.participantId);
    const resolution = input.resolutions?.find(
      (item) =>
        item.participantIds.length === groupIds.length &&
        item.participantIds.every((id) => groupIds.includes(id)),
    );
    const ranked = resolution
      ? resolution.participantIds.map((id) =>
          group.find((item) => item.participantId === id)!,
        )
      : group;
    if (group.length > 1 && !resolution) unresolvedGroups.push(groupIds);
    for (const [offset, participant] of ranked.entries())
      rows.push({
        participant,
        position: resolution ? start + offset + 1 : start + 1,
        unresolved: group.length > 1 && !resolution,
      });
    index += 1;
  }
  return { rows, unresolvedGroups };
}

export function rankLeague(
  values: readonly LeagueRankingInput[],
  resolutions?: readonly RankingResolution[] | undefined,
) {
  return order({
    values,
    compare: (left, right) =>
      compareNumbers(left.score.total, right.score.total) ||
      compareNumbers(left.score.exactScorePoints, right.score.exactScorePoints),
    resolutions,
  });
}

export function rankH2H(
  values: readonly H2HStandingInput[],
  resolutions?: readonly RankingResolution[] | undefined,
) {
  return order({
    values,
    compare: (left, right) =>
      compareNumbers(left.h2hPoints, right.h2hPoints) ||
      compareNumbers(left.predictionScore, right.predictionScore) ||
      compareNumbers(left.exactScorePoints, right.exactScorePoints) ||
      compareNumbers(left.h2hWins, right.h2hWins),
    resolutions,
  });
}

export function selectRoundWinner(input: {
  ready: boolean;
  values: readonly RoundWinnerInput[];
  resolution?: RankingResolution | undefined;
}): WinnerResult<RoundWinnerInput> {
  if (!input.ready || input.values.length === 0) return { state: "notReady" };
  const ranking = order({
    values: input.values,
    compare: (left, right) =>
      compareNumbers(left.roundScore, right.roundScore) ||
      compareNumbers(left.matchQuestionPoints, right.matchQuestionPoints) ||
      compareNumbers(left.phaseScore, right.phaseScore) ||
      (left.completedAt === null && right.completedAt === null
        ? 0
        : left.completedAt === null
          ? 1
          : right.completedAt === null
            ? -1
            : left.completedAt.valueOf() - right.completedAt.valueOf()),
    resolutions: input.resolution ? [input.resolution] : undefined,
  });
  const firstGroup = ranking.unresolvedGroups.find((group) =>
    group.includes(ranking.rows[0]!.participant.participantId),
  );
  return firstGroup
    ? { state: "unresolved", tiedParticipantIds: firstGroup }
    : { state: "resolved", winner: ranking.rows[0]!.participant };
}

export function selectLeaguePhasePrizeWinner(input: {
  ready: boolean;
  values: readonly LeaguePhasePrizeInput[];
  directH2H: readonly DirectH2HResult[];
  resolution?: RankingResolution;
}): WinnerResult<LeaguePhasePrizeInput> {
  if (!input.ready || input.values.length === 0) return { state: "notReady" };
  assertUnique(input.values);
  const primary = [...input.values].sort(
    (left, right) =>
      compareNumbers(left.predictionScore, right.predictionScore) ||
      compareNumbers(left.exactScorePoints, right.exactScorePoints),
  );
  const tied = primary.filter(
    (value) =>
      value.predictionScore === primary[0]!.predictionScore &&
      value.exactScorePoints === primary[0]!.exactScorePoints,
  );
  if (tied.length === 1) return { state: "resolved", winner: tied[0]! };
  if (tied.length === 2) {
    const [left, right] = tied;
    const meetings = input.directH2H.filter(
      (item) =>
        (item.participantAId === left!.participantId &&
          item.participantBId === right!.participantId) ||
        (item.participantAId === right!.participantId &&
          item.participantBId === left!.participantId),
    );
    const points = (participantId: string) =>
      meetings.reduce(
        (total, item) =>
          total +
          (item.participantAId === participantId
            ? item.participantAPoints
            : item.participantBPoints),
        0,
      );
    if (meetings.length && points(left!.participantId) !== points(right!.participantId))
      return {
        state: "resolved",
        winner:
          points(left!.participantId) > points(right!.participantId) ? left! : right!,
      };
  }
  const resolution = input.resolution;
  if (
    resolution &&
    resolution.participantIds.length === tied.length &&
    resolution.participantIds.every((id) =>
      tied.some((value) => value.participantId === id),
    )
  )
    return {
      state: "resolved",
      winner: tied.find((value) => value.participantId === resolution.participantIds[0])!,
    };
  return {
    state: "unresolved",
    tiedParticipantIds: tied.map((item) => item.participantId),
  };
}
