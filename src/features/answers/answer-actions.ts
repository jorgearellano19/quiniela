"use server";

import { revalidatePath } from "next/cache";
import { submitAnswer, updateAnswer } from "@/application/answer/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { answerRepository } from "@/infrastructure/answer/answer-repository";
import { ApplicationError, toSafeError } from "@/lib/errors/application-error";

export type AnswerActionState = Readonly<{
  success?: boolean;
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  refresh?: boolean;
}>;

function answerInput(
  competitionId: string,
  roundId: string,
  questionId: string,
  data: FormData,
) {
  const type = String(data.get("type"));
  const common = { competitionId, roundId, questionId, type };
  if (type === "MATCH_SCORE")
    return {
      ...common,
      homeScore: data.get("homeScore"),
      awayScore: data.get("awayScore"),
    };
  if (type === "OPTIONS") return { ...common, optionId: data.get("optionId") };
  return { ...common, value: data.get("value") };
}

export async function saveAnswerAction(
  mode: "submit" | "update",
  competitionId: string,
  roundId: string,
  questionId: string,
  _state: AnswerActionState,
  data: FormData,
): Promise<AnswerActionState> {
  const session = await getServerSession();
  if (!session) return { message: "Inicia sesión para continuar." };
  const actor = {
    userId: session.user.id,
    passwordChangeRequired: session.user.passwordChangeRequired,
  };
  try {
    const operation = mode === "submit" ? submitAnswer : updateAnswer;
    await operation(
      answerRepository,
      actor,
      answerInput(competitionId, roundId, questionId, data),
    );
    revalidatePath(`/app/competitions/${competitionId}/answers/${roundId}`);
    return { success: true, message: "Pronóstico guardado." };
  } catch (error) {
    const safe = toSafeError(error);
    const refresh = safe.code === "UNAUTHORIZED";
    if (refresh) revalidatePath(`/app/competitions/${competitionId}/answers/${roundId}`);
    return {
      message:
        safe.code === "INTERNAL_ERROR"
          ? "No fue posible guardar el pronóstico."
          : safe.message,
      ...(error instanceof ApplicationError && error.fieldErrors
        ? { fieldErrors: error.fieldErrors }
        : {}),
      refresh,
    };
  }
}
