import { describe, expect, it, vi } from "vitest";
import {
  configurePayments,
  getCompetitionPaymentStatus,
  getMyDebt,
  recordPayment,
  updatePayment,
  type PaymentAggregate,
  type PaymentRepository,
} from "./use-cases";
import { ApplicationError } from "@/lib/errors/application-error";

const ids = {
  competition: "11111111-1111-4111-8111-111111111111",
  participant: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
  payment: "44444444-4444-4444-8444-444444444444",
};
const now = new Date("2026-08-27T12:00:00Z");

function aggregate(overrides: Partial<PaymentAggregate> = {}): PaymentAggregate {
  return {
    competition: {
      id: ids.competition,
      name: "Liga",
      type: "LEAGUE",
      status: "DRAFT",
      currency: "MXN",
      paymentsEnabled: false,
      roundFeeAmount: null,
      maximumDebt: null,
      roundWinnerPrizeAmount: null,
    },
    actorIsAdmin: true,
    actorParticipantId: ids.participant,
    participants: [
      {
        participantId: ids.participant,
        userId: "user",
        name: "Ana",
        email: "ana@example.test",
        owed: 5000,
        paid: 0,
        balance: 5000,
        restricted: true,
        obligations: [],
        payments: [],
      },
      {
        participantId: ids.other,
        userId: "other",
        name: "Beto",
        email: "beto@example.test",
        owed: 0,
        paid: 0,
        balance: 0,
        restricted: false,
        obligations: [],
        payments: [],
      },
    ],
    ...overrides,
  };
}

function repository(value: PaymentAggregate): PaymentRepository {
  return {
    getMine: vi.fn(async () => ({
      ...value,
      participants: value.participants.filter(
        (item) => item.participantId === value.actorParticipantId,
      ),
    })),
    getAdmin: vi.fn(async () => (value.actorIsAdmin ? value : null)),
    getPrize: vi.fn(async () => ({
      currency: "MXN" as const,
      roundWinnerPrizeAmount: value.competition.roundWinnerPrizeAmount,
    })),
    configure: vi.fn(async (_id, _user, _now, operation) => {
      const config = operation(value);
      return {
        ...value,
        competition: {
          ...value.competition,
          paymentsEnabled: config.enabled,
          roundFeeAmount: config.roundFeeAmount,
          maximumDebt: config.maximumDebt,
          roundWinnerPrizeAmount: config.roundWinnerPrizeAmount,
        },
      };
    }),
    record: vi.fn(async () => value),
    update: vi.fn(async () => value),
  };
}

describe("payment application", () => {
  it("configures minor-unit values only for a DRAFT Admin", async () => {
    const repo = repository(aggregate());
    const result = await configurePayments(
      repo,
      { userId: "admin" },
      {
        competitionId: ids.competition,
        enabled: true,
        roundFeeAmount: "250.50",
        maximumDebt: "500",
        roundWinnerPrizeAmount: "1000",
      },
      now,
    );
    expect(result.competition).toMatchObject({
      paymentsEnabled: true,
      roundFeeAmount: 25050,
      maximumDebt: 50000,
      roundWinnerPrizeAmount: 100000,
    });
  });

  it("returns only the authenticated participant's private detail", async () => {
    const value = aggregate({ actorIsAdmin: false });
    const result = await getMyDebt(
      repository(value),
      { userId: "user" },
      ids.competition,
    );
    expect(result?.participants.map((item) => item.participantId)).toEqual([
      ids.participant,
    ]);
    await expect(
      getCompetitionPaymentStatus(repository(value), { userId: "user" }, ids.competition),
    ).resolves.toBeNull();
  });

  it("records positive past payments and rejects future values", async () => {
    const value = aggregate({
      competition: { ...aggregate().competition, status: "STARTED" },
    });
    const repo = repository(value);
    await recordPayment(
      repo,
      { userId: "admin" },
      {
        competitionId: ids.competition,
        participantId: ids.participant,
        paymentId: ids.payment,
        amount: "100.25",
        paidAt: "2026-08-27T11:00:00Z",
      },
      now,
    );
    expect(repo.record).toHaveBeenCalledWith(
      ids.competition,
      ids.participant,
      ids.payment,
      "admin",
      10025,
      new Date("2026-08-27T11:00:00Z"),
      now,
    );
    await expect(
      updatePayment(
        repo,
        { userId: "admin" },
        {
          competitionId: ids.competition,
          paymentId: ids.payment,
          amount: "100",
          paidAt: "2026-08-28T11:00:00Z",
        },
        now,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Revisa que el monto sea positivo y la fecha no esté en el futuro.",
    });
  });

  it("rejects values outside PostgreSQL integer minor-unit range", async () => {
    await expect(
      configurePayments(
        repository(aggregate()),
        { userId: "admin" },
        {
          competitionId: ids.competition,
          enabled: true,
          roundFeeAmount: "21474836.48",
        },
        now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects incompatible GROUP_PLAYOFFS payment configuration", async () => {
    const value = aggregate({
      competition: { ...aggregate().competition, type: "GROUP_PLAYOFFS" },
    });
    await expect(
      configurePayments(
        repository(value),
        { userId: "admin" },
        {
          competitionId: ids.competition,
          enabled: true,
          roundFeeAmount: "100",
        },
        now,
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
});
