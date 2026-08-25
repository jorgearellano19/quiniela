import { describe, expect, it, vi } from "vitest";
import type { MembershipRepository } from "./membership-use-cases";
import {
  approveParticipant,
  generateInvitationLink,
  invitationHash,
  leaveCompetition,
  listCompetitionParticipants,
  requestToJoin,
  revokeInvitationLink,
  startCompetition,
  viewInvitation,
} from "./membership-use-cases";

const competitionId = "00000000-0000-4000-8000-000000000001";
const membershipId = "00000000-0000-4000-8000-000000000002";
const actor = { userId: "actor" } as const;
const token = "a".repeat(43);

function repository(overrides: Partial<MembershipRepository> = {}): MembershipRepository {
  return {
    setInvitation: vi.fn(async () => true),
    findInvitation: vi.fn(async () => ({
      competitionId,
      name: "Copa",
      type: "LEAGUE" as const,
      typeLabel: "",
      currency: "MXN" as const,
      rulesNote: "Reglas",
      membershipStatus: null,
    })),
    request: vi.fn(async () => ({
      status: "PENDING" as const,
      changed: true,
    })),
    list: vi.fn(async () => []),
    transition: vi.fn(async () => true),
    leave: vi.fn(async () => true),
    start: vi.fn(async () => true),
    ...overrides,
  };
}

describe("membership application boundaries", () => {
  it("rejects anonymous access before calling persistence", async () => {
    const repo = repository();
    await expect(
      generateInvitationLink(repo, null, competitionId, "https://example.test"),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      listCompetitionParticipants(repo, null, competitionId),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(leaveCompetition(repo, null, competitionId)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(repo.setInvitation).not.toHaveBeenCalled();
  });

  it("stores only the invitation hash and returns the raw URL once", async () => {
    const setInvitation = vi.fn<MembershipRepository["setInvitation"]>(async () => true);
    const repo = repository({ setInvitation });
    const url = await generateInvitationLink(
      repo,
      actor,
      competitionId,
      "https://quiniela.example",
    );
    const rawToken = url.split("/").at(-1)!;
    const persistedHash = setInvitation.mock.calls[0]?.[2];

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(persistedHash).toBe(invitationHash(rawToken));
    expect(persistedHash).not.toContain(rawToken);
  });

  it("revokes by clearing the hash and recording invalidation", async () => {
    const setInvitation = vi.fn<MembershipRepository["setInvitation"]>(async () => true);
    await revokeInvitationLink(repository({ setInvitation }), actor, competitionId);
    expect(setInvitation).toHaveBeenCalledWith(
      competitionId,
      actor.userId,
      null,
      expect.any(Date),
    );
  });

  it("returns a safe invitation DTO without creating membership", async () => {
    const repo = repository();
    await expect(viewInvitation(repo, actor, token)).resolves.toMatchObject({
      name: "Copa",
      typeLabel: "Liga",
      rulesNote: "Reglas",
    });
    expect(repo.request).not.toHaveBeenCalled();
  });

  it("uses the authenticated identity for a join request", async () => {
    const request = vi.fn(async () => ({ status: "PENDING" as const, changed: true }));
    await expect(
      requestToJoin(repository({ request }), actor, token),
    ).resolves.toMatchObject({
      competitionId,
      status: "PENDING",
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId,
        userId: actor.userId,
        invitationHash: invitationHash(token),
      }),
    );
  });

  it("rejects active duplicate requests before persistence", async () => {
    const request = vi.fn(async () => ({ status: "PENDING" as const, changed: true }));
    const findInvitation = vi.fn(async () => ({
      competitionId,
      name: "Copa",
      type: "LEAGUE" as const,
      typeLabel: "",
      currency: "MXN" as const,
      rulesNote: null,
      membershipStatus: "ACTIVE" as const,
    }));
    await expect(
      requestToJoin(repository({ findInvitation, request }), actor, token),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects forged and cross-Competition membership IDs safely", async () => {
    const transition = vi.fn(async () => false);
    const repo = repository({ transition });
    await expect(
      approveParticipant(repo, actor, competitionId, "forged"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      approveParticipant(repo, actor, competitionId, membershipId),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("maps invalid start state to a safe application error", async () => {
    const repo = repository({ start: vi.fn(async () => false) });
    await expect(startCompetition(repo, actor, competitionId)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});
