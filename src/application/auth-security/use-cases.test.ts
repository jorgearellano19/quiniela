import { describe, expect, it, vi } from "vitest";
import type { AuthSecurityRepository } from "./use-cases";
import { findSecurityUser, issueTemporaryPassword } from "./use-cases";

const repository: AuthSecurityRepository = {
  findByEmail: vi.fn(async () => null),
  suspend: vi.fn(async () => undefined),
  restore: vi.fn(async () => undefined),
  revokeSessions: vi.fn(async () => undefined),
  issueTemporaryPassword: vi.fn(async () => ({
    temporaryPassword: "temporary-password",
    expiresAt: new Date("2030-01-01T00:15:00Z"),
  })),
};

describe("platform security authorization", () => {
  it("rejects an ordinary authenticated user", async () => {
    await expect(
      findSecurityUser(repository, { userId: "user", role: "user" }, "a@b.com"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("normalizes exact email lookup for a platform operator", async () => {
    await findSecurityUser(
      repository,
      { userId: "operator", role: "platform_operator" },
      "  PERSONA@EJEMPLO.COM ",
    );
    expect(repository.findByEmail).toHaveBeenCalledWith("persona@ejemplo.com");
  });

  it("requires a verification note before recovery issuance", async () => {
    await expect(
      issueTemporaryPassword(
        repository,
        { userId: "operator", role: "platform_operator" },
        { targetId: "target", reason: " ", verificationMethod: "WHATSAPP" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
