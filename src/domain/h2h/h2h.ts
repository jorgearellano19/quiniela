export type H2HPhaseConfiguration =
  | Readonly<{
      type: "LEAGUE_PLAYOFFS";
      roundCount: number;
      qualifierCount: 2 | 4 | 8 | 16;
    }>
  | Readonly<{
      type: "GROUP_PLAYOFFS";
      groupSize: 4 | 8;
      advancersPerGroup: 1 | 2;
    }>;

export type ScheduledMatchup = Readonly<{
  slot: number;
  position: number;
  participantAId: string;
  participantBId: string | null;
}>;

export type H2HMatchState = "POR_JUGAR" | "PROVISIONAL" | "FINAL";

export type H2HOutcome = Readonly<{
  participantA: Readonly<{ points: 0 | 1 | 3; win: boolean }>;
  participantB: Readonly<{ points: 0 | 1 | 3; win: boolean }> | null;
}>;

export class H2HDomainError extends Error {}

function assertUniqueParticipants(participantIds: readonly string[]) {
  if (
    participantIds.some((id) => id.trim().length === 0) ||
    new Set(participantIds).size !== participantIds.length
  )
    throw new H2HDomainError("Participants must be unique and nonblank.");
}

export function validateLeaguePhaseConfiguration(input: {
  participantCount: number;
  roundCount: number;
  qualifierCount: number;
}): Extract<H2HPhaseConfiguration, { type: "LEAGUE_PLAYOFFS" }> {
  if (
    !Number.isInteger(input.participantCount) ||
    input.participantCount < 2 ||
    input.participantCount > 30
  )
    throw new H2HDomainError("League phase requires 2 to 30 participants.");
  if (
    !Number.isInteger(input.roundCount) ||
    input.roundCount < 1 ||
    input.roundCount > input.participantCount - 1
  )
    throw new H2HDomainError("League phase rounds must be between 1 and N - 1.");
  if (
    ![2, 4, 8, 16].includes(input.qualifierCount) ||
    input.qualifierCount > input.participantCount
  )
    throw new H2HDomainError("League phase qualifier count is invalid for the roster.");
  return {
    type: "LEAGUE_PLAYOFFS",
    roundCount: input.roundCount,
    qualifierCount: input.qualifierCount as 2 | 4 | 8 | 16,
  };
}

export function validateGroupPhaseConfiguration(input: {
  participantCount: number;
  groupSize: number;
  advancersPerGroup: number;
}): Extract<H2HPhaseConfiguration, { type: "GROUP_PLAYOFFS" }> {
  if (![8, 16, 32, 64].includes(input.participantCount))
    throw new H2HDomainError("Group phase roster is invalid.");
  if (input.groupSize !== 4 && input.groupSize !== 8)
    throw new H2HDomainError("Groups must contain 4 or 8 participants.");
  if (input.participantCount % input.groupSize !== 0)
    throw new H2HDomainError("The roster cannot be divided into equal groups.");
  if (input.advancersPerGroup !== 1 && input.advancersPerGroup !== 2)
    throw new H2HDomainError("One or two participants must advance per group.");
  const fieldSize = (input.participantCount / input.groupSize) * input.advancersPerGroup;
  if (![4, 8, 16, 32].includes(fieldSize))
    throw new H2HDomainError(
      "Group configuration does not produce a valid playoff field.",
    );
  return {
    type: "GROUP_PLAYOFFS",
    groupSize: input.groupSize,
    advancersPerGroup: input.advancersPerGroup,
  };
}

/** Generates the circle-method cycle from the persisted, visible draw order. */
export function generateRoundRobinSchedule(
  drawOrder: readonly string[],
  slotCount = drawOrder.length - 1,
): readonly ScheduledMatchup[] {
  assertUniqueParticipants(drawOrder);
  if (drawOrder.length < 2)
    throw new H2HDomainError("At least two participants are required.");
  const maximumSlots =
    drawOrder.length % 2 === 0 ? drawOrder.length - 1 : drawOrder.length;
  if (!Number.isInteger(slotCount) || slotCount < 1 || slotCount > maximumSlots)
    throw new H2HDomainError("Schedule slot count is invalid.");
  const bye = Symbol("bye");
  const rotation: (string | typeof bye)[] = [...drawOrder];
  if (rotation.length % 2 === 1) rotation.push(bye);
  const matchups: ScheduledMatchup[] = [];
  for (let slot = 1; slot <= slotCount; slot += 1) {
    for (let position = 0; position < rotation.length / 2; position += 1) {
      const left = rotation[position]!;
      const right = rotation[rotation.length - 1 - position]!;
      if (left === bye || right === bye) {
        const participant = left === bye ? right : left;
        matchups.push({
          slot,
          position: position + 1,
          participantAId: participant as string,
          participantBId: null,
        });
      } else {
        matchups.push({
          slot,
          position: position + 1,
          participantAId: left,
          participantBId: right,
        });
      }
    }
    const fixed = rotation[0]!;
    const rest = rotation.slice(1);
    rest.unshift(rest.pop()!);
    rotation.splice(0, rotation.length, fixed, ...rest);
  }
  return matchups;
}

export function validateGroupAssignments(input: {
  participantIds: readonly string[];
  groupSize: 4 | 8;
  groups: readonly Readonly<{ participantIds: readonly string[] }>[];
}) {
  assertUniqueParticipants(input.participantIds);
  const assigned = input.groups.flatMap((group) => [...group.participantIds]);
  if (
    input.groups.length === 0 ||
    input.groups.some((group) => group.participantIds.length !== input.groupSize)
  )
    throw new H2HDomainError("Every group must have the configured size.");
  assertUniqueParticipants(assigned);
  if (
    assigned.length !== input.participantIds.length ||
    assigned.some((id) => !input.participantIds.includes(id))
  )
    throw new H2HDomainError(
      "Group assignments must cover the active roster exactly once.",
    );
}

export function deriveH2HOutcome(input: {
  participantAScore: number;
  participantBScore: number | null;
}): H2HOutcome {
  if (input.participantBScore === null)
    return { participantA: { points: 0, win: false }, participantB: null };
  if (input.participantAScore === input.participantBScore)
    return {
      participantA: { points: 1, win: false },
      participantB: { points: 1, win: false },
    };
  const aWins = input.participantAScore > input.participantBScore;
  return {
    participantA: { points: aWins ? 3 : 0, win: aWins },
    participantB: { points: aWins ? 0 : 3, win: !aWins },
  };
}

export function deriveH2HMatchState(input: {
  resultCompleteQuestionCount: number;
  requiredQuestionCount: number;
  effectiveRoundStatus: "DRAFT" | "PUBLISHED" | "ACTIVE" | "FINISHED" | "FINALIZED";
}): H2HMatchState {
  if (input.resultCompleteQuestionCount === 0) return "POR_JUGAR";
  return input.effectiveRoundStatus === "FINALIZED" ? "FINAL" : "PROVISIONAL";
}

/**
 * Only ties that can change the ordered qualifier contract require an Admin decision.
 * That includes a tie crossing the cut and a tie wholly inside the qualifier field.
 */
export function requiredQualifierTieGroups(input: {
  rows: readonly Readonly<{
    participantId: string;
    position: number;
    unresolved: boolean;
  }>[];
  qualifierCount: number;
}): readonly (readonly string[])[] {
  if (
    !Number.isInteger(input.qualifierCount) ||
    input.qualifierCount < 1 ||
    input.qualifierCount > input.rows.length
  )
    throw new H2HDomainError("Qualifier cut is invalid.");
  const byPosition = new Map<number, string[]>();
  for (const row of input.rows) {
    if (!row.unresolved) continue;
    const group = byPosition.get(row.position) ?? [];
    group.push(row.participantId);
    byPosition.set(row.position, group);
  }
  return [...byPosition.entries()]
    .filter(([position]) => position <= input.qualifierCount)
    .map(([, participantIds]) => participantIds);
}

export function classificationReadiness(input: {
  roundStatuses: readonly ("DRAFT" | "PUBLISHED" | "ACTIVE" | "FINISHED" | "FINALIZED")[];
  unresolvedTieCount: number;
}): "PROVISIONAL" | "PENDING_RESOLUTION" | "OFFICIAL" {
  if (
    input.roundStatuses.length === 0 ||
    input.roundStatuses.some((status) => status !== "FINALIZED")
  )
    return "PROVISIONAL";
  return input.unresolvedTieCount > 0 ? "PENDING_RESOLUTION" : "OFFICIAL";
}

export type H2HStandingValue = Readonly<{
  participantId: string;
  h2hPoints: number;
  played: number;
  wins: number;
  predictionScore: number;
  exactScorePoints: number;
}>;

export function deriveH2HStandingValues(input: {
  participantScores: readonly Readonly<{
    participantId: string;
    predictionScore: number;
    exactScorePoints: number;
  }>[];
  matchups: readonly Readonly<{
    participantAId: string;
    participantBId: string | null;
    participantAScore: number;
    participantBScore: number | null;
    hasResult: boolean;
  }>[];
}): readonly H2HStandingValue[] {
  assertUniqueParticipants(input.participantScores.map((value) => value.participantId));
  const standings = new Map(
    input.participantScores.map((value) => [
      value.participantId,
      { ...value, h2hPoints: 0, played: 0, wins: 0 },
    ]),
  );
  for (const matchup of input.matchups) {
    const first = standings.get(matchup.participantAId);
    if (!first) throw new H2HDomainError("Matchup participant is outside the phase.");
    if (matchup.participantBId === null) continue;
    const second = standings.get(matchup.participantBId);
    if (!second) throw new H2HDomainError("Matchup participant is outside the phase.");
    if (!matchup.hasResult || matchup.participantBScore === null) continue;
    const outcome = deriveH2HOutcome(matchup);
    first.played += 1;
    second.played += 1;
    first.h2hPoints += outcome.participantA.points;
    second.h2hPoints += outcome.participantB!.points;
    if (outcome.participantA.win) first.wins += 1;
    if (outcome.participantB!.win) second.wins += 1;
  }
  return [...standings.values()];
}

export function qualifiedParticipantIds(input: {
  orderedParticipantIds: readonly string[];
  qualifierCount: number;
  readiness: "PROVISIONAL" | "PENDING_RESOLUTION" | "OFFICIAL";
}) {
  if (input.readiness !== "OFFICIAL") return [];
  if (
    !Number.isInteger(input.qualifierCount) ||
    input.qualifierCount < 1 ||
    input.qualifierCount > input.orderedParticipantIds.length
  )
    throw new H2HDomainError("Qualifier cut is invalid.");
  return input.orderedParticipantIds.slice(0, input.qualifierCount);
}
