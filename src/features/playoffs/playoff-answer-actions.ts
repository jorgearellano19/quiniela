"use server";
import { revalidatePath } from "next/cache";
import { submitAnswer, updateAnswer } from "@/application/answer/use-cases";
import type { AnswerActionState } from "@/features/answers/answer-actions";
import { getServerSession } from "@/infrastructure/auth/session";
import { playoffAnswerRepository } from "@/infrastructure/playoff/playoff-answer-repository";
import { ApplicationError, toSafeError } from "@/lib/errors/application-error";

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

export async function savePlayoffAnswerAction(
  mode: "submit" | "update",
  competitionId: string,
  roundId: string,
  questionId: string,
  _state: AnswerActionState,
  data: FormData,
): Promise<AnswerActionState> {
  const session = await getServerSession();
  if (!session) return { message: "Inicia sesión para continuar." };
  try {
    await (mode === "submit" ? submitAnswer : updateAnswer)(
      playoffAnswerRepository,
      {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      },
      answerInput(competitionId, roundId, questionId, data),
    );
    revalidatePath(`/app/competitions/${competitionId}/playoffs/${roundId}/answers`);
    return { success: true, message: "Pronóstico guardado." };
  } catch (cause) {
    const safe = toSafeError(cause);
    return {
      message:
        safe.code === "INTERNAL_ERROR"
          ? "No fue posible guardar el pronóstico."
          : safe.message,
      ...(cause instanceof ApplicationError && cause.fieldErrors
        ? { fieldErrors: cause.fieldErrors }
        : {}),
      refresh: safe.code === "UNAUTHORIZED",
    };
  }
}
