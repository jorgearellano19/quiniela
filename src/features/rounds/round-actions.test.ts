import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/lib/errors/application-error";
const mocks = vi.hoisted(() => ({
  createQuestion: vi.fn(),
  createRound: vi.fn(),
  publishRound: vi.fn(),
  removeQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  updateRound: vi.fn(),
  getServerSession: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/application/round/use-cases", () => ({
  createQuestion: mocks.createQuestion,
  createRound: mocks.createRound,
  publishRound: mocks.publishRound,
  removeQuestion: mocks.removeQuestion,
  updateQuestion: mocks.updateQuestion,
  updateRound: mocks.updateRound,
}));
vi.mock("@/infrastructure/auth/session", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/infrastructure/round/round-repository", () => ({ roundRepository: {} }));
import {
  createQuestionAction,
  publishRoundAction,
  updateQuestionAction,
} from "./round-actions";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const common = {
  type: "OPTIONS",
  sequence: "1",
  prompt: "¿Quién gana?",
  deadlineMode: "CUSTOM",
  deadlineAt: "2027-01-01T18:00:00.000Z",
  points: "1",
};
describe("Round Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({
      user: { id: "admin", passwordChangeRequired: false },
    });
  });
  it("returns actionable field errors before invoking the use case", async () => {
    const result = await createQuestionAction(
      "competition",
      "round",
      {},
      form({ ...common, options: "Duplicada\nduplicada" }),
    );
    expect(result).toMatchObject({
      message: "Revisa los campos marcados.",
      fieldErrors: { options: expect.any(String) },
    });
    expect(mocks.createQuestion).not.toHaveBeenCalled();
  });
  it("uses the same typed FormData mapping for create and update", async () => {
    const data = form({ ...common, options: "Local\nEmpate\nVisitante" });
    await createQuestionAction("competition", "round", {}, data);
    await updateQuestionAction("competition", "round", "question", {}, data);
    const expected = expect.objectContaining({
      competitionId: "competition",
      roundId: "round",
      type: "OPTIONS",
      options: [{ label: "Local" }, { label: "Empate" }, { label: "Visitante" }],
    });
    expect(mocks.createQuestion).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "admin" }),
      expected,
    );
    expect(mocks.updateQuestion).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "admin" }),
      "question",
      expected,
    );
  });
  it("returns a safe publication failure without revalidating", async () => {
    mocks.publishRound.mockRejectedValue(
      new ApplicationError("INVALID_INPUT", "Revisa la configuración de la jornada."),
    );
    await expect(publishRoundAction("competition", "round")).resolves.toEqual({
      message: "Revisa la configuración de la jornada.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
