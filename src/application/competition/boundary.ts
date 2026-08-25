import { z } from "zod";
import { ApplicationError } from "@/lib/errors/application-error";

export type CompetitionActor = Readonly<{
  userId: string;
  passwordChangeRequired?: boolean;
}> | null;

export function requireCompetitionActor(value: CompetitionActor) {
  if (!value) {
    throw new ApplicationError("UNAUTHENTICATED", "Inicia sesión para continuar.");
  }
  if (value.passwordChangeRequired) {
    throw new ApplicationError("UNAUTHORIZED", "Cambia tu contraseña para continuar.");
  }
  return value;
}

export function requireCompetitionId(value: string) {
  if (!z.uuid().safeParse(value).success) {
    throw new ApplicationError("UNAUTHORIZED", "No fue posible completar la operación.");
  }
  return value;
}
