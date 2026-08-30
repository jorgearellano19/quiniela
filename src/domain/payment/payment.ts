import type { CompetitionType } from "@/domain/competition/competition";

export type PaymentConfiguration = Readonly<{
  financialFeaturesEnabled: boolean;
  roundFeeAmount: number | null;
  maximumDebt: number | null;
  prizes: PrizeConfigurationInput;
}>;

export const PRIZE_TYPES = [
  "ROUND_WINNER",
  "LEAGUE_WINNER",
  "LEAGUE_PHASE_WINNER",
  "PLAYOFF_CHAMPION",
] as const;
export type PrizeType = (typeof PRIZE_TYPES)[number];
export type PrizeConfigurationInput = Readonly<Partial<Record<PrizeType, number>>>;
export type PrizeConfiguration = Readonly<{
  type: PrizeType;
  amount: number;
}>;
export type PrizeWinnerResult =
  | Readonly<{ state: "notReady" }>
  | Readonly<{ state: "unresolved"; tiedParticipantIds: readonly string[] }>
  | Readonly<{
      state: "resolved";
      winner: Readonly<{ id: string; name: string }>;
    }>;

export const ALLOWED_PRIZE_TYPES: Readonly<
  Record<CompetitionType, readonly PrizeType[]>
> = {
  LEAGUE: ["ROUND_WINNER", "LEAGUE_WINNER"],
  LEAGUE_PLAYOFFS: ["ROUND_WINNER", "LEAGUE_PHASE_WINNER", "PLAYOFF_CHAMPION"],
  GROUP_PLAYOFFS: ["PLAYOFF_CHAMPION"],
};

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
  const configured = value.prizes;
  const configuredPrizes = Object.entries(configured) as [PrizeType, number][];
  const enabled = value.financialFeaturesEnabled;
  if (!enabled) {
    if (
      value.roundFeeAmount !== null ||
      value.maximumDebt !== null ||
      configuredPrizes.length
    )
      throw new PaymentDomainError("Disabled financial features cannot retain settings.");
  } else {
    if (value.roundFeeAmount === null && configuredPrizes.length === 0)
      throw new PaymentDomainError("At least one financial feature is required.");
    if (value.roundFeeAmount !== null) minorUnits(value.roundFeeAmount, "Round fee");
    if (
      value.maximumDebt !== null &&
      (value.roundFeeAmount === null ||
        !Number.isSafeInteger(value.maximumDebt) ||
        value.maximumDebt < 0 ||
        value.maximumDebt > MAX_MONEY_MINOR_UNITS)
    )
      throw new PaymentDomainError("Maximum debt must be nonnegative minor units.");
  }
  if (
    competitionType === "GROUP_PLAYOFFS" &&
    (value.roundFeeAmount !== null || value.maximumDebt !== null)
  )
    throw new PaymentDomainError("This Competition type has no fee or debt tracking.");
  for (const [type, amount] of configuredPrizes) {
    if (!ALLOWED_PRIZE_TYPES[competitionType].includes(type))
      throw new PaymentDomainError("Prize type is not supported by this Competition.");
    minorUnits(amount, "Prize");
  }
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
