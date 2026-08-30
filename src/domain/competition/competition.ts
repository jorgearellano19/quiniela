export const COMPETITION_TYPES = ["LEAGUE", "LEAGUE_PLAYOFFS", "GROUP_PLAYOFFS"] as const;
export type CompetitionType = (typeof COMPETITION_TYPES)[number];
export const COMPETITION_STATUSES = ["DRAFT", "STARTED", "COMPLETED"] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];
export type CompetitionCurrency = "MXN";

export type Competition = Readonly<{
  id: string;
  name: string;
  type: CompetitionType;
  status: CompetitionStatus;
  currency: CompetitionCurrency;
  financialFeaturesEnabled?: boolean;
  rulesNote: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  invitationTokenHash: string | null;
  invitationInvalidatedAt: Date | null;
  startedAt: Date | null;
  completedAt?: Date | null;
}>;

export class CompetitionDomainError extends Error {}

function normalizeName(name: string) {
  const value = name.trim();
  if (!value) throw new CompetitionDomainError("Competition name is required.");
  if (value.length > 120)
    throw new CompetitionDomainError("Competition name is too long.");
  return value;
}
function normalizeRulesNote(note?: string | null) {
  const value = note?.trim() ?? "";
  if (value.length > 2_000)
    throw new CompetitionDomainError("Competition rules note is too long.");
  return value || null;
}

export function createCompetition(input: {
  id: string;
  name: string;
  type: CompetitionType;
  actorUserId: string;
  rulesNote?: string | null;
  now?: Date;
}): Competition {
  if (!COMPETITION_TYPES.includes(input.type))
    throw new CompetitionDomainError("Invalid Competition type.");
  const now = input.now ?? new Date();
  return {
    id: input.id,
    name: normalizeName(input.name),
    type: input.type,
    status: "DRAFT",
    currency: "MXN",
    financialFeaturesEnabled: false,
    rulesNote: normalizeRulesNote(input.rulesNote),
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
    createdAt: now,
    updatedAt: now,
    invitationTokenHash: null,
    invitationInvalidatedAt: null,
    startedAt: null,
    completedAt: null,
  };
}

export function updateCompetitionConfiguration(
  competition: Competition,
  input: {
    name: string;
    type: CompetitionType;
    rulesNote?: string | null;
    actorUserId: string;
    now?: Date;
  },
): Competition {
  if (competition.status !== "DRAFT")
    throw new CompetitionDomainError("Competition configuration is locked.");
  if (!COMPETITION_TYPES.includes(input.type))
    throw new CompetitionDomainError("Invalid Competition type.");
  return {
    ...competition,
    name: normalizeName(input.name),
    type: input.type,
    rulesNote: normalizeRulesNote(input.rulesNote),
    updatedByUserId: input.actorUserId,
    updatedAt: input.now ?? new Date(),
  };
}
