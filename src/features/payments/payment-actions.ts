"use server";

import { revalidatePath } from "next/cache";
import {
  configurePayments,
  recordPayment,
  updatePayment,
} from "@/application/payment/use-cases";
import { paymentRepository } from "@/infrastructure/payment/payment-repository";
import { toSafeError } from "@/lib/errors/application-error";
import { getCompetitionActionActor as actor } from "@/features/shared/action";

export type PaymentActionState = Readonly<{
  success?: boolean;
  message?: string;
  refresh?: boolean;
}>;

function failure(error: unknown, fallback: string): PaymentActionState {
  const safe = toSafeError(error);
  return {
    message: safe.code === "INTERNAL_ERROR" ? fallback : safe.message,
    refresh: safe.code === "UNAUTHORIZED",
  };
}

export async function configurePaymentsAction(
  competitionId: string,
  _state: PaymentActionState,
  data: FormData,
): Promise<PaymentActionState> {
  try {
    await configurePayments(paymentRepository, await actor(), {
      competitionId,
      financialFeaturesEnabled: data.get("financialFeaturesEnabled") ?? false,
      roundFeeAmount: data.get("roundFeeAmount"),
      maximumDebt: data.get("maximumDebt"),
      roundWinnerPrizeAmount: data.get("roundWinnerPrizeAmount"),
      leagueWinnerPrizeAmount: data.get("leagueWinnerPrizeAmount"),
      leaguePhaseWinnerPrizeAmount: data.get("leaguePhaseWinnerPrizeAmount"),
      playoffChampionPrizeAmount: data.get("playoffChampionPrizeAmount"),
    });
    revalidatePath(`/app/competitions/${competitionId}`);
    revalidatePath(`/app/competitions/${competitionId}/payments`);
    revalidatePath(`/app/competitions/${competitionId}/edit`);
    return { success: true, message: "Configuración de pagos y premios guardada." };
  } catch (error) {
    return failure(error, "No fue posible guardar la configuración.");
  }
}

export async function recordPaymentAction(
  competitionId: string,
  participantId: string,
  _state: PaymentActionState,
  data: FormData,
): Promise<PaymentActionState> {
  try {
    await recordPayment(paymentRepository, await actor(), {
      competitionId,
      participantId,
      paymentId: data.get("paymentId"),
      amount: data.get("amount"),
      paidAt: data.get("paidAt"),
    });
    revalidatePath(`/app/competitions/${competitionId}/payments`);
    revalidatePath(`/app/competitions/${competitionId}/answers`);
    revalidatePath(`/app/competitions/${competitionId}/standings`);
    return { success: true, message: "Pago registrado." };
  } catch (error) {
    return failure(error, "No fue posible registrar el pago.");
  }
}

export async function updatePaymentAction(
  competitionId: string,
  paymentId: string,
  _state: PaymentActionState,
  data: FormData,
): Promise<PaymentActionState> {
  try {
    await updatePayment(paymentRepository, await actor(), {
      competitionId,
      paymentId,
      amount: data.get("amount"),
      paidAt: data.get("paidAt"),
    });
    revalidatePath(`/app/competitions/${competitionId}/payments`);
    revalidatePath(`/app/competitions/${competitionId}/answers`);
    revalidatePath(`/app/competitions/${competitionId}/standings`);
    return { success: true, message: "Pago corregido." };
  } catch (error) {
    return failure(error, "No fue posible corregir el pago.");
  }
}
