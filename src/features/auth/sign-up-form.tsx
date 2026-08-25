"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/infrastructure/auth/auth-client";
import { signUpSchema } from "@/lib/validation/auth";
import { AuthFormAlert } from "./auth-form-alert";
import { initialAuthActionState, type AuthField } from "./auth-state";

const fieldCopy: ReadonlyArray<
  Readonly<{
    field: AuthField;
    label: string;
    autoComplete: string;
    type: "text" | "email" | "password";
    placeholder?: string;
  }>
> = [
  {
    field: "name",
    label: "Nombre",
    autoComplete: "name",
    type: "text",
    placeholder: "Tu nombre",
  },
  {
    field: "email",
    label: "Correo electrónico",
    autoComplete: "email",
    type: "email",
    placeholder: "tu@correo.com",
  },
  {
    field: "password",
    label: "Contraseña",
    autoComplete: "new-password",
    type: "password",
  },
  {
    field: "confirmPassword",
    label: "Confirmar contraseña",
    autoComplete: "new-password",
    type: "password",
  },
];

export function SignUpForm({ returnTo = "/app" }: { returnTo?: string }) {
  const router = useRouter();
  const [state, setState] = useState(initialAuthActionState);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const parsed = signUpSchema.safeParse(Object.fromEntries(data));
        if (!parsed.success) {
          setState({
            status: "error",
            message: "Revisa los campos marcados.",
            fieldErrors: parsed.error.flatten().fieldErrors,
          });
          return;
        }
        setPending(true);
        const signUp = await authClient.signUp.email({
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
        });
        const signIn = signUp.error
          ? signUp
          : await authClient.signIn.email({
              email: parsed.data.email,
              password: parsed.data.password,
              rememberMe: true,
            });
        if (signIn.error) {
          setState({
            status: "error",
            message:
              signIn.error.status === 429
                ? "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo."
                : "No fue posible crear la cuenta con esos datos.",
          });
          setPending(false);
          return;
        }
        router.push(returnTo);
        router.refresh();
      }}
    >
      <AuthFormAlert state={state} />
      <FieldGroup>
        {fieldCopy.map(({ autoComplete, field, label, placeholder, type }) => {
          const errors = state.fieldErrors?.[field];
          const inputId = `sign-up-${field}`;
          const errorId = `${inputId}-error`;

          return (
            <Field data-invalid={Boolean(errors?.length)} key={field}>
              <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
              <Input
                aria-describedby={errors?.length ? errorId : undefined}
                aria-invalid={Boolean(errors?.length)}
                autoComplete={autoComplete}
                id={inputId}
                inputMode={type === "email" ? "email" : undefined}
                maxLength={field === "name" ? 80 : field === "email" ? 320 : 128}
                minLength={field === "name" ? 2 : type === "password" ? 8 : undefined}
                name={field}
                placeholder={placeholder}
                required
                type={type}
              />
              <FieldError id={errorId} errors={toErrors(errors)} />
            </Field>
          );
        })}
      </FieldGroup>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Usa entre 8 y 128 caracteres para tu contraseña.
      </p>
      <Button disabled={pending} type="submit">
        {pending ? "Creando cuenta…" : "Crear mi cuenta"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          href={`/sign-in${returnTo !== "/app" ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

function toErrors(messages: readonly string[] | undefined) {
  return messages?.map((message) => ({ message })) ?? [];
}
