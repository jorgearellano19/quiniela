import { z } from "zod";
import {
  PaymentDomainError,
  MAX_MONEY_MINOR_UNITS,
  validatePayment,
  validatePaymentConfiguration,
  type PaymentConfiguration,
} from "@/domain/payment/payment";
import type {
  CompetitionStatus,
  CompetitionType,
} from "@/domain/competition/competition";
import {
  requireCompetitionActor,
  type CompetitionActor,
} from "@/application/competition/boundary";
import { ApplicationError } from "@/lib/errors/application-error";
import {
  getRoundWinner,
  type StandingsRepository,
} from "@/application/standings/use-cases";

export type PaymentHistoryItem = Readonly<{
  id: string;
  amount: number;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ObligationHistoryItem = Readonly<{
  id: string;
  roundId: string;
  roundName: string;
  roundSequence: number;
  amount: number;
  createdAt: Date;
}>;

export type ParticipantPaymentStatus = Readonly<{
  participantId: string;
  userId: string;
  name: string;
  email: string;
  owed: number;
  paid: number;
  balance: number;
  restricted: boolean;
  obligations: ObligationHistoryItem[];
  payments: PaymentHistoryItem[];
}>;

export type PaymentAggregate = Readonly<{
  competition: {
    id: string;
    name: string;
    type: CompetitionType;
    status: CompetitionStatus;
    currency: "MXN";
    paymentsEnabled: boolean;
    roundFeeAmount: number | null;
    maximumDebt: number | null;
    roundWinnerPrizeAmount: number | null;
  };
  actorIsAdmin: boolean;
  actorParticipantId: string | null;
  participants: ParticipantPaymentStatus[];
}>;

export interface PaymentRepository {
  getMine(competitionId: string, userId: string): Promise<PaymentAggregate | null>;
  getAdmin(competitionId: string, userId: string): Promise<PaymentAggregate | null>;
  getPrize(
    competitionId: string,
    userId: string,
  ): Promise<{ currency: "MXN"; roundWinnerPrizeAmount: number | null } | null>;
  configure(
    competitionId: string,
    userId: string,
    now: Date,
    operation: (aggregate: PaymentAggregate) => PaymentConfiguration,
  ): Promise<PaymentAggregate | null>;
  record(
    competitionId: string,
    participantId: string,
    paymentId: string,
    userId: string,
    amount: number,
    paidAt: Date,
    now: Date,
  ): Promise<PaymentAggregate | null>;
  update(
    competitionId: string,
    paymentId: string,
    userId: string,
    amount: number,
    paidAt: Date,
    now: Date,
  ): Promise<PaymentAggregate | null>;
}

const id = z.uuid();
const configInput = z.object({
  competitionId: id,
  enabled: z.union([z.boolean(), z.literal("on").transform(() => true)]).default(false),
  roundFeeAmount: z.unknown().optional(),
  maximumDebt: z.unknown().optional(),
  roundWinnerPrizeAmount: z.unknown().optional(),
});
const paymentInput = z.object({
  competitionId: id,
  participantId: id.optional(),
  paymentId: id,
  amount: z.unknown(),
  paidAt: z.unknown(),
});

function money(value: unknown, optional = false): number | null {
  const raw = String(value ?? "").trim();
  if (!raw && optional) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw))
    invalid("Escribe un monto válido con máximo dos decimales.");
  const [whole = "0", fraction = ""] = raw.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > MAX_MONEY_MINOR_UNITS)
    invalid("El monto excede el máximo permitido.");
  return result;
}

function date(value: unknown) {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.valueOf())) invalid("Selecciona una fecha y hora válidas.");
  return parsed;
}

function invalid(message: string): never {
  throw new ApplicationError("INVALID_INPUT", message);
}

function safeConfiguration<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof PaymentDomainError) invalid("Revisa la configuración de pagos.");
    throw error;
  }
}

function safePayment<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof PaymentDomainError)
      invalid("Revisa que el monto sea positivo y la fecha no esté en el futuro.");
    throw error;
  }
}

function publicAggregate(aggregate: PaymentAggregate, participantOnly: boolean) {
  return {
    competition: aggregate.competition,
    canManage: aggregate.actorIsAdmin,
    participants: participantOnly
      ? aggregate.participants.filter(
          (item) => item.participantId === aggregate.actorParticipantId,
        )
      : aggregate.participants,
  };
}

export async function configurePayments(
  repository: PaymentRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  const parsed = configInput.safeParse(input);
  if (!parsed.success) invalid("Revisa la configuración de pagos.");
  const result = await repository.configure(
    parsed.data.competitionId,
    actor.userId,
    now,
    (aggregate) => {
      if (!aggregate.actorIsAdmin || aggregate.competition.status !== "DRAFT")
        throw new ApplicationError(
          "UNAUTHORIZED",
          "No fue posible guardar la configuración.",
        );
      const enabled = parsed.data.enabled;
      return safeConfiguration(() =>
        validatePaymentConfiguration(aggregate.competition.type, {
          enabled,
          roundFeeAmount: enabled ? money(parsed.data.roundFeeAmount)! : null,
          maximumDebt: enabled ? money(parsed.data.maximumDebt, true) : null,
          roundWinnerPrizeAmount: money(parsed.data.roundWinnerPrizeAmount, true),
        }),
      );
    },
  );
  if (!result)
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No fue posible guardar la configuración.",
    );
  return publicAggregate(result, false);
}

export async function getMyDebt(
  repository: PaymentRepository,
  actorValue: CompetitionActor,
  competitionId: string,
) {
  const actor = requireCompetitionActor(actorValue);
  if (!id.safeParse(competitionId).success) return null;
  const result = await repository.getMine(competitionId, actor.userId);
  if (!result || !result.actorParticipantId) return null;
  return publicAggregate(result, true);
}

export async function getCompetitionPaymentStatus(
  repository: PaymentRepository,
  actorValue: CompetitionActor,
  competitionId: string,
) {
  const actor = requireCompetitionActor(actorValue);
  if (!id.safeParse(competitionId).success) return null;
  const result = await repository.getAdmin(competitionId, actor.userId);
  return result ? publicAggregate(result, false) : null;
}

export async function recordPayment(
  repository: PaymentRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success || !parsed.data.participantId)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible registrar el pago.");
  const amount = money(parsed.data.amount)!;
  const paidAt = date(parsed.data.paidAt);
  safePayment(() => validatePayment(amount, paidAt, now));
  const result = await repository.record(
    parsed.data.competitionId,
    parsed.data.participantId,
    parsed.data.paymentId,
    actor.userId,
    amount,
    paidAt,
    now,
  );
  if (!result)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible registrar el pago.");
  return publicAggregate(result, false);
}

export async function updatePayment(
  repository: PaymentRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible corregir el pago.");
  const amount = money(parsed.data.amount)!;
  const paidAt = date(parsed.data.paidAt);
  safePayment(() => validatePayment(amount, paidAt, now));
  const result = await repository.update(
    parsed.data.competitionId,
    parsed.data.paymentId,
    actor.userId,
    amount,
    paidAt,
    now,
  );
  if (!result)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible corregir el pago.");
  return publicAggregate(result, false);
}

export async function getPaymentWinner(
  paymentRepository: PaymentRepository,
  standingsRepository: StandingsRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  roundId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (!id.safeParse(competitionId).success || !id.safeParse(roundId).success) return null;
  const [payments, winner] = await Promise.all([
    paymentRepository.getPrize(competitionId, actor.userId),
    getRoundWinner(standingsRepository, actor, competitionId, roundId, now),
  ]);
  if (!payments || !winner) return null;
  return {
    ...winner,
    currency: payments.currency,
    prizeAmount: payments.roundWinnerPrizeAmount,
  };
}

export type PaymentPageDetail = NonNullable<Awaited<ReturnType<typeof getMyDebt>>>;
