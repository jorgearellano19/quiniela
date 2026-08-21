"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
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
      className="flex max-w-md flex-col gap-4"
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
        <p>Debes reemplazar la contraseña temporal antes de continuar.</p>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      <Input
        autoComplete="current-password"
        name="currentPassword"
        placeholder="Contraseña actual"
        required
        type="password"
      />
      <Input
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        name="newPassword"
        placeholder="Nueva contraseña"
        required
        type="password"
      />
      <Input
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        name="confirmation"
        placeholder="Confirmar contraseña"
        required
        type="password"
      />
      <Button disabled={pending}>
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
