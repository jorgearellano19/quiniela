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
