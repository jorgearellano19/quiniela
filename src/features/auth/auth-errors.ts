import type { AuthActionState } from "./auth-state";

type AuthFlow = "sign-out";

const safeMessages: Record<AuthFlow, string> = {
  "sign-out": "No pudimos cerrar tu sesión. Inténtalo de nuevo.",
};

export function toAuthActionError(
  flow: AuthFlow,
  internalError: unknown,
): AuthActionState {
  void internalError;
  return { status: "error", message: safeMessages[flow] };
}
