"use server";

import { revalidatePath } from "next/cache";
import {
  approveParticipant,
  generateInvitationLink,
  leaveCompetition,
  rejectParticipant,
  removeParticipant,
  requestToJoin,
  revokeInvitationLink,
  startCompetition,
} from "@/application/competition/membership-use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { membershipRepository } from "@/infrastructure/competition/membership-repository";
import { getServerEnvironment } from "@/lib/env/server";
import { toSafeError } from "@/lib/errors/application-error";

export type MembershipActionState = Readonly<{
  ok: boolean;
  message: string;
  redirectTo?: string;
}>;

async function currentActor() {
  const session = await getServerSession();
  return session
    ? {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      }
    : null;
}

function failure(error: unknown): MembershipActionState {
  const safe = toSafeError(error);
  return {
    ok: false,
    message:
      safe.code === "INTERNAL_ERROR"
        ? "No fue posible completar la operación. Inténtalo de nuevo."
        : safe.message,
  };
}

export async function generateInvitationAction(competitionId: string) {
  try {
    const url = await generateInvitationLink(
      membershipRepository,
      await currentActor(),
      competitionId,
      getServerEnvironment().BETTER_AUTH_URL,
    );
    revalidatePath(`/app/competitions/${competitionId}/participants`);
    return { ok: true, message: "Invitación generada.", url } as const;
  } catch (error) {
    return { ...failure(error), url: undefined };
  }
}

export async function revokeInvitationAction(
  competitionId: string,
): Promise<MembershipActionState> {
  try {
    await revokeInvitationLink(membershipRepository, await currentActor(), competitionId);
    revalidatePath(`/app/competitions/${competitionId}/participants`);
    return { ok: true, message: "Invitación revocada." };
  } catch (error) {
    return failure(error);
  }
}

export async function requestJoinAction(token: string): Promise<MembershipActionState> {
  try {
    const result = await requestToJoin(membershipRepository, await currentActor(), token);
    return {
      ok: true,
      message: "Solicitud enviada.",
      redirectTo: `/app/competitions/${result.competitionId}?requested=${result.status}`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function participantAction(
  competitionId: string,
  membershipId: string,
  action: "approve" | "reject" | "remove",
): Promise<MembershipActionState> {
  const operations = {
    approve: approveParticipant,
    reject: rejectParticipant,
    remove: removeParticipant,
  } as const;
  const messages = {
    approve: "Participación aprobada.",
    reject: "Solicitud rechazada.",
    remove: "Participación retirada.",
  } as const;

  try {
    await operations[action](
      membershipRepository,
      await currentActor(),
      competitionId,
      membershipId,
    );
    revalidatePath(`/app/competitions/${competitionId}/participants`);
    return { ok: true, message: messages[action] };
  } catch (error) {
    return failure(error);
  }
}

export async function leaveCompetitionAction(
  competitionId: string,
): Promise<MembershipActionState> {
  try {
    await leaveCompetition(membershipRepository, await currentActor(), competitionId);
    revalidatePath("/app");
    return {
      ok: true,
      message: "Saliste de la quiniela.",
      redirectTo: "/app?left=1",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function startCompetitionAction(
  competitionId: string,
): Promise<MembershipActionState> {
  try {
    await startCompetition(membershipRepository, await currentActor(), competitionId);
    revalidatePath(`/app/competitions/${competitionId}`);
    return {
      ok: true,
      message: "Quiniela iniciada.",
      redirectTo: `/app/competitions/${competitionId}?started=1`,
    };
  } catch (error) {
    return failure(error);
  }
}
