import type { CompetitionStatus, CompetitionType } from "./competition";

export const MEMBERSHIP_STATUSES = ["PENDING", "ACTIVE", "REJECTED", "REMOVED"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type MembershipEventType =
  "REQUESTED" | "APPROVED" | "REJECTED" | "REMOVED" | "LEFT";

export class MembershipDomainError extends Error {}

export function requestMembership(current: MembershipStatus | null): {
  next: "PENDING";
  changed: boolean;
} {
  if (current === "PENDING") return { next: "PENDING", changed: false };
  if (current === null || current === "REJECTED" || current === "REMOVED")
    return { next: "PENDING", changed: true };
  throw new MembershipDomainError("Membership request is not allowed.");
}

export function transitionMembership(
  current: MembershipStatus,
  action: "APPROVE" | "REJECT" | "REMOVE" | "LEAVE",
  competitionStatus: CompetitionStatus,
): MembershipStatus {
  if (competitionStatus !== "DRAFT")
    throw new MembershipDomainError("Membership changes are locked.");
  if (action === "APPROVE" && current === "PENDING") return "ACTIVE";
  if (action === "REJECT" && current === "PENDING") return "REJECTED";
  if ((action === "REMOVE" || action === "LEAVE") && current === "ACTIVE")
    return "REMOVED";
  throw new MembershipDomainError("Invalid membership transition.");
}

export function approvalMaximum(type: CompetitionType): number | null {
  if (type === "LEAGUE_PLAYOFFS") return 30;
  if (type === "GROUP_PLAYOFFS") return 64;
  return null;
}

export function canApproveAtCount(type: CompetitionType, activeCount: number) {
  const maximum = approvalMaximum(type);
  return maximum === null || activeCount < maximum;
}

export function validateCompetitionStart(input: {
  type: CompetitionType;
  status: CompetitionStatus;
  activeCount: number;
  pendingCount: number;
}) {
  if (input.status !== "DRAFT" || input.pendingCount !== 0)
    throw new MembershipDomainError("Competition cannot start.");
  const valid =
    input.type === "LEAGUE"
      ? input.activeCount >= 1
      : input.type === "LEAGUE_PLAYOFFS"
        ? input.activeCount >= 2 && input.activeCount <= 30
        : [8, 16, 32, 64].includes(input.activeCount);
  if (!valid) throw new MembershipDomainError("Competition cannot start.");
}
