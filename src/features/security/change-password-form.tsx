"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/infrastructure/auth/auth-client";

export function ChangePasswordForm({
  required = false,
}: {
  required?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const currentPassword = String(data.get("currentPassword") ?? "");
        const newPassword = String(data.get("newPassword") ?? "");
        const confirmation = String(data.get("confirmation") ?? "");
        if (
          newPassword.length < 8 ||
          newPassword.length > 128 ||
          newPassword !== confirmation
        ) {
          setMessage(
            "La contraseña debe tener entre 8 y 128 caracteres y coincidir.",
          );
          return;
        }
        setPending(true);
        const result = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        });
        if (result.error) {
          setMessage(
            result.error.status === 429
              ? "Demasiados intentos. Inténtalo más tarde."
              : "No fue posible cambiar la contraseña.",
          );
          setPending(false);
          return;
        }
        router.push("/app");
        router.refresh();
      }}
    >
      {required ? (
        <Alert>
          <AlertTitle>Cambio obligatorio</AlertTitle>
          <AlertDescription>
            Reemplaza la contraseña temporal antes de continuar.
          </AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert variant="destructive">
          <AlertTitle>No se cambió la contraseña</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="current-password">Contraseña actual</FieldLabel>
          <Input
            autoComplete="current-password"
            id="current-password"
            name="currentPassword"
            required
            type="password"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-password">Nueva contraseña</FieldLabel>
          <Input
            autoComplete="new-password"
            id="new-password"
            minLength={8}
            maxLength={128}
            name="newPassword"
            required
            type="password"
          />
          <FieldDescription>Usa entre 8 y 128 caracteres.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="password-confirmation">
            Confirmar nueva contraseña
          </FieldLabel>
          <Input
            autoComplete="new-password"
            id="password-confirmation"
            minLength={8}
            maxLength={128}
            name="confirmation"
            required
            type="password"
          />
        </Field>
      </FieldGroup>
      <Button disabled={pending} type="submit">
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
