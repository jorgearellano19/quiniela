"use server";
import { revalidatePath } from "next/cache";
import {
  correctOfficialResult,
  judgeOpenTextAnswer,
  recordOfficialResult,
} from "@/application/scoring/use-cases";
import type { ResultActionState } from "@/features/results/result-actions";
import { getServerSession } from "@/infrastructure/auth/session";
import { playoffResultRepository } from "@/infrastructure/scoring/result-repository";
import { toSafeError } from "@/lib/errors/application-error";

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

async function actor() {
  const session = await getServerSession();
  return session
    ? {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      }
    : null;
}
function refresh(competitionId: string, roundId: string) {
  revalidatePath(`/app/competitions/${competitionId}/playoffs/${roundId}/results`);
  revalidatePath(`/app/competitions/${competitionId}/playoffs/${roundId}/answers`);
  revalidatePath(`/app/competitions/${competitionId}/playoffs`);
}
export async function savePlayoffOfficialResultAction(
  mode: "record" | "correct",
  competitionId: string,
  roundId: string,
  questionId: string,
  _state: ResultActionState,
  data: FormData,
): Promise<ResultActionState> {
  try {
    await (mode === "record" ? recordOfficialResult : correctOfficialResult)(
      playoffResultRepository,
      await actor(),
      resultInput(competitionId, roundId, questionId, data),
    );
    refresh(competitionId, roundId);
    return {
      success: true,
      message: mode === "record" ? "Resultado guardado." : "Corrección guardada.",
    };
  } catch (cause) {
    const safe = toSafeError(cause);
    return {
      message:
        safe.code === "INTERNAL_ERROR"
          ? "No fue posible guardar el resultado."
          : safe.message,
    };
  }
}
export async function judgePlayoffOpenTextAction(
  competitionId: string,
  roundId: string,
  answerId: string,
  isCorrect: boolean,
): Promise<ResultActionState> {
  try {
    await judgeOpenTextAnswer(playoffResultRepository, await actor(), {
      competitionId,
      roundId,
      answerId,
      isCorrect,
    });
    refresh(competitionId, roundId);
    return { success: true, message: "Juicio guardado." };
  } catch (cause) {
    const safe = toSafeError(cause);
    return {
      message:
        safe.code === "INTERNAL_ERROR"
          ? "No fue posible guardar el juicio."
          : safe.message,
    };
  }
}
