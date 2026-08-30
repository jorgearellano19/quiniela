"use server";

import { redirect } from "next/navigation";
import { completeCompetition } from "@/application/prize/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { paymentRepository } from "@/infrastructure/payment/payment-repository";
import { playoffRepository } from "@/infrastructure/playoff/playoff-repository";
import { completionRepository } from "@/infrastructure/prize/completion-repository";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";

export async function completeCompetitionAction(competitionId: string) {
  const session = await getServerSession();
  await completeCompetition(
    completionRepository,
    paymentRepository,
    standingsRepository,
    playoffRepository,
    session
      ? {
          userId: session.user.id,
          passwordChangeRequired: session.user.passwordChangeRequired,
        }
      : null,
    competitionId,
  );
  redirect(`/app/competitions/${competitionId}/results?completed=1`);
}
