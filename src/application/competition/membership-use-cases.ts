import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  canApproveAtCount,
  MembershipDomainError,
  requestMembership,
  transitionMembership,
  validateCompetitionStart,
  type MembershipEventType,
  type MembershipStatus,
} from "@/domain/competition/membership";
import type {
  CompetitionStatus,
  CompetitionType,
} from "@/domain/competition/competition";
import type { PrizeConfiguration } from "@/domain/payment/payment";
import type { CompetitionScoringDefaults } from "@/domain/round/round";
import { ApplicationError } from "@/lib/errors/application-error";
import {
  requireCompetitionActor,
  requireCompetitionId,
  type CompetitionActor,
} from "./boundary";

export type Membership = Readonly<{
  id: string;
  competitionId: string;
  userId: string;
  name: string;
  email: string;
  isAdmin: boolean;
  status: MembershipStatus;
}>;
export type InvitationView = Readonly<{
  competitionId: string;
  name: string;
  type: CompetitionType;
  typeLabel: string;
  currency: "MXN";
  rulesNote: string | null;
  membershipStatus: MembershipStatus | null;
  phase:
    | Readonly<{ type: "LEAGUE" }>
    | Readonly<{
        type: "LEAGUE_PLAYOFFS";
        roundCount: number;
        qualifierCount: number;
      }>
    | Readonly<{
        type: "GROUP_PLAYOFFS";
        groupSize: number;
        advancersPerGroup: number;
      }>
    | null;
  scoringDefaults: CompetitionScoringDefaults;
  financial: Readonly<{
    enabled: boolean;
    roundFeeAmount: number | null;
    maximumDebt: number | null;
    prizes: readonly PrizeConfiguration[];
  }>;
}>;
export interface MembershipRepository {
  setInvitation(
    competitionId: string,
    actorUserId: string,
    hash: string | null,
    invalidatedAt: Date | null,
  ): Promise<boolean>;
  findInvitation(hash: string, userId: string): Promise<InvitationView | null>;
  request(input: {
    competitionId: string;
    userId: string;
    membershipId: string;
    invitationHash: string;
    now: Date;
  }): Promise<{ status: MembershipStatus; changed: boolean }>;
  list(
    competitionId: string,
    actorUserId: string,
  ): Promise<ReadonlyArray<Membership> | null>;
  transition(input: {
    competitionId: string;
    membershipId: string;
    actorUserId: string;
    action: "APPROVE" | "REJECT" | "REMOVE";
    now: Date;
  }): Promise<boolean>;
  leave(competitionId: string, actorUserId: string, now: Date): Promise<boolean>;
  start(competitionId: string, actorUserId: string, now: Date): Promise<boolean>;
}
const labels: Record<CompetitionType, string> = {
  LEAGUE: "Liga",
  LEAGUE_PLAYOFFS: "Liga con eliminatorias",
  GROUP_PLAYOFFS: "Grupos con eliminatorias",
};
export function invitationHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function generateInvitationLink(
  repository: MembershipRepository,
  value: CompetitionActor,
  competitionId: string,
  origin: string,
) {
  const current = requireCompetitionActor(value);
  requireCompetitionId(competitionId);
  const token = randomBytes(32).toString("base64url");
  if (
    !(await repository.setInvitation(
      competitionId,
      current.userId,
      invitationHash(token),
      null,
    ))
  )
    throw new ApplicationError("UNAUTHORIZED", "No fue posible generar la invitación.");
  return `${origin}/invite/${token}`;
}
export async function revokeInvitationLink(
  repository: MembershipRepository,
  value: CompetitionActor,
  competitionId: string,
) {
  const current = requireCompetitionActor(value);
  requireCompetitionId(competitionId);
  if (!(await repository.setInvitation(competitionId, current.userId, null, new Date())))
    throw new ApplicationError("UNAUTHORIZED", "No fue posible revocar la invitación.");
}
export async function viewInvitation(
  repository: MembershipRepository,
  value: CompetitionActor,
  token: string,
) {
  const current = requireCompetitionActor(value);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await repository.findInvitation(invitationHash(token), current.userId);
  return result ? { ...result, typeLabel: labels[result.type] } : null;
}
export async function requestToJoin(
  repository: MembershipRepository,
  value: CompetitionActor,
  token: string,
) {
  const current = requireCompetitionActor(value);
  const invitation = await viewInvitation(repository, current, token);
  if (!invitation)
    throw new ApplicationError("UNAUTHORIZED", "Esta invitación ya no está disponible.");
  try {
    requestMembership(invitation.membershipStatus);
  } catch {
    throw new ApplicationError(
      "INVALID_INPUT",
      "No fue posible solicitar acceso a esta quiniela.",
    );
  }
  try {
    const result = await repository.request({
      competitionId: invitation.competitionId,
      userId: current.userId,
      membershipId: randomUUID(),
      invitationHash: invitationHash(token),
      now: new Date(),
    });
    return { ...result, competitionId: invitation.competitionId };
  } catch {
    throw new ApplicationError("UNAUTHORIZED", "Esta invitación ya no está disponible.");
  }
}
export async function listCompetitionParticipants(
  repository: MembershipRepository,
  value: CompetitionActor,
  competitionId: string,
) {
  const current = requireCompetitionActor(value);
  requireCompetitionId(competitionId);
  const result = await repository.list(competitionId, current.userId);
  if (!result)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible consultar participantes.");
  return result;
}
async function adminTransition(
  repository: MembershipRepository,
  value: CompetitionActor,
  competitionId: string,
  membershipId: string,
  action: "APPROVE" | "REJECT" | "REMOVE",
) {
  const current = requireCompetitionActor(value);
  requireCompetitionId(competitionId);
  requireCompetitionId(membershipId);
  let changed = false;
  try {
    changed = await repository.transition({
      competitionId,
      membershipId,
      actorUserId: current.userId,
      action,
      now: new Date(),
    });
  } catch {
    changed = false;
  }
  if (!changed)
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No fue posible actualizar la participación.",
    );
}
export const approveParticipant = (
  repository: MembershipRepository,
  actor: CompetitionActor,
  competitionId: string,
  membershipId: string,
) => adminTransition(repository, actor, competitionId, membershipId, "APPROVE");
export const rejectParticipant = (
  repository: MembershipRepository,
  actor: CompetitionActor,
  competitionId: string,
  membershipId: string,
) => adminTransition(repository, actor, competitionId, membershipId, "REJECT");
export const removeParticipant = (
  repository: MembershipRepository,
  actor: CompetitionActor,
  competitionId: string,
  membershipId: string,
) => adminTransition(repository, actor, competitionId, membershipId, "REMOVE");
export async function leaveCompetition(
  repository: MembershipRepository,
  value: CompetitionActor,
  competitionId: string,
) {
  const current = requireCompetitionActor(value);
  requireCompetitionId(competitionId);
  if (!(await repository.leave(competitionId, current.userId, new Date())))
    throw new ApplicationError("UNAUTHORIZED", "No fue posible salir de la quiniela.");
}
export async function startCompetition(
  repository: MembershipRepository,
  value: CompetitionActor,
  competitionId: string,
) {
  const current = requireCompetitionActor(value);
  requireCompetitionId(competitionId);
  let started = false;
  try {
    started = await repository.start(competitionId, current.userId, new Date());
  } catch {
    started = false;
  }
  if (!started)
    throw new ApplicationError(
      "INVALID_INPUT",
      "Revisa las solicitudes y el número de participantes antes de iniciar.",
    );
}

export {
  canApproveAtCount,
  transitionMembership,
  validateCompetitionStart,
  MembershipDomainError,
};
export type { MembershipEventType, CompetitionStatus };
