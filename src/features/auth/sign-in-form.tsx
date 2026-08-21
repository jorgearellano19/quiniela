"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/infrastructure/auth/auth-client";
import { signInSchema } from "@/lib/validation/auth";
import { AuthFormAlert } from "./auth-form-alert";
import { initialAuthActionState } from "./auth-state";

export function SignInForm() {
  const router = useRouter();
  const [state, setState] = useState(initialAuthActionState);
  const [pending, setPending] = useState(false);
  const emailErrors = state.fieldErrors?.email;
  const passwordErrors = state.fieldErrors?.password;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const parsed = signInSchema.safeParse({
          email: data.get("email"),
          password: data.get("password"),
        });
        if (!parsed.success) {
          setState({
            status: "error",
            message: "Revisa los campos marcados.",
            fieldErrors: parsed.error.flatten().fieldErrors,
          });
          return;
        }
        setPending(true);
        const result = await authClient.signIn.email({
          ...parsed.data,
          rememberMe: true,
        });
        if (result.error) {
          setState({
            status: "error",
            message:
              result.error.status === 429
                ? "Demasiados intentos. Espera un momento e inténtalo de nuevo."
                : "El correo o la contraseña no son correctos.",
          });
          setPending(false);
          return;
        }
        router.push("/app");
        router.refresh();
      }}
    >
      <AuthFormAlert state={state} />
      <FieldGroup>
        <Field data-invalid={Boolean(emailErrors?.length)}>
          <FieldLabel htmlFor="sign-in-email">Correo electrónico</FieldLabel>
          <Input
            aria-describedby={
              emailErrors?.length ? "sign-in-email-error" : undefined
            }
            aria-invalid={Boolean(emailErrors?.length)}
            autoComplete="email"
            id="sign-in-email"
            inputMode="email"
            name="email"
            placeholder="tu@correo.com"
            required
            type="email"
          />
          <FieldError id="sign-in-email-error" errors={toErrors(emailErrors)} />
        </Field>
        <Field data-invalid={Boolean(passwordErrors?.length)}>
          <FieldLabel htmlFor="sign-in-password">Contraseña</FieldLabel>
          <Input
            aria-describedby={
              passwordErrors?.length ? "sign-in-password-error" : undefined
            }
            aria-invalid={Boolean(passwordErrors?.length)}
            autoComplete="current-password"
            id="sign-in-password"
            maxLength={128}
            minLength={8}
            name="password"
            required
            type="password"
          />
          <FieldError
            id="sign-in-password-error"
            errors={toErrors(passwordErrors)}
          />
        </Field>
      </FieldGroup>
      <Button disabled={pending} type="submit">
        {pending ? "Iniciando sesión…" : "Entrar a mi quiniela"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Aún no tienes cuenta?{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          href="/sign-up"
        >
          Créala aquí
        </Link>
      </p>
    </form>
  );
}

function toErrors(messages: readonly string[] | undefined) {
  return messages?.map((message) => ({ message })) ?? [];
}
