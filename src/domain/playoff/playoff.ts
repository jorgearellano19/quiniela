export type PlayoffSeed = Readonly<{ participantId: string; seed: number }>;

export type PlayoffPairing = Readonly<{
  position: number;
  participantAId: string;
  participantASeed: number;
  participantBId: string;
  participantBSeed: number;
}>;

export type PlayoffAdvancementMode = "BEST_SEED" | "TIEBREAKER_QUESTION";

export type PlayoffWinner =
  | Readonly<{
      state: "WINNER";
      participantId: string;
      decidedBy: "SCORE" | "SEED" | "TIEBREAKER" | "MANUAL";
    }>
  | Readonly<{ state: "UNRESOLVED" }>;

export class PlayoffDomainError extends Error {}

export function validatePlayoffSeeds(
  seeds: readonly PlayoffSeed[],
): readonly PlayoffSeed[] {
  if (seeds.length < 2 || (seeds.length & (seeds.length - 1)) !== 0)
    throw new PlayoffDomainError("Playoff field must be a power of two.");
  if (new Set(seeds.map((item) => item.participantId)).size !== seeds.length)
    throw new PlayoffDomainError("Playoff participants must be unique.");
  const ordered = [...seeds].sort((left, right) => left.seed - right.seed);
  if (ordered.some((item, index) => !item.participantId || item.seed !== index + 1))
    throw new PlayoffDomainError("Playoff seeds must be contiguous and positive.");
  return ordered;
}

export function generatePlayoffPairings(
  seeds: readonly PlayoffSeed[],
): readonly PlayoffPairing[] {
  const remaining = [...validatePlayoffSeeds(seeds)];
  const result: PlayoffPairing[] = [];
  while (remaining.length) {
    const high = remaining.shift()!;
    const low = remaining.pop()!;
    result.push({
      position: result.length + 1,
      participantAId: high.participantId,
      participantASeed: high.seed,
      participantBId: low.participantId,
      participantBSeed: low.seed,
    });
  }
  return result;
}

export function resolvePlayoffWinner(input: {
  participantAId: string;
  participantASeed: number;
  participantAScore: number;
  participantATiebreakerPoints?: number;
  participantBId: string;
  participantBSeed: number;
  participantBScore: number;
  participantBTiebreakerPoints?: number;
  mode: PlayoffAdvancementMode;
  manualWinnerId?: string | null;
}): PlayoffWinner {
  const participants = [input.participantAId, input.participantBId];
  if (input.manualWinnerId) {
    if (!participants.includes(input.manualWinnerId))
      throw new PlayoffDomainError("Manual winner must belong to the matchup.");
    return { state: "WINNER", participantId: input.manualWinnerId, decidedBy: "MANUAL" };
  }
  if (input.participantAScore !== input.participantBScore)
    return {
      state: "WINNER",
      participantId:
        input.participantAScore > input.participantBScore
          ? input.participantAId
          : input.participantBId,
      decidedBy: "SCORE",
    };
  if (input.mode === "BEST_SEED")
    return {
      state: "WINNER",
      participantId:
        input.participantASeed < input.participantBSeed
          ? input.participantAId
          : input.participantBId,
      decidedBy: "SEED",
    };
  const a = input.participantATiebreakerPoints;
  const b = input.participantBTiebreakerPoints;
  if (a === undefined || b === undefined || a === b) return { state: "UNRESOLVED" };
  return {
    state: "WINNER",
    participantId: a > b ? input.participantAId : input.participantBId,
    decidedBy: "TIEBREAKER",
  };
}

export function expectedPlayoffRoundCount(fieldSize: number): number {
  if (fieldSize < 2 || (fieldSize & (fieldSize - 1)) !== 0)
    throw new PlayoffDomainError("Playoff field must be a power of two.");
  return Math.log2(fieldSize);
}

export function isCompletePlayoffBracket(input: {
  seeds: readonly PlayoffSeed[];
  rounds: readonly Readonly<{
    sequence: number;
    finalized: boolean;
    advancementConfirmed: boolean;
    matchups: readonly Readonly<{
      participantAId: string;
      participantBId: string;
      winnerParticipantId: string | null;
    }>[];
  }>[];
}) {
  let seeds: readonly PlayoffSeed[];
  try {
    seeds = validatePlayoffSeeds(input.seeds);
  } catch {
    return false;
  }
  if (input.rounds.length !== expectedPlayoffRoundCount(seeds.length)) return false;
  let expectedParticipants = new Set(seeds.map((seed) => seed.participantId));
  for (const [index, round] of input.rounds.entries()) {
    if (
      round.sequence !== index + 1 ||
      !round.finalized ||
      !round.advancementConfirmed ||
      round.matchups.length !== expectedParticipants.size / 2
    )
      return false;
    const actualParticipants = round.matchups.flatMap((matchup) => [
      matchup.participantAId,
      matchup.participantBId,
    ]);
    if (
      actualParticipants.length !== expectedParticipants.size ||
      new Set(actualParticipants).size !== actualParticipants.length ||
      actualParticipants.some((id) => !expectedParticipants.has(id)) ||
      round.matchups.some(
        (matchup) =>
          !matchup.winnerParticipantId ||
          ![matchup.participantAId, matchup.participantBId].includes(
            matchup.winnerParticipantId,
          ),
      )
    )
      return false;
    expectedParticipants = new Set(
      round.matchups.map((matchup) => matchup.winnerParticipantId!),
    );
  }
  return expectedParticipants.size === 1;
}
