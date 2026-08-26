import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/lib/errors/application-error";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  submit: vi.fn(),
  update: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/infrastructure/auth/session", () => ({ getServerSession: mocks.session }));
vi.mock("@/application/answer/use-cases", () => ({
  submitAnswer: mocks.submit,
  updateAnswer: mocks.update,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/infrastructure/answer/answer-repository", () => ({
  answerRepository: {},
}));

import { saveAnswerAction } from "./answer-actions";

describe("Answer Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "user", passwordChangeRequired: false },
    });
  });

  it("maps typed FormData and invokes submit without participant identity", async () => {
    const data = new FormData();
    data.set("type", "MATCH_SCORE");
    data.set("homeScore", "2");
    data.set("awayScore", "1");
    const result = await saveAnswerAction(
      "submit",
      "competition",
      "round",
      "question",
      {},
      data,
    );
    expect(mocks.submit).toHaveBeenCalledWith(
      {},
      { userId: "user", passwordChangeRequired: false },
      {
        competitionId: "competition",
        roundId: "round",
        questionId: "question",
        type: "MATCH_SCORE",
        homeScore: "2",
        awayScore: "1",
      },
    );
    expect(result).toEqual({ success: true, message: "Pronóstico guardado." });
  });

  it("rejects anonymous requests before the use case", async () => {
    mocks.session.mockResolvedValue(null);
    const result = await saveAnswerAction(
      "update",
      "competition",
      "round",
      "question",
      {},
      new FormData(),
    );
    expect(result).toEqual({ message: "Inicia sesión para continuar." });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns safe field errors from the application boundary", async () => {
    mocks.submit.mockRejectedValue(
      new ApplicationError("INVALID_INPUT", "Revisa los campos marcados.", undefined, {
        homeScore: "Escribe un marcador local entero entre 0 y 999.",
      }),
    );
    const data = new FormData();
    data.set("type", "MATCH_SCORE");
    const result = await saveAnswerAction(
      "submit",
      "competition",
      "round",
      "question",
      {},
      data,
    );
    expect(result).toMatchObject({
      message: "Revisa los campos marcados.",
      fieldErrors: { homeScore: expect.any(String) },
    });
  });

  it("revalidates stale editability after a rejected write", async () => {
    mocks.update.mockRejectedValue(
      new ApplicationError("UNAUTHORIZED", "No fue posible guardar el pronóstico."),
    );
    const result = await saveAnswerAction(
      "update",
      "competition",
      "round",
      "question",
      {},
      new FormData(),
    );
    expect(result).toMatchObject({ refresh: true });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/app/competitions/competition/answers/round",
    );
  });
});
