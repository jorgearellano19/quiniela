"use server";

import type {
  SecurityUser,
  VerificationMethod,
} from "@/application/auth-security/use-cases";
import {
  findSecurityUser,
  issueTemporaryPassword,
  restoreSecurityUser,
  revokeSecurityUserSessions,
  suspendSecurityUser,
} from "@/application/auth-security/use-cases";
import { getServerSession } from "@/infrastructure/auth/session";
import { authSecurityRepository } from "@/infrastructure/auth/security-repository";
import { toSafeError } from "@/lib/errors/application-error";

export type OperatorState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  user?: SecurityUser;
  temporaryPassword?: string;
  temporaryPasswordExpiresAt?: string;
}>;

export const initialOperatorState: OperatorState = { status: "idle" };

async function actor() {
  const current = await getServerSession();
  if (!current) return { userId: "", role: null };
  return { userId: current.user.id, role: current.user.role ?? null };
}

function value(data: FormData, key: string) {
  const candidate = data.get(key);
  return typeof candidate === "string" ? candidate : "";
}

async function safe(operation: () => Promise<OperatorState>) {
  try {
    return await operation();
  } catch (error) {
    return { status: "error" as const, message: toSafeError(error).message };
  }
}

export async function findUserAction(_state: OperatorState, data: FormData) {
  return safe(async () => {
    const found = await findSecurityUser(
      authSecurityRepository,
      await actor(),
      value(data, "email"),
    );
    return found
      ? { status: "success", user: found }
      : {
          status: "error",
          message: "No se encontró una cuenta con ese correo.",
        };
  });
}

export async function operatorMutationAction(
  _state: OperatorState,
  data: FormData,
) {
  return safe(async () => {
    const currentActor = await actor();
    const targetId = value(data, "targetId");
    const reason = value(data, "reason");
    const operation = value(data, "operation");
    if (operation === "suspend") {
      await suspendSecurityUser(
        authSecurityRepository,
        currentActor,
        targetId,
        reason,
      );
    } else if (operation === "restore") {
      await restoreSecurityUser(
        authSecurityRepository,
        currentActor,
        targetId,
        reason,
      );
    } else if (operation === "revoke-sessions") {
      await revokeSecurityUserSessions(
        authSecurityRepository,
        currentActor,
        targetId,
        reason,
      );
    } else if (operation === "temporary-password") {
      const issued = await issueTemporaryPassword(
        authSecurityRepository,
        currentActor,
        {
          targetId,
          reason,
          verificationMethod: value(
            data,
            "verificationMethod",
          ) as VerificationMethod,
        },
      );
      return {
        status: "success",
        message:
          "Contraseña temporal emitida. Solo se mostrará en esta respuesta.",
        temporaryPassword: issued.temporaryPassword,
        temporaryPasswordExpiresAt: issued.expiresAt.toISOString(),
      };
    } else {
      return { status: "error", message: "Operación inválida." };
    }
    return { status: "success", message: "Operación completada." };
  });
}
