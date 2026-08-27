import type { CompetitionType } from "@/domain/competition/competition";

export type PaymentConfiguration = Readonly<{
  enabled: boolean;
  roundFeeAmount: number | null;
  maximumDebt: number | null;
  roundWinnerPrizeAmount: number | null;
}>;

export type PaymentFact = Readonly<{ amount: number }>;

export class PaymentDomainError extends Error {}

export const MAX_MONEY_MINOR_UNITS = 2_147_483_647;

function minorUnits(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_MONEY_MINOR_UNITS)
    throw new PaymentDomainError(`${label} must be positive integer minor units.`);
  return value;
}

export function validatePaymentConfiguration(
  competitionType: CompetitionType,
  value: PaymentConfiguration,
): PaymentConfiguration {
  if (competitionType === "GROUP_PLAYOFFS") {
    if (
      value.enabled ||
      value.roundFeeAmount !== null ||
      value.maximumDebt !== null ||
      value.roundWinnerPrizeAmount !== null
    )
      throw new PaymentDomainError("This Competition type has no Round payments.");
    return value;
  }
  if (!value.enabled) {
    if (value.roundFeeAmount !== null || value.maximumDebt !== null)
      throw new PaymentDomainError("Disabled payments cannot retain debt settings.");
  } else {
    if (value.roundFeeAmount === null)
      throw new PaymentDomainError("A Round fee is required.");
    minorUnits(value.roundFeeAmount, "Round fee");
    if (
      value.maximumDebt !== null &&
      (!Number.isSafeInteger(value.maximumDebt) ||
        value.maximumDebt < 0 ||
        value.maximumDebt > MAX_MONEY_MINOR_UNITS)
    )
      throw new PaymentDomainError("Maximum debt must be nonnegative minor units.");
  }
  if (value.roundWinnerPrizeAmount !== null)
    minorUnits(value.roundWinnerPrizeAmount, "Round prize");
  return value;
}

export function validatePayment(amount: number, paidAt: Date, now: Date) {
  minorUnits(amount, "Payment");
  if (!Number.isFinite(paidAt.valueOf()) || paidAt.valueOf() > now.valueOf())
    throw new PaymentDomainError("Payment date must be valid and not in the future.");
  return { amount, paidAt } as const;
}

export function calculateBalance(
  obligations: ReadonlyArray<PaymentFact>,
  payments: ReadonlyArray<PaymentFact>,
) {
  return (
    obligations.reduce((sum, value) => sum + value.amount, 0) -
    payments.reduce((sum, value) => sum + value.amount, 0)
  );
}

export function isRestricted(balance: number, maximumDebt: number | null) {
  return maximumDebt !== null && balance > maximumDebt;
}
