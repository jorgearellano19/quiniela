"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  configurePlayoffRound,
  createPlayoffQuestion,
  generatePlayoffBracket,
  publishPlayoffRound,
  removePlayoffQuestion,
  resolvePlayoffMatchup,
  resolvePlayoffTie,
  updatePlayoffQuestion,
} from "@/application/playoff/use-cases";
import { reorderQuestions } from "@/application/round/use-cases";
import { h2hRepository } from "@/infrastructure/h2h/h2h-repository";
import { playoffRepository } from "@/infrastructure/playoff/playoff-repository";
import { playoffResultRepository } from "@/infrastructure/scoring/result-repository";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";
import type { RoundActionState } from "@/features/rounds/round-actions";
import { questionInput, validateQuestionInput } from "@/features/rounds/question-input";
import {
  getCompetitionActionActor as actor,
  safeActionError as error,
} from "@/features/shared/action";
import { toSafeError } from "@/lib/errors/application-error";

export async function configurePlayoffRoundAction(
  competitionId: string,
  playoffRoundId: string | null,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  try {
    const id = await configurePlayoffRound(playoffRepository, await actor(), {
      competitionId,
      playoffRoundId: playoffRoundId ?? undefined,
      sequence: data.get("sequence"),
      name: data.get("name"),
      startsAt: data.get("startsAt"),
      unansweredPenalty: data.get("unansweredPenalty"),
      advancementMode: data.get("advancementMode"),
      tiebreakerQuestionId: data.get("tiebreakerQuestionId") || null,
    });
    revalidatePath(`/app/competitions/${competitionId}/playoffs`);
    if (!playoffRoundId) redirect(`/app/competitions/${competitionId}/playoffs/${id}`);
    return { success: true, message: "Ronda de playoffs guardada." };
  } catch (cause) {
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    return error(cause);
  }
}

export async function generatePlayoffBracketAction(
  competitionId: string,
  playoffRoundId: string,
  data: FormData,
) {
  try {
    await generatePlayoffBracket(
      playoffRepository,
      h2hRepository,
      standingsRepository,
      await actor(),
      {
        competitionId,
        playoffRoundId,
        seedOrder: data.getAll("seedOrder").map(String).filter(Boolean),
      },
    );
    revalidatePath(`/app/competitions/${competitionId}/playoffs`);
  } catch (cause) {
    throw new Error(toSafeError(cause).message);
  }
}

export async function publishPlayoffRoundAction(
  competitionId: string,
  playoffRoundId: string,
) {
  await publishPlayoffRound(
    playoffRepository,
    await actor(),
    competitionId,
    playoffRoundId,
  );
  revalidatePath(`/app/competitions/${competitionId}/playoffs`);
}

export async function advancePlayoffRoundAction(
  competitionId: string,
  playoffRoundId: string,
) {
  await resolvePlayoffMatchup(
    playoffRepository,
    playoffResultRepository,
    await actor(),
    competitionId,
    playoffRoundId,
  );
  revalidatePath(`/app/competitions/${competitionId}/playoffs`);
}

export async function resolvePlayoffTieAction(
  competitionId: string,
  playoffRoundId: string,
  matchupId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  try {
    await resolvePlayoffTie(playoffRepository, playoffResultRepository, await actor(), {
      competitionId,
      playoffRoundId,
      matchupId,
      participantId: data.get("participantId"),
    });
    revalidatePath(`/app/competitions/${competitionId}/playoffs`);
    revalidatePath(
      `/app/competitions/${competitionId}/playoffs/${playoffRoundId}/results`,
    );
    return { success: true, message: "Decisión manual guardada." };
  } catch (cause) {
    return error(cause);
  }
}

export async function createPlayoffQuestionAction(
  competitionId: string,
  roundId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  const input = questionInput(competitionId, roundId, data);
  const validation = validateQuestionInput(input);
  if (validation) return validation;
  try {
    await createPlayoffQuestion(playoffRepository, await actor(), input);
    revalidatePath(`/app/competitions/${competitionId}/playoffs/${roundId}`);
    return { success: true, message: "Pregunta agregada." };
  } catch (cause) {
    return error(cause);
  }
}

export async function updatePlayoffQuestionAction(
  competitionId: string,
  roundId: string,
  questionId: string,
  _state: RoundActionState,
  data: FormData,
): Promise<RoundActionState> {
  const input = questionInput(competitionId, roundId, data);
  const validation = validateQuestionInput(input);
  if (validation) return validation;
  try {
    await updatePlayoffQuestion(playoffRepository, await actor(), questionId, input);
    revalidatePath(`/app/competitions/${competitionId}/playoffs/${roundId}`);
    return { success: true, message: "Pregunta actualizada." };
  } catch (cause) {
    return error(cause);
  }
}

export async function removePlayoffQuestionAction(
  competitionId: string,
  roundId: string,
  questionId: string,
): Promise<RoundActionState> {
  try {
    await removePlayoffQuestion(
      playoffRepository,
      await actor(),
      competitionId,
      roundId,
      questionId,
    );
    revalidatePath(`/app/competitions/${competitionId}/playoffs/${roundId}`);
    return { success: true, message: "Pregunta eliminada." };
  } catch (cause) {
    return error(cause);
  }
}

export async function reorderPlayoffQuestionsAction(
  competitionId: string,
  roundId: string,
  ids: string[],
): Promise<RoundActionState> {
  try {
    await reorderQuestions(
      playoffRepository.roundRepository,
      await actor(),
      competitionId,
      roundId,
      ids,
    );
    revalidatePath(`/app/competitions/${competitionId}/playoffs/${roundId}`);
    return { success: true, message: "Orden guardado." };
  } catch (cause) {
    return error(cause);
  }
}
