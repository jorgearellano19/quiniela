import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSession, redirect } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("@/infrastructure/auth/session", () => ({ getServerSession }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/features/auth/sign-out-form", () => ({
  SignOutForm: () => null,
}));

import AuthLayout from "./(auth)/layout";
import ProtectedAppLayout from "./(protected)/app/layout";
import HomePage from "./page";

const session = {
  session: {
    id: "session-id",
    userId: "user-id",
    token: "private-token",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  user: {
    id: "user-id",
    email: "usuario@ejemplo.com",
    emailVerified: false,
    name: "Persona Usuaria",
    image: null,
    role: "user",
    banned: false,
    banReason: null,
    banExpires: null,
    passwordChangeRequired: false,
    temporaryPasswordIssuedAt: null,
    temporaryPasswordExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
};

describe("authentication route access", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    redirect.mockClear();
  });

  it("routes anonymous root access to sign-in", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(HomePage()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("routes authenticated root access to the protected app", async () => {
    getServerSession.mockResolvedValue(session);
    await expect(HomePage()).rejects.toThrow("REDIRECT:/app");
  });

  it("rejects anonymous access to the protected layout", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(ProtectedAppLayout({ children: null as ReactNode })).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
  });

  it("renders protected content for an authenticated session", async () => {
    getServerSession.mockResolvedValue(session);
    const result = await ProtectedAppLayout({ children: <p>Protegido</p> });
    expect(result.props.children).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("forces temporary-password users to the replacement screen", async () => {
    getServerSession.mockResolvedValue({
      ...session,
      user: { ...session.user, passwordChangeRequired: true },
    });
    await expect(ProtectedAppLayout({ children: <p>Protegido</p> })).rejects.toThrow(
      "REDIRECT:/account/change-password",
    );
  });

  it("redirects authenticated users away from auth screens", async () => {
    getServerSession.mockResolvedValue(session);
    await expect(AuthLayout({ children: null })).rejects.toThrow("REDIRECT:/app");
  });

  it("allows anonymous users to render auth screens", async () => {
    getServerSession.mockResolvedValue(null);
    const result = await AuthLayout({ children: <p>Autenticación</p> });
    expect(result.props.children).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
