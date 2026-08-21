import { ApplicationError } from "@/lib/errors/application-error";
import { z } from "zod";

export type SecurityActor = Readonly<{ userId: string; role?: string | null }>;
export type VerificationMethod = "WHATSAPP" | "IN_PERSON" | "OTHER";

export type SecurityUser = Readonly<{
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  passwordChangeRequired: boolean;
  temporaryPasswordExpiresAt: Date | null;
  activeSessionCount: number;
  events: ReadonlyArray<
    Readonly<{
      action: string;
      reason: string | null;
      verificationMethod: string | null;
      createdAt: Date;
    }>
  >;
}>;

export interface AuthSecurityRepository {
  findByEmail(email: string): Promise<SecurityUser | null>;
  suspend(actorId: string, targetId: string, reason: string): Promise<void>;
  restore(actorId: string, targetId: string, reason: string): Promise<void>;
  revokeSessions(
    actorId: string,
    targetId: string,
    reason: string,
  ): Promise<void>;
  issueTemporaryPassword(input: {
    actorId: string;
    targetId: string;
    reason: string;
    verificationMethod: VerificationMethod;
  }): Promise<{ temporaryPassword: string; expiresAt: Date }>;
}

function authorize(actor: SecurityActor) {
  if (!actor.role?.split(",").includes("platform_operator")) {
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No tienes permiso para esta operación.",
    );
  }
}

function text(value: string, label: string, maxLength = 500) {
  const normalized = value.trim();
  if (!normalized) {
    throw new ApplicationError("INVALID_INPUT", `${label} es obligatorio.`);
  }
  if (normalized.length > maxLength) {
    throw new ApplicationError("INVALID_INPUT", `${label} es demasiado largo.`);
  }
  return normalized;
}

function normalizeTargetId(value: string) {
  return text(value, "La cuenta", 128);
}

export async function findSecurityUser(
  repository: AuthSecurityRepository,
  actor: SecurityActor,
  email: string,
) {
  authorize(actor);
  const parsed = z
    .email()
    .safeParse(text(email, "El correo", 320).toLowerCase());
  if (!parsed.success) {
    throw new ApplicationError("INVALID_INPUT", "El correo no es válido.");
  }
  return repository.findByEmail(parsed.data);
}

export async function suspendSecurityUser(
  repository: AuthSecurityRepository,
  actor: SecurityActor,
  targetId: string,
  reason: string,
) {
  authorize(actor);
  await repository.suspend(
    actor.userId,
    normalizeTargetId(targetId),
    text(reason, "El motivo"),
  );
}

export async function restoreSecurityUser(
  repository: AuthSecurityRepository,
  actor: SecurityActor,
  targetId: string,
  reason: string,
) {
  authorize(actor);
  await repository.restore(
    actor.userId,
    normalizeTargetId(targetId),
    text(reason, "El motivo"),
  );
}

export async function revokeSecurityUserSessions(
  repository: AuthSecurityRepository,
  actor: SecurityActor,
  targetId: string,
  reason: string,
) {
  authorize(actor);
  await repository.revokeSessions(
    actor.userId,
    normalizeTargetId(targetId),
    text(reason, "El motivo"),
  );
}

export async function issueTemporaryPassword(
  repository: AuthSecurityRepository,
  actor: SecurityActor,
  input: {
    targetId: string;
    reason: string;
    verificationMethod: VerificationMethod;
  },
) {
  authorize(actor);
  if (
    !(["WHATSAPP", "IN_PERSON", "OTHER"] as const).includes(
      input.verificationMethod,
    )
  ) {
    throw new ApplicationError(
      "INVALID_INPUT",
      "El método de verificación no es válido.",
    );
  }
  return repository.issueTemporaryPassword({
    actorId: actor.userId,
    targetId: normalizeTargetId(input.targetId),
    reason: text(input.reason, "La nota de verificación"),
    verificationMethod: input.verificationMethod,
  });
}
