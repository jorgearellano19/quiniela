"use server";

import { revalidatePath } from "next/cache";
import { resolveRankingTie, type RankingScope } from "@/application/standings/use-cases";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";
import { getCompetitionActionActor, safeActionError } from "@/features/shared/action";

export type StandingsActionState = Readonly<{
  success?: boolean;
  message?: string;
}>;

export async function resolveRankingTieAction(
  competitionId: string,
  scope: RankingScope,
  roundId: string | null,
  participantIds: string[],
): Promise<StandingsActionState> {
  const actor = await getCompetitionActionActor();
  if (!actor) return { message: "Inicia sesión para continuar." };
  try {
    await resolveRankingTie(standingsRepository, actor, {
      competitionId,
      scope,
      roundId,
      participantIds,
    });
    revalidatePath(`/app/competitions/${competitionId}/standings`);
    revalidatePath(`/app/competitions/${competitionId}/results`);
    if (roundId)
      revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}/results`);
    return { success: true, message: "Desempate guardado." };
  } catch (error) {
    return safeActionError(error, "No fue posible guardar el desempate.");
  }
}
