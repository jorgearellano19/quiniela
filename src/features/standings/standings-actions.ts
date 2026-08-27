"use server";

import { revalidatePath } from "next/cache";
import { resolveRankingTie, type RankingScope } from "@/application/standings/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";
import { toSafeError } from "@/lib/errors/application-error";

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
  const session = await getServerSession();
  if (!session) return { message: "Inicia sesión para continuar." };
  try {
    await resolveRankingTie(
      standingsRepository,
      {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      },
      { competitionId, scope, roundId, participantIds },
    );
    revalidatePath(`/app/competitions/${competitionId}/standings`);
    if (roundId)
      revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}/results`);
    return { success: true, message: "Desempate guardado." };
  } catch (error) {
    const safe = toSafeError(error);
    return {
      message:
        safe.code === "INTERNAL_ERROR"
          ? "No fue posible guardar el desempate."
          : safe.message,
    };
  }
}
