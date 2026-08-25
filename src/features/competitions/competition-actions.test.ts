import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCompetition: vi.fn(),
  getServerSession: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePath: vi.fn(),
  updateCompetition: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/application/competition/use-cases", () => ({
  createCompetition: mocks.createCompetition,
  updateCompetition: mocks.updateCompetition,
}));
vi.mock("@/infrastructure/auth/session", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/infrastructure/competition/competition-repository", () => ({
  competitionRepository: {},
}));

import { createCompetitionAction, updateCompetitionAction } from "./competition-actions";

function data(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

function session(passwordChangeRequired = false) {
  return { user: { id: "user-id", passwordChangeRequired } };
}

describe("Competition Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects anonymous and forced-password requests before validation", async () => {
    mocks.getServerSession.mockResolvedValueOnce(null);
    await expect(createCompetitionAction({}, data({}))).resolves.toEqual({
      message: "Inicia sesión para continuar.",
    });
    mocks.getServerSession.mockResolvedValueOnce(session(true));
    await expect(createCompetitionAction({}, data({}))).resolves.toEqual({
      message: "Cambia tu contraseña para continuar.",
    });
    expect(mocks.createCompetition).not.toHaveBeenCalled();
  });

  it("returns accessible field-specific validation without invoking the use case", async () => {
    mocks.getServerSession.mockResolvedValue(session());
    const result = await createCompetitionAction({}, data({ name: " " }));
    expect(result).toMatchObject({
      message: "Revisa los campos marcados.",
      fieldErrors: { name: expect.any(String), type: expect.any(String) },
    });
    expect(mocks.createCompetition).not.toHaveBeenCalled();
  });

  it("creates, revalidates the list, and redirects to the safe detail route", async () => {
    mocks.getServerSession.mockResolvedValue(session());
    mocks.createCompetition.mockResolvedValue({ id: "competition-id" });
    await expect(
      createCompetitionAction(
        {},
        data({ name: "Copa", type: "LEAGUE", rulesNote: "Nota" }),
      ),
    ).rejects.toThrow("REDIRECT:/app/competitions/competition-id?created=1");
    expect(mocks.createCompetition).toHaveBeenCalledWith(
      {},
      { userId: "user-id", passwordChangeRequired: false },
      { name: "Copa", type: "LEAGUE", rulesNote: "Nota" },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("updates and revalidates only after the authorized use case succeeds", async () => {
    mocks.getServerSession.mockResolvedValue(session());
    mocks.updateCompetition.mockResolvedValue({});
    await expect(
      updateCompetitionAction(
        "competition-id",
        {},
        data({ name: "Nueva", type: "GROUP_PLAYOFFS" }),
      ),
    ).rejects.toThrow("REDIRECT:/app/competitions/competition-id?updated=1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/competitions/competition-id");
  });
});
