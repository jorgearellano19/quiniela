"use server";

import { revalidatePath } from "next/cache";
import {
  configureGroups,
  configureLeaguePhase,
  generateGroups,
  generateLeaguePhaseSchedule,
  resolveGroupTie,
  resolveH2HTie,
} from "@/application/h2h/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { h2hRepository } from "@/infrastructure/h2h/h2h-repository";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";
import { toSafeError } from "@/lib/errors/application-error";

export type H2HActionState = { message?: string; success?: boolean };

async function actor() {
  const session = await getServerSession();
  return session
    ? {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      }
    : null;
}

function failure(error: unknown): H2HActionState {
  const safe = toSafeError(error);
  return {
    message:
      safe.code === "INTERNAL_ERROR"
        ? "No fue posible guardar la fase. Inténtalo de nuevo."
        : safe.message,
  };
}

export async function configureH2HAction(
  competitionId: string,
  type: "LEAGUE_PLAYOFFS" | "GROUP_PLAYOFFS",
  _state: H2HActionState,
  formData: FormData,
): Promise<H2HActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    if (type === "LEAGUE_PLAYOFFS")
      await configureLeaguePhase(
        {
          competitionId,
          roundCount: formData.get("roundCount"),
          qualifierCount: formData.get("qualifierCount"),
        },
        current,
        h2hRepository,
      );
    else
      await configureGroups(
        {
          competitionId,
          groupSize: formData.get("groupSize"),
          advancersPerGroup: formData.get("advancersPerGroup"),
        },
        current,
        h2hRepository,
      );
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/app/competitions/${competitionId}/h2h`);
  return { success: true, message: "Configuración guardada." };
}

export async function generateLeagueScheduleAction(competitionId: string) {
  const current = await actor();
  if (!current) return;
  await generateLeaguePhaseSchedule({ competitionId }, current, h2hRepository);
  revalidatePath(`/app/competitions/${competitionId}/h2h`);
}

export async function confirmGroupsAction(
  competitionId: string,
  groupSize: number,
  formData: FormData,
) {
  const current = await actor();
  if (!current) return;
  const assignments = formData.getAll("assignment").map(String);
  const groupCount = assignments.length / groupSize;
  const groups = Array.from({ length: groupCount }, () => ({
    participantIds: [] as string[],
  }));
  for (const assignment of assignments) {
    const [participantId, rawGroup] = assignment.split(":");
    const group = Number(rawGroup);
    if (participantId && Number.isInteger(group) && groups[group])
      groups[group].participantIds.push(participantId);
  }
  await generateGroups({ competitionId, groups }, current, h2hRepository);
  revalidatePath(`/app/competitions/${competitionId}/h2h`);
}

export async function resolveH2HTieAction(
  competitionId: string,
  groupId: string | null,
  formData: FormData,
) {
  const current = await actor();
  if (!current) return;
  const input = {
    competitionId,
    groupId,
    participantIds: formData.getAll("participantIds").map(String),
  };
  if (groupId) await resolveGroupTie(input, current, h2hRepository, standingsRepository);
  else await resolveH2HTie(input, current, h2hRepository, standingsRepository);
  revalidatePath(`/app/competitions/${competitionId}/h2h`);
}
