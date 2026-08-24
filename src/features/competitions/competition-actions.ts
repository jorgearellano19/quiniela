"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCompetition,
  updateCompetition,
} from "@/application/competition/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { competitionRepository } from "@/infrastructure/competition/competition-repository";
import { toSafeError } from "@/lib/errors/application-error";

export type CompetitionFormState = {
  message?: string;
  fieldErrors?: { name?: string; type?: string; rulesNote?: string };
};
function input(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    rulesNote: String(formData.get("rulesNote") ?? ""),
  };
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
function formError(error: unknown) {
  const safe = toSafeError(error);
  return safe.code === "INTERNAL_ERROR"
    ? "No fue posible completar la operación. Inténtalo de nuevo."
    : safe.message;
}
function validate(
  value: ReturnType<typeof input>,
): CompetitionFormState | null {
  const fieldErrors: NonNullable<CompetitionFormState["fieldErrors"]> = {};
  if (!value.name.trim())
    fieldErrors.name = "Escribe un nombre para la quiniela.";
  else if (value.name.trim().length > 120)
    fieldErrors.name = "Usa 120 caracteres o menos.";
  if (!value.type) fieldErrors.type = "Selecciona un tipo de competencia.";
  if (value.rulesNote.length > 2_000)
    fieldErrors.rulesNote = "Usa 2,000 caracteres o menos.";
  return Object.keys(fieldErrors).length
    ? { message: "Revisa los campos marcados.", fieldErrors }
    : null;
}

export async function createCompetitionAction(
  _state: CompetitionFormState,
  formData: FormData,
): Promise<CompetitionFormState> {
  const currentActor = await actor();
  if (!currentActor) return { message: "Inicia sesión para continuar." };
  if (currentActor.passwordChangeRequired)
    return { message: "Cambia tu contraseña para continuar." };
  const value = input(formData);
  const invalid = validate(value);
  if (invalid) return invalid;
  let id: string;
  try {
    id = (await createCompetition(competitionRepository, currentActor, value))
      .id;
  } catch (error) {
    return { message: formError(error) };
  }
  revalidatePath("/app");
  redirect(`/app/competitions/${id}?created=1`);
}
export async function updateCompetitionAction(
  competitionId: string,
  _state: CompetitionFormState,
  formData: FormData,
): Promise<CompetitionFormState> {
  const currentActor = await actor();
  if (!currentActor) return { message: "Inicia sesión para continuar." };
  if (currentActor.passwordChangeRequired)
    return { message: "Cambia tu contraseña para continuar." };
  const value = input(formData);
  const invalid = validate(value);
  if (invalid) return invalid;
  try {
    await updateCompetition(competitionRepository, currentActor, {
      competitionId,
      ...value,
    });
  } catch (error) {
    return { message: formError(error) };
  }
  revalidatePath("/app");
  revalidatePath(`/app/competitions/${competitionId}`);
  redirect(`/app/competitions/${competitionId}?updated=1`);
}
