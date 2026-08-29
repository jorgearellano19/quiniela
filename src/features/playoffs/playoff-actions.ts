"use server";

import { createHash } from "node:crypto";
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
import { getH2HStandings } from "@/application/h2h/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { h2hRepository } from "@/infrastructure/h2h/h2h-repository";
import { playoffRepository } from "@/infrastructure/playoff/playoff-repository";
import { playoffResultRepository } from "@/infrastructure/scoring/result-repository";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";
import { toSafeError } from "@/lib/errors/application-error";
import type { RoundActionState } from "@/features/rounds/round-actions";
import {
  playoffQuestionInput,
  validatePlayoffQuestionInput,
} from "./playoff-question-input";

async function actor() {
  const session = await getServerSession();
  return session
    ? {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      }
    : null;
}

function error(error: unknown): RoundActionState {
  const safe = toSafeError(error);
  return {
    message:
      safe.code === "INTERNAL_ERROR"
        ? "No fue posible completar la operación."
        : safe.message,
  };
}

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
  const current = await actor();
  try {
    const tables = await getH2HStandings(
      { competitionId },
      current,
      h2hRepository,
      standingsRepository,
    );
    const qualifiers = tables.flatMap((table) =>
      table.rows.filter((row) => row.qualification === "OFICIAL"),
    );
    const readiness =
      tables.length > 0 && tables.every((table) => table.readiness === "OFFICIAL")
        ? ("OFFICIAL" as const)
        : ("PROVISIONAL" as const);
    const natural = [...qualifiers].sort(
      (left, right) =>
        right.predictionScore - left.predictionScore ||
        right.exactScorePoints - left.exactScorePoints,
    );
    const submitted = data.getAll("seedOrder").map(String).filter(Boolean);
    const ordered = submitted.length
      ? submitted
          .map((id) => natural.find((row) => row.participantId === id)!)
          .filter(Boolean)
      : natural;
    if (
      ordered.length !== natural.length ||
      new Set(ordered.map((row) => row.participantId)).size !== natural.length
    )
      throw new Error("INVALID_SEED_ORDER");
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const item = ordered[index]!;
      if (
        previous.predictionScore < item.predictionScore ||
        (previous.predictionScore === item.predictionScore &&
          previous.exactScorePoints < item.exactScorePoints)
      )
        throw new Error("INVALID_SEED_ORDER");
    }
    await generatePlayoffBracket(playoffRepository, current, {
      competitionId,
      playoffRoundId,
      readiness,
      orderedParticipantIds: ordered.map((row) => row.participantId),
      sourceFingerprint: createHash("sha256")
        .update(JSON.stringify(tables.map((table) => table.sourceFingerprint).sort()))
        .digest("hex"),
    });
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
  const input = playoffQuestionInput(competitionId, roundId, data);
  const validation = validatePlayoffQuestionInput(input);
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
  const input = playoffQuestionInput(competitionId, roundId, data);
  const validation = validatePlayoffQuestionInput(input);
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
      playoffRepository.roundRepository as never,
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
