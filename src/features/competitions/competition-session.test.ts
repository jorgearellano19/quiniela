import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, redirect } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("@/infrastructure/auth/session", () => ({ getServerSession }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));

import { requireCompetitionPageActor } from "./competition-session";

describe("Competition page session boundary", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    redirect.mockClear();
  });

  it("redirects anonymous access independently of the layout", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(requireCompetitionPageActor()).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
  });

  it("redirects forced-password access independently of the layout", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "user", passwordChangeRequired: true },
    });
    await expect(requireCompetitionPageActor()).rejects.toThrow(
      "REDIRECT:/account/change-password",
    );
  });

  it("returns only the application actor for an ordinary session", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "user", passwordChangeRequired: false },
    });
    await expect(requireCompetitionPageActor()).resolves.toEqual({
      userId: "user",
      passwordChangeRequired: false,
    });
  });
});
