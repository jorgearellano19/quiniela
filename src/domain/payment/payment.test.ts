import { describe, expect, it } from "vitest";
import {
  calculateBalance,
  isRestricted,
  PaymentDomainError,
  validatePayment,
  validatePaymentConfiguration,
} from "./payment";

describe("payments", () => {
  it.each([
    ["LEAGUE", "ROUND_WINNER", true],
    ["LEAGUE", "LEAGUE_WINNER", true],
    ["LEAGUE", "LEAGUE_PHASE_WINNER", false],
    ["LEAGUE", "PLAYOFF_CHAMPION", false],
    ["LEAGUE_PLAYOFFS", "ROUND_WINNER", true],
    ["LEAGUE_PLAYOFFS", "LEAGUE_WINNER", false],
    ["LEAGUE_PLAYOFFS", "LEAGUE_PHASE_WINNER", true],
    ["LEAGUE_PLAYOFFS", "PLAYOFF_CHAMPION", true],
    ["GROUP_PLAYOFFS", "ROUND_WINNER", false],
    ["GROUP_PLAYOFFS", "LEAGUE_WINNER", false],
    ["GROUP_PLAYOFFS", "LEAGUE_PHASE_WINNER", false],
    ["GROUP_PLAYOFFS", "PLAYOFF_CHAMPION", true],
  ] as const)("%s support for %s is %s", (competitionType, prizeType, allowed) => {
    const operation = () =>
      validatePaymentConfiguration(competitionType, {
        financialFeaturesEnabled: true,
        roundFeeAmount: null,
        maximumDebt: null,
        prizes: { [prizeType]: 10_000 },
      });
    if (allowed) expect(operation).not.toThrow();
    else expect(operation).toThrow(PaymentDomainError);
  });

  it.each([
    ["LEAGUE", "LEAGUE_WINNER"],
    ["LEAGUE_PLAYOFFS", "LEAGUE_PHASE_WINNER"],
    ["GROUP_PLAYOFFS", "PLAYOFF_CHAMPION"],
  ] as const)("allows %s prize %s without a round fee", (type, prizeType) => {
    expect(
      validatePaymentConfiguration(type, {
        financialFeaturesEnabled: true,
        roundFeeAmount: null,
        maximumDebt: null,
        prizes: { [prizeType]: 10_000 },
      }),
    ).toBeTruthy();
  });

  it("rejects unsupported prizes and GROUP_PLAYOFFS fee tracking", () => {
    expect(() =>
      validatePaymentConfiguration("GROUP_PLAYOFFS", {
        financialFeaturesEnabled: true,
        roundFeeAmount: 100,
        maximumDebt: null,
        prizes: { PLAYOFF_CHAMPION: 10_000 },
      }),
    ).toThrow();
    expect(() =>
      validatePaymentConfiguration("LEAGUE", {
        financialFeaturesEnabled: true,
        roundFeeAmount: null,
        maximumDebt: null,
        prizes: { PLAYOFF_CHAMPION: 10_000 },
      }),
    ).toThrow();
  });
  it("derives partial payments and overpayment credit", () => {
    expect(
      calculateBalance([{ amount: 5000 }, { amount: 5000 }], [{ amount: 2500 }]),
    ).toBe(7500);
    expect(calculateBalance([{ amount: 5000 }], [{ amount: 7000 }])).toBe(-2000);
  });

  it("restricts only strictly above a configured threshold", () => {
    expect(isRestricted(1001, 1000)).toBe(true);
    expect(isRestricted(1000, 1000)).toBe(false);
    expect(isRestricted(1001, null)).toBe(false);
  });

  it("validates type-aware configuration", () => {
    expect(
      validatePaymentConfiguration("LEAGUE", {
        financialFeaturesEnabled: true,
        roundFeeAmount: 5000,
        maximumDebt: 0,
        prizes: { ROUND_WINNER: 10000 },
      }),
    ).toMatchObject({ financialFeaturesEnabled: true, roundFeeAmount: 5000 });
    expect(() =>
      validatePaymentConfiguration("GROUP_PLAYOFFS", {
        financialFeaturesEnabled: true,
        roundFeeAmount: 5000,
        maximumDebt: 0,
        prizes: {},
      }),
    ).toThrow(PaymentDomainError);
  });

  it("accepts positive past payments and rejects future timestamps", () => {
    const now = new Date("2026-08-27T12:00:00Z");
    expect(validatePayment(100, new Date("2026-08-26T12:00:00Z"), now).amount).toBe(100);
    expect(() => validatePayment(100, new Date("2026-08-28T12:00:00Z"), now)).toThrow(
      PaymentDomainError,
    );
  });

  it("rejects amounts outside the PostgreSQL integer range", () => {
    const now = new Date("2026-08-27T12:00:00Z");
    expect(() => validatePayment(2_147_483_648, now, now)).toThrow(PaymentDomainError);
    expect(() =>
      validatePaymentConfiguration("LEAGUE", {
        financialFeaturesEnabled: true,
        roundFeeAmount: 2_147_483_648,
        maximumDebt: null,
        prizes: {},
      }),
    ).toThrow(PaymentDomainError);
  });

  it.each([0, -1, 1.5])(
    "rejects non-positive or fractional prize amount %s",
    (amount) => {
      expect(() =>
        validatePaymentConfiguration("LEAGUE", {
          financialFeaturesEnabled: true,
          roundFeeAmount: null,
          maximumDebt: null,
          prizes: { LEAGUE_WINNER: amount },
        }),
      ).toThrow(PaymentDomainError);
    },
  );

  it("requires enabled financial features to contain a fee or prize", () => {
    expect(() =>
      validatePaymentConfiguration("LEAGUE", {
        financialFeaturesEnabled: true,
        roundFeeAmount: null,
        maximumDebt: null,
        prizes: {},
      }),
    ).toThrow(PaymentDomainError);
    expect(() =>
      validatePaymentConfiguration("LEAGUE", {
        financialFeaturesEnabled: false,
        roundFeeAmount: null,
        maximumDebt: null,
        prizes: { LEAGUE_WINNER: 10_000 },
      }),
    ).toThrow(PaymentDomainError);
  });
});
