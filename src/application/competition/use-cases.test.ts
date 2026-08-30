import { describe, expect, it } from "vitest";
import type { Competition } from "@/domain/competition/competition";
import type { PaymentConfiguration } from "@/domain/payment/payment";
import {
  createCompetition,
  getCompetitionDetail,
  listMyCompetitions,
  type CompetitionRepository,
  updateCompetition,
} from "./use-cases";
type CompetitionMembership = Competition & {
  isAdmin: boolean;
  membershipStatus: "PENDING" | "ACTIVE" | "REJECTED" | "REMOVED";
};

function fixture(overrides: Partial<CompetitionMembership> = {}): CompetitionMembership {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Copa",
    type: "LEAGUE",
    status: "DRAFT",
    currency: "MXN",
    rulesNote: null,
    createdByUserId: "owner",
    updatedByUserId: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
    invitationTokenHash: null,
    invitationInvalidatedAt: null,
    startedAt: null,
    isAdmin: true,
    membershipStatus: "ACTIVE",
    ...overrides,
  };
}
function repository(rows: CompetitionMembership[] = []) {
  const created: Competition[] = [];
  const paymentConfigurations: PaymentConfiguration[] = [];
  const repo: CompetitionRepository = {
    async createWithAdmin(value, _membershipId, paymentConfiguration) {
      created.push(value);
      if (paymentConfiguration) paymentConfigurations.push(paymentConfiguration);
    },
    async listForUser(userId) {
      return rows.filter((row) => row.isAdmin && row.createdByUserId === userId);
    },
    async findForUser(id, userId) {
      return (
        rows.find(
          (row) =>
            row.id === id &&
            (row.createdByUserId === userId || row.updatedByUserId === userId),
        ) ?? null
      );
    },
    async updateDraft() {
      return true;
    },
  };
  return { repo, created, paymentConfigurations };
}
describe("Competition use cases", () => {
  it("rejects anonymous and forced-password access", async () => {
    const { repo } = repository();
    await expect(createCompetition(repo, null, {})).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(
      listMyCompetitions(repo, {
        userId: "owner",
        passwordChangeRequired: true,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("creates the caller as Admin without accepting authority fields", async () => {
    const { repo, created } = repository();
    const result = await createCompetition(
      repo,
      { userId: "owner" },
      {
        name: "Copa",
        type: "LEAGUE",
        currency: "USD",
        status: "COMPLETED",
        userId: "forged",
      },
    );
    expect(result).toMatchObject({
      currency: "MXN",
      status: "DRAFT",
      capabilities: { canEdit: true },
    });
    expect(created[0]).toMatchObject({ createdByUserId: "owner" });
  });
  it("validates and includes initial payment rules in atomic creation", async () => {
    const { repo, paymentConfigurations } = repository();
    await createCompetition(
      repo,
      { userId: "owner" },
      {
        name: "Copa con cuota",
        type: "LEAGUE",
        financialFeaturesEnabled: "on",
        roundFeeAmount: "250.50",
        maximumDebt: "500",
        roundWinnerPrizeAmount: "1000",
      },
    );
    expect(paymentConfigurations[0]).toEqual({
      financialFeaturesEnabled: true,
      roundFeeAmount: 25_050,
      maximumDebt: 50_000,
      prizes: { ROUND_WINNER: 100_000 },
    });
  });
  it("rejects Round payment rules for GROUP_PLAYOFFS at creation", async () => {
    const { repo } = repository();
    await expect(
      createCompetition(
        repo,
        { userId: "owner" },
        {
          name: "Grupos",
          type: "GROUP_PLAYOFFS",
          financialFeaturesEnabled: "on",
          roundFeeAmount: "100",
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("returns null for missing, malformed, and unrelated details", async () => {
    const row = fixture();
    const { repo } = repository([row]);
    await expect(
      getCompetitionDetail(repo, { userId: "other" }, row.id),
    ).resolves.toBeNull();
    await expect(
      getCompetitionDetail(repo, { userId: "owner" }, "forged"),
    ).resolves.toBeNull();
  });
  it("does not grant a platform operator implicit access", async () => {
    const row = fixture();
    const { repo } = repository([row]);
    await expect(
      getCompetitionDetail(repo, { userId: "operator" }, row.id),
    ).resolves.toBeNull();
  });
  it("allows persisted Admin membership and denies a non-Admin mutation", async () => {
    const admin = fixture();
    const member = fixture({
      id: "00000000-0000-4000-8000-000000000002",
      createdByUserId: "member",
      updatedByUserId: "member",
      isAdmin: false,
    });
    const { repo } = repository([admin, member]);
    await expect(
      updateCompetition(
        repo,
        { userId: "owner" },
        { competitionId: admin.id, name: "Nueva", type: "GROUP_PLAYOFFS" },
      ),
    ).resolves.toMatchObject({ name: "Nueva" });
    await expect(
      updateCompetition(
        repo,
        { userId: "member" },
        { competitionId: member.id, name: "No", type: "LEAGUE" },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("authorizes before validating editable configuration", async () => {
    const admin = fixture();
    const { repo } = repository([admin]);
    await expect(
      updateCompetition(
        repo,
        { userId: "other" },
        {
          competitionId: admin.id,
          name: "",
          type: "FORGED",
        },
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "No fue posible actualizar la quiniela.",
    });
    await expect(
      updateCompetition(
        repo,
        { userId: "owner" },
        {
          competitionId: admin.id,
          name: "",
          type: "FORGED",
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns generic authorization for malformed Competition IDs", async () => {
    const { repo } = repository();
    await expect(
      updateCompetition(
        repo,
        { userId: "owner" },
        {
          competitionId: "forged",
          name: "Copa",
          type: "LEAGUE",
        },
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "No fue posible actualizar la quiniela.",
    });
  });
});
