import { getServerSession } from "@/infrastructure/auth/session";
import { toSafeError } from "@/lib/errors/application-error";

export type ActionState = {
  message?: string;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export async function getCompetitionActionActor() {
  const session = await getServerSession();
  return session
    ? {
        userId: session.user.id,
        passwordChangeRequired: session.user.passwordChangeRequired,
      }
    : null;
}

export function safeActionError(
  error: unknown,
  fallback = "No fue posible completar la operación.",
): ActionState {
  const safe = toSafeError(error);
  return { message: safe.code === "INTERNAL_ERROR" ? fallback : safe.message };
}
