import { describe, expect, it } from "vitest";
import type { Competition } from "@/domain/competition/competition";
import {
  createCompetition,
  getCompetitionDetail,
  listMyCompetitions,
  type CompetitionRepository,
  updateCompetition,
} from "./use-cases";
function fixture(
  overrides: Partial<Competition & { isAdmin: boolean }> = {},
): Competition & { isAdmin: boolean } {
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
    isAdmin: true,
    ...overrides,
  };
}
function repository(rows: Array<Competition & { isAdmin: boolean }> = []) {
  const created: Competition[] = [];
  const repo: CompetitionRepository = {
    async createWithAdmin(value) {
      created.push(value);
    },
    async listForUser(userId) {
      return rows.filter(
        (row) => row.isAdmin && row.createdByUserId === userId,
      );
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
  return { repo, created };
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
