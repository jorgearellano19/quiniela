import { and, eq, inArray } from "drizzle-orm";
import { calculateBalance, isRestricted } from "@/domain/payment/payment";
import { db } from "@/infrastructure/db/client";
import {
  competition,
  competitionParticipant,
  payment,
  paymentObligation,
} from "@/infrastructure/db/schema";

export async function loadRestrictedParticipantIds(
  database: typeof db,
  competitionId: string,
  participantIds?: readonly string[],
) {
  const [config] = await database
    .select({
      enabled: competition.financialFeaturesEnabled,
      maximumDebt: competition.maximumDebt,
    })
    .from(competition)
    .where(eq(competition.id, competitionId))
    .limit(1);
  if (!config?.enabled || config.maximumDebt === null) return new Set<string>();
  const ids =
    participantIds ??
    (
      await database
        .select({ id: competitionParticipant.id })
        .from(competitionParticipant)
        .where(
          and(
            eq(competitionParticipant.competitionId, competitionId),
            eq(competitionParticipant.status, "ACTIVE"),
          ),
        )
    ).map((item) => item.id);
  if (!ids.length) return new Set<string>();
  const [obligations, payments] = await Promise.all([
    database
      .select({
        participantId: paymentObligation.competitionParticipantId,
        amount: paymentObligation.amount,
      })
      .from(paymentObligation)
      .where(inArray(paymentObligation.competitionParticipantId, [...ids])),
    database
      .select({ participantId: payment.competitionParticipantId, amount: payment.amount })
      .from(payment)
      .where(inArray(payment.competitionParticipantId, [...ids])),
  ]);
  return new Set(
    ids.filter((participantId) =>
      isRestricted(
        calculateBalance(
          obligations.filter((item) => item.participantId === participantId),
          payments.filter((item) => item.participantId === participantId),
        ),
        config.maximumDebt,
      ),
    ),
  );
}
