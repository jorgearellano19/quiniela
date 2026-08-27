import { describe, expect, it } from "vitest";
import {
  calculateBalance,
  isRestricted,
  PaymentDomainError,
  validatePayment,
  validatePaymentConfiguration,
} from "./payment";

describe("payments", () => {
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
        enabled: true,
        roundFeeAmount: 5000,
        maximumDebt: 0,
        roundWinnerPrizeAmount: 10000,
      }),
    ).toMatchObject({ enabled: true, roundFeeAmount: 5000 });
    expect(() =>
      validatePaymentConfiguration("GROUP_PLAYOFFS", {
        enabled: true,
        roundFeeAmount: 5000,
        maximumDebt: 0,
        roundWinnerPrizeAmount: null,
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
        enabled: true,
        roundFeeAmount: 2_147_483_648,
        maximumDebt: null,
        roundWinnerPrizeAmount: null,
      }),
    ).toThrow(PaymentDomainError);
  });
});
