import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AuthActionState } from "./auth-state";

export function AuthFormAlert({ state }: Readonly<{ state: AuthActionState }>) {
  if (state.status !== "error" || !state.message) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>No se completó la solicitud</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
