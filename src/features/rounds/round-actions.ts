"use server";
import { revalidatePath } from "next/cache";
import {
  createQuestion,
  createRound,
  deleteRound,
  publishRound,
  reorderQuestions,
  reorderRounds,
  removeQuestion,
  updateQuestion,
  updateCompetitionScoringDefaults,
  updateRound,
} from "@/application/round/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { roundRepository } from "@/infrastructure/round/round-repository";
import { toSafeError } from "@/lib/errors/application-error";
export type RoundActionState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};
async function actor() {
  const session = await getServerSession();
  return session
    ? {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      }
    : null;
}
function errorState(error: unknown): RoundActionState {
  const safe = toSafeError(error);
  return {
    message:
      safe.code === "INTERNAL_ERROR"
        ? "No fue posible completar la operación."
        : safe.message,
  };
}
function questionInput(competitionId: string, roundId: string, data: FormData) {
  const type = String(data.get("type"));
  const common = {
    competitionId,
    roundId,
    type,
    sequence: data.get("sequence"),
    prompt: data.get("prompt"),
    deadlineMode: data.get("deadlineMode"),
    deadlineAt: data.get("deadlineMode") === "CUSTOM" ? data.get("deadlineAt") : null,
    usesDefaultScoring: data.get("usesDefaultScoring") === "on",
  };
  let typed: Record<string, unknown> = { points: data.get("points") };
  if (type === "MATCH_SCORE")
    typed = {
      homeLabel: data.get("homeLabel"),
      awayLabel: data.get("awayLabel"),
      exactScorePoints: data.get("exactScorePoints"),
      goalDifferencePoints: data.get("goalDifferenceEnabled")
        ? data.get("goalDifferencePoints")
        : null,
      normalResultPoints: data.get("normalResultPoints"),
    };
  else if (type === "CLOSEST_VALUE")
    typed.againstRival = data.get("againstRival") === "on";
  else if (type === "OPTIONS")
    typed.options = String(data.get("options") ?? "")
      .split("\n")
      .map((label) => ({ label }));
  return { ...common, ...typed } as typeof common & Record<string, unknown>;
}
function validateQuestionInput(
  value: ReturnType<typeof questionInput>,
): RoundActionState | null {
  const fieldErrors: Record<string, string> = {};
  const sequence = Number(value.sequence);
  if (!Number.isInteger(sequence) || sequence < 1)
    fieldErrors.sequence = "Usa un orden entero mayor que cero.";
  if (value.type !== "MATCH_SCORE" && !String(value.prompt ?? "").trim())
    fieldErrors.prompt = "Escribe la pregunta.";
  const deadline = value.deadlineAt ? new Date(String(value.deadlineAt)) : null;
  if (value.deadlineMode === "CUSTOM" && (!deadline || Number.isNaN(deadline.valueOf())))
    fieldErrors.deadlineAt = "Selecciona una fecha y hora de cierre.";
  if (value.type === "MATCH_SCORE") {
    const home = String(value.homeLabel ?? "").trim();
    const away = String(value.awayLabel ?? "").trim();
    if (!home) fieldErrors.homeLabel = "Escribe el equipo local.";
    if (!away) fieldErrors.awayLabel = "Escribe el equipo visitante.";
    if (home && away && home.toLocaleLowerCase() === away.toLocaleLowerCase())
      fieldErrors.awayLabel = "Local y visitante deben ser distintos.";
    const exact = Number(value.exactScorePoints);
    const normal = Number(value.normalResultPoints);
    const difference =
      value.goalDifferencePoints === null ? null : Number(value.goalDifferencePoints);
    if (
      !value.usesDefaultScoring &&
      (!Number.isInteger(exact) ||
        !Number.isInteger(normal) ||
        exact < 1 ||
        exact > 100 ||
        normal < 1 ||
        normal > 100 ||
        !(exact > (difference ?? normal)) ||
        (difference !== null &&
          (!Number.isInteger(difference) ||
            difference < 1 ||
            difference > 100 ||
            difference <= normal)))
    )
      fieldErrors.scoring =
        "Usa enteros de 1 a 100 y conserva Marcador exacto > Diferencia > Resultado.";
  } else {
    const points = Number(value.points);
    if (
      !value.usesDefaultScoring &&
      (!Number.isInteger(points) || points < 1 || points > 100)
    )
      fieldErrors.points = "Usa un entero de 1 a 100.";
  }
  if (value.type === "OPTIONS") {
    const labels = (value.options as Array<{ label: string }>).map(({ label }) =>
      label.trim().toLocaleLowerCase(),
    );
    if (
      labels.length < 2 ||
      labels.length > 20 ||
      labels.some((label) => !label) ||
      new Set(labels).size !== labels.length
    )
      fieldErrors.options = "Agrega de 2 a 20 opciones únicas, una por línea.";
  }
  return Object.keys(fieldErrors).length
    ? { message: "Revisa los campos marcados.", fieldErrors }
    : null;
}
export async function createRoundAction(
  competitionId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await createRound(roundRepository, current, {
      competitionId,
      sequence: data.get("sequence"),
      name: data.get("name"),
      startsAt: data.get("startsAt"),
      unansweredPenalty: data.get("unansweredPenalty"),
    });
    revalidatePath(`/app/competitions/${competitionId}/rounds`);
    return { success: true, message: "Jornada creada." };
  } catch (e) {
    return errorState(e);
  }
}
export async function updateRoundAction(
  competitionId: string,
  roundId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await updateRound(roundRepository, current, {
      competitionId,
      roundId,
      sequence: data.get("sequence"),
      name: data.get("name"),
      startsAt: data.get("startsAt"),
      unansweredPenalty: data.get("unansweredPenalty"),
    });
    revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}`);
    return { success: true, message: "Configuración guardada." };
  } catch (e) {
    return errorState(e);
  }
}
export async function updateScoringDefaultsAction(
  competitionId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await updateCompetitionScoringDefaults(roundRepository, current, competitionId, {
      matchScore: {
        exactScorePoints: data.get("exactScorePoints"),
        goalDifferencePoints: data.get("goalDifferenceEnabled")
          ? data.get("goalDifferencePoints")
          : null,
        normalResultPoints: data.get("normalResultPoints"),
      },
      closestValuePoints: data.get("closestValuePoints"),
      optionsPoints: data.get("optionsPoints"),
      openTextPoints: data.get("openTextPoints"),
      exactValuePoints: data.get("exactValuePoints"),
    });
    revalidatePath(`/app/competitions/${competitionId}/rounds`);
    return { success: true, message: "Puntajes predeterminados guardados." };
  } catch (error) {
    return errorState(error);
  }
}
export async function createQuestionAction(
  competitionId: string,
  roundId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  const value = questionInput(competitionId, roundId, data);
  const invalid = validateQuestionInput(value);
  if (invalid) return invalid;
  try {
    await createQuestion(roundRepository, current, value);
    revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}`);
    return { success: true, message: "Pregunta agregada." };
  } catch (e) {
    return errorState(e);
  }
}
export async function updateQuestionAction(
  competitionId: string,
  roundId: string,
  questionId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  const value = questionInput(competitionId, roundId, data);
  const invalid = validateQuestionInput(value);
  if (invalid) return invalid;
  try {
    await updateQuestion(roundRepository, current, questionId, value);
    revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}`);
    return { success: true, message: "Pregunta guardada." };
  } catch (error) {
    return errorState(error);
  }
}
export async function removeQuestionAction(
  competitionId: string,
  roundId: string,
  questionId: string,
): Promise<RoundActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await removeQuestion(roundRepository, current, competitionId, roundId, questionId);
    revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}`);
    return { success: true, message: "Pregunta eliminada." };
  } catch (error) {
    return errorState(error);
  }
}
export async function publishRoundAction(
  competitionId: string,
  roundId: string,
): Promise<RoundActionState> {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await publishRound(roundRepository, current, competitionId, roundId);
    revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}`);
    return { success: true, message: "Jornada publicada." };
  } catch (error) {
    return errorState(error);
  }
}
export async function reorderRoundsAction(competitionId: string, ids: string[]) {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await reorderRounds(roundRepository, current, competitionId, ids);
    revalidatePath(`/app/competitions/${competitionId}/rounds`);
    return { success: true };
  } catch (error) {
    return errorState(error);
  }
}
export async function reorderQuestionsAction(
  competitionId: string,
  roundId: string,
  ids: string[],
) {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await reorderQuestions(roundRepository, current, competitionId, roundId, ids);
    revalidatePath(`/app/competitions/${competitionId}/rounds/${roundId}`);
    return { success: true };
  } catch (error) {
    return errorState(error);
  }
}
export async function deleteRoundAction(competitionId: string, roundId: string) {
  const current = await actor();
  if (!current) return { message: "Inicia sesión para continuar." };
  try {
    await deleteRound(roundRepository, current, competitionId, roundId);
    revalidatePath(`/app/competitions/${competitionId}/rounds`);
    return { success: true };
  } catch (error) {
    return errorState(error);
  }
}
