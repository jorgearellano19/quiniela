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
import { roundRepository } from "@/infrastructure/round/round-repository";
import {
  getCompetitionActionActor as actor,
  safeActionError as errorState,
  type ActionState as RoundActionState,
} from "@/features/shared/action";
import { questionInput, validateQuestionInput } from "./question-input";
export type { ActionState as RoundActionState } from "@/features/shared/action";
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
