"use server";

import { revalidatePath } from "next/cache";
import {
  correctOfficialResult,
  judgeOpenTextAnswer,
  recordOfficialResult,
} from "@/application/scoring/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { resultRepository } from "@/infrastructure/scoring/result-repository";
import { toSafeError } from "@/lib/errors/application-error";

export type ResultActionState = Readonly<{
  success?: boolean;
  message?: string;
}>;

function resultInput(
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

function refresh(competitionId: string, roundId: string) {
  revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}/results`);
  revalidatePath(`/app/competitions/${competitionId}/answers/${roundId}`);
  revalidatePath(`/app/competitions/${competitionId}/answers`);
}

export async function saveOfficialResultAction(
  mode: "record" | "correct",
  competitionId: string,
  roundId: string,
  questionId: string,
  _state: ResultActionState,
  data: FormData,
): Promise<ResultActionState> {
  const session = await getServerSession();
  if (!session) return { message: "Inicia sesión para continuar." };
  try {
    await (mode === "record" ? recordOfficialResult : correctOfficialResult)(
      resultRepository,
      {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      },
      resultInput(competitionId, roundId, questionId, data),
    );
    refresh(competitionId, roundId);
    return {
      success: true,
      message: mode === "record" ? "Resultado guardado." : "Corrección guardada.",
    };
  } catch (error) {
    const safe = toSafeError(error);
    return {
      message:
        safe.code === "INTERNAL_ERROR"
          ? "No fue posible guardar el resultado."
          : safe.message,
    };
  }
}

export async function judgeOpenTextAction(
  competitionId: string,
  roundId: string,
  answerId: string,
  isCorrect: boolean,
): Promise<ResultActionState> {
  const session = await getServerSession();
  if (!session) return { message: "Inicia sesión para continuar." };
  try {
    await judgeOpenTextAnswer(
      resultRepository,
      {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      },
      { competitionId, roundId, answerId, isCorrect },
    );
    refresh(competitionId, roundId);
    return { success: true, message: "Juicio guardado." };
  } catch (error) {
    const safe = toSafeError(error);
    return {
      message:
        safe.code === "INTERNAL_ERROR"
          ? "No fue posible guardar el juicio."
          : safe.message,
    };
  }
}
