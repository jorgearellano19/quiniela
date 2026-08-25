"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signOutAction } from "./auth-actions";
import { initialAuthActionState } from "./auth-state";

export function SignOutForm() {
  const [state, formAction] = useActionState(signOutAction, initialAuthActionState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <SignOutButton />
      {state.status === "error" && state.message ? (
        <Alert className="max-w-sm" variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant="outline">
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Cerrando" : "Cerrar sesión"}
    </Button>
  );
}
