import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type {
  PaymentAggregate,
  PaymentRepository,
  ParticipantPaymentStatus,
} from "@/application/payment/use-cases";
import { calculateBalance, isRestricted } from "@/domain/payment/payment";
import { db } from "@/infrastructure/db/client";
import { transactionDatabase } from "@/infrastructure/db/transaction";
import {
  competition,
  competitionParticipant,
  payment,
  paymentEvent,
  paymentObligation,
  prizeConfiguration,
  prizeConfigurationEvent,
  round,
  user,
} from "@/infrastructure/db/schema";

async function loadAggregate(
  database: typeof db,
  competitionId: string,
  userId: string,
  access: "ADMIN" | "SELF" | "MUTATION" = "MUTATION",
): Promise<PaymentAggregate | null> {
  const [scope] = await database
    .select({ competition, membership: competitionParticipant })
    .from(competition)
    .innerJoin(
      competitionParticipant,
      and(
        eq(competitionParticipant.competitionId, competition.id),
        eq(competitionParticipant.userId, userId),
      ),
    )
    .where(eq(competition.id, competitionId))
    .limit(1);
  if (
    !scope ||
    (!scope.membership.isAdmin && scope.membership.status !== "ACTIVE") ||
    (access === "ADMIN" && !scope.membership.isAdmin) ||
    (access === "SELF" && scope.membership.status !== "ACTIVE") ||
    scope.competition.currency !== "MXN"
  )
    return null;
  const participantRows = await database
    .select({
      participantId: competitionParticipant.id,
      userId: competitionParticipant.userId,
      name: user.name,
      email: user.email,
    })
    .from(competitionParticipant)
    .innerJoin(user, eq(user.id, competitionParticipant.userId))
    .where(
      and(
        eq(competitionParticipant.competitionId, competitionId),
        eq(competitionParticipant.status, "ACTIVE"),
        access === "SELF"
          ? eq(competitionParticipant.id, scope.membership.id)
          : undefined,
      ),
    )
    .orderBy(asc(user.name), asc(user.email));
  const participantIds = participantRows.map((item) => item.participantId);
  const obligations = participantIds.length
    ? await database
        .select({
          id: paymentObligation.id,
          participantId: paymentObligation.competitionParticipantId,
          roundId: paymentObligation.roundId,
          roundName: round.name,
          roundSequence: round.sequence,
          amount: paymentObligation.amount,
          createdAt: paymentObligation.createdAt,
        })
        .from(paymentObligation)
        .innerJoin(round, eq(round.id, paymentObligation.roundId))
        .where(inArray(paymentObligation.competitionParticipantId, participantIds))
        .orderBy(asc(round.sequence))
    : [];
  const payments = participantIds.length
    ? await database
        .select()
        .from(payment)
        .where(inArray(payment.competitionParticipantId, participantIds))
        .orderBy(asc(payment.paidAt), asc(payment.createdAt))
    : [];
  const prizes = await database
    .select({ type: prizeConfiguration.type, amount: prizeConfiguration.amount })
    .from(prizeConfiguration)
    .where(and(eq(prizeConfiguration.competitionId, competitionId)));
  const participants: ParticipantPaymentStatus[] = participantRows.map((participant) => {
    const ownObligations = obligations.filter(
      (item) => item.participantId === participant.participantId,
    );
    const ownPayments = payments.filter(
      (item) => item.competitionParticipantId === participant.participantId,
    );
    const balance = calculateBalance(ownObligations, ownPayments);
    return {
      ...participant,
      owed: ownObligations.reduce((sum, item) => sum + item.amount, 0),
      paid: ownPayments.reduce((sum, item) => sum + item.amount, 0),
      balance,
      restricted:
        scope.competition.financialFeaturesEnabled &&
        isRestricted(balance, scope.competition.maximumDebt),
      obligations: ownObligations.map((item) => ({
        id: item.id,
        roundId: item.roundId,
        roundName: item.roundName,
        roundSequence: item.roundSequence,
        amount: item.amount,
        createdAt: item.createdAt,
      })),
      payments: ownPayments.map((item) => ({
        id: item.id,
        amount: item.amount,
        paidAt: item.paidAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  });
  return {
    competition: {
      id: scope.competition.id,
      name: scope.competition.name,
      type: scope.competition.type,
      status: scope.competition.status,
      currency: "MXN",
      financialFeaturesEnabled: scope.competition.financialFeaturesEnabled,
      roundFeeAmount: scope.competition.roundFeeAmount,
      maximumDebt: scope.competition.maximumDebt,
      prizes,
    },
    actorIsAdmin: scope.membership.isAdmin,
    actorParticipantId: scope.membership.status === "ACTIVE" ? scope.membership.id : null,
    participants,
  };
}

export function createPaymentRepository(database: typeof db): PaymentRepository {
  return {
    getMine(competitionId, userId) {
      return loadAggregate(database, competitionId, userId, "SELF");
    },
    getAdmin(competitionId, userId) {
      return loadAggregate(database, competitionId, userId, "ADMIN");
    },
    async getPrizes(competitionId, userId) {
      const [scope] = await database
        .select({
          currency: competition.currency,
          financialFeaturesEnabled: competition.financialFeaturesEnabled,
        })
        .from(competition)
        .innerJoin(
          competitionParticipant,
          and(
            eq(competitionParticipant.competitionId, competition.id),
            eq(competitionParticipant.userId, userId),
          ),
        )
        .where(
          and(
            eq(competition.id, competitionId),
            or(
              eq(competitionParticipant.isAdmin, true),
              eq(competitionParticipant.status, "ACTIVE"),
            ),
          ),
        )
        .limit(1);
      if (!scope || scope.currency !== "MXN") return null;
      const prizes = await database
        .select({ type: prizeConfiguration.type, amount: prizeConfiguration.amount })
        .from(prizeConfiguration)
        .where(and(eq(prizeConfiguration.competitionId, competitionId)));
      return {
        currency: "MXN",
        financialFeaturesEnabled: scope.financialFeaturesEnabled,
        prizes,
      };
    },
    async configure(competitionId, userId, now, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select c.id from competition c join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where c.id = ${competitionId} and c.status = 'DRAFT' for update`,
        );
        if (!locked.length) return null;
        const txDb = transactionDatabase(tx);
        const aggregate = await loadAggregate(txDb, competitionId, userId);
        if (!aggregate) return null;
        const value = operation(aggregate);
        const existingPrizes = await tx
          .select({ type: prizeConfiguration.type, amount: prizeConfiguration.amount })
          .from(prizeConfiguration)
          .where(eq(prizeConfiguration.competitionId, competitionId));
        await tx
          .update(competition)
          .set({
            financialFeaturesEnabled: value.financialFeaturesEnabled,
            roundFeeAmount: value.roundFeeAmount,
            maximumDebt: value.maximumDebt,
            updatedByUserId: userId,
            updatedAt: now,
          })
          .where(eq(competition.id, competitionId));
        await tx
          .delete(prizeConfiguration)
          .where(eq(prizeConfiguration.competitionId, competitionId));
        const prizes = value.prizes;
        const nextPrizes = new Map(
          Object.entries(prizes) as [
            typeof prizeConfiguration.$inferInsert.type,
            number,
          ][],
        );
        const events = [
          ...existingPrizes
            .filter((item) => !nextPrizes.has(item.type))
            .map((item) => ({
              id: randomUUID(),
              competitionId,
              type: item.type,
              action: "REMOVED" as const,
              beforeAmount: item.amount,
              afterAmount: null,
              actorUserId: userId,
              createdAt: now,
            })),
          ...[...nextPrizes].flatMap(([type, amount]) => {
            const before =
              existingPrizes.find((item) => item.type === type)?.amount ?? null;
            return before === amount
              ? []
              : [
                  {
                    id: randomUUID(),
                    competitionId,
                    type,
                    action: "UPSERTED" as const,
                    beforeAmount: before,
                    afterAmount: amount,
                    actorUserId: userId,
                    createdAt: now,
                  },
                ];
          }),
        ];
        if (events.length) await tx.insert(prizeConfigurationEvent).values(events);
        for (const [type, amount] of Object.entries(prizes))
          await tx.insert(prizeConfiguration).values({
            id: randomUUID(),
            competitionId,
            type: type as typeof prizeConfiguration.$inferInsert.type,
            amount,
            updatedByUserId: userId,
            createdAt: now,
            updatedAt: now,
          });
        return loadAggregate(txDb, competitionId, userId);
      });
    },
    async record(competitionId, participantId, paymentId, userId, amount, paidAt, now) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select c.id from competition c join competition_participant admin on admin.competition_id = c.id and admin.user_id = ${userId} and admin.is_admin = true join competition_participant target on target.competition_id = c.id and target.id = ${participantId} and target.status = 'ACTIVE' where c.id = ${competitionId} and c.status = 'STARTED' and c.financial_features_enabled = true and c.round_fee_amount is not null for update`,
        );
        if (!locked.length) return null;
        const [existing] = await tx
          .select()
          .from(payment)
          .where(eq(payment.id, paymentId))
          .limit(1);
        if (existing) {
          if (
            existing.competitionParticipantId !== participantId ||
            existing.amount !== amount ||
            existing.paidAt.valueOf() !== paidAt.valueOf()
          )
            return null;
          return loadAggregate(transactionDatabase(tx), competitionId, userId);
        }
        await tx.insert(payment).values({
          id: paymentId,
          competitionParticipantId: participantId,
          amount,
          paidAt,
          recordedByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(paymentEvent).values({
          id: randomUUID(),
          paymentId,
          action: "RECORDED",
          beforeAmount: null,
          beforePaidAt: null,
          afterAmount: amount,
          afterPaidAt: paidAt,
          actorUserId: userId,
          createdAt: now,
        });
        return loadAggregate(transactionDatabase(tx), competitionId, userId);
      });
    },
    async update(competitionId, paymentId, userId, amount, paidAt, now) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select p.id from payment p join competition_participant target on target.id = p.competition_participant_id join competition c on c.id = target.competition_id join competition_participant admin on admin.competition_id = c.id and admin.user_id = ${userId} and admin.is_admin = true where p.id = ${paymentId} and c.id = ${competitionId} and c.status = 'STARTED' for update`,
        );
        if (!locked.length) return null;
        const [current] = await tx
          .select()
          .from(payment)
          .where(eq(payment.id, paymentId))
          .limit(1);
        if (!current) return null;
        if (current.amount === amount && current.paidAt.valueOf() === paidAt.valueOf())
          return loadAggregate(transactionDatabase(tx), competitionId, userId);
        await tx
          .update(payment)
          .set({ amount, paidAt, updatedByUserId: userId, updatedAt: now })
          .where(eq(payment.id, paymentId));
        await tx.insert(paymentEvent).values({
          id: randomUUID(),
          paymentId,
          action: "CORRECTED",
          beforeAmount: current.amount,
          beforePaidAt: current.paidAt,
          afterAmount: amount,
          afterPaidAt: paidAt,
          actorUserId: userId,
          createdAt: now,
        });
        return loadAggregate(transactionDatabase(tx), competitionId, userId);
      });
    },
  };
}

export const paymentRepository = createPaymentRepository(db);
