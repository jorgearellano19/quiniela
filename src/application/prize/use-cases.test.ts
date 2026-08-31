import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PaymentRepository } from "@/application/payment/use-cases";
import type { PlayoffRepository } from "@/application/playoff/use-cases";
import type {
  StandingsAggregate,
  StandingsRepository,
} from "@/application/standings/use-cases";
import { completeCompetition, getFinalCompetitionResults } from "./use-cases";

const competitionId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "admin" } as const;

function sources(overrides: Partial<StandingsAggregate> = {}) {
  const aggregate: StandingsAggregate = {
    competition: {
      id: competitionId,
      name: "Final M11",
      type: "LEAGUE",
      status: "DRAFT",
      completedAt: null,
    },
    participants: [],
    rounds: [],
    resolutions: [],
    actorIsAdmin: true,
    restrictedParticipantIds: new Set(),
    h2hMatchups: [],
    requiredRegularRoundCount: null,
    ...overrides,
  };
  const standingsRepository = {
    getCompetition: vi.fn(async () => aggregate),
    resolve: vi.fn(),
  } as unknown as StandingsRepository;
  const paymentRepository = {
    getPrizes: vi.fn(async () => ({
      currency: "MXN" as const,
      financialFeaturesEnabled: false,
      prizes: [],
    })),
  } as unknown as PaymentRepository;
  return {
    aggregate,
    paymentRepository,
    standingsRepository,
    playoffRepository: {} as PlayoffRepository,
  };
}

describe("prize and completion application", () => {
  it("returns a safe final-results DTO when financial features are disabled", async () => {
    const value = sources();
    const result = await getFinalCompetitionResults(
      value.paymentRepository,
      value.standingsRepository,
      value.playoffRepository,
      actor,
      competitionId,
    );
    expect(result).toMatchObject({
      competition: {
        id: competitionId,
        currency: "MXN",
        financialFeaturesEnabled: false,
        completedAt: null,
      },
      canManage: true,
      prizes: [],
      finalWinner: { state: "notReady" },
      completion: { ready: false },
    });
    expect(result?.completion.blockers).toContain("La quiniela todavía no ha iniciado.");
    expect(value.standingsRepository.getCompetition).toHaveBeenCalledOnce();
  });

  it("does not expose results to an anonymous actor or an unrelated viewer", async () => {
    const value = sources();
    await expect(
      getFinalCompetitionResults(
        value.paymentRepository,
        value.standingsRepository,
        value.playoffRepository,
        null,
        competitionId,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    value.standingsRepository.getCompetition = vi.fn(async () => null);
    await expect(
      getFinalCompetitionResults(
        value.paymentRepository,
        value.standingsRepository,
        value.playoffRepository,
        { userId: randomUUID() },
        competitionId,
      ),
    ).resolves.toBeNull();
  });

  it("re-evaluates readiness through the transaction-scoped repositories", async () => {
    const value = sources({
      competition: {
        id: competitionId,
        name: "Final M11",
        type: "LEAGUE",
        status: "STARTED",
        completedAt: null,
      },
    });
    const completionRepository = {
      complete: vi.fn(async (_id, _userId, _now, verify) =>
        verify({
          paymentRepository: value.paymentRepository,
          standingsRepository: value.standingsRepository,
          playoffRepository: value.playoffRepository,
        }),
      ),
    };
    await expect(
      completeCompetition(
        completionRepository,
        value.paymentRepository,
        value.standingsRepository,
        value.playoffRepository,
        actor,
        competitionId,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "La quiniela todavía tiene resultados pendientes.",
    });
    expect(completionRepository.complete).toHaveBeenCalledOnce();
  });
});
