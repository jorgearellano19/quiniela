"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { findUserAction, operatorMutationAction } from "./operator-actions";
import { initialOperatorState } from "./operator-state";

export function OperatorConsole() {
  const [search, searchAction, searching] = useActionState(
    findUserAction,
    initialOperatorState,
  );
  const [mutation, mutationAction, mutating] = useActionState(
    operatorMutationAction,
    initialOperatorState,
  );
  return (
    <div className="flex flex-col gap-6">
      <form
        action={searchAction}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <Field className="flex-1">
          <FieldLabel htmlFor="operator-email">Correo electrónico exacto</FieldLabel>
          <Input
            autoComplete="off"
            id="operator-email"
            name="email"
            placeholder="persona@ejemplo.com"
            required
            type="email"
          />
        </Field>
        <Button disabled={searching}>{searching ? "Buscando…" : "Buscar cuenta"}</Button>
      </form>
      {search.message ? (
        <Alert variant="destructive">
          <AlertDescription role="alert">{search.message}</AlertDescription>
        </Alert>
      ) : null}
      {search.user ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{search.user.name}</CardTitle>
            <CardDescription>{search.user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>Estado</dt>
              <dd>{search.user.banned ? "Suspendida" : "Activa"}</dd>
              <dt>Sesiones</dt>
              <dd>{search.user.activeSessionCount}</dd>
              <dt>Cambio requerido</dt>
              <dd>{search.user.passwordChangeRequired ? "Sí" : "No"}</dd>
            </dl>
            <form action={mutationAction} className="mt-6 flex flex-col gap-5">
              <input name="targetId" type="hidden" value={search.user.id} />
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="operator-reason">
                    Motivo o nota de verificación
                  </FieldLabel>
                  <Input id="operator-reason" maxLength={500} name="reason" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="verification-method">
                    Método de verificación
                  </FieldLabel>
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    id="verification-method"
                    name="verificationMethod"
                    defaultValue="WHATSAPP"
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="IN_PERSON">En persona</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </Field>
              </FieldGroup>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={mutating}
                  name="operation"
                  value={search.user.banned ? "restore" : "suspend"}
                >
                  {search.user.banned ? "Restaurar" : "Suspender"}
                </Button>
                <Button
                  disabled={mutating}
                  name="operation"
                  variant="outline"
                  value="revoke-sessions"
                >
                  Revocar sesiones
                </Button>
                <Button
                  disabled={mutating}
                  name="operation"
                  variant="outline"
                  value="temporary-password"
                >
                  Emitir contraseña temporal
                </Button>
              </div>
            </form>
            {mutation.message ? (
              <Alert className="mt-4">
                <AlertDescription role="status">{mutation.message}</AlertDescription>
              </Alert>
            ) : null}
            {mutation.temporaryPassword ? (
              <div
                className="mt-3 rounded-lg border border-primary bg-primary/5 p-3"
                role="status"
              >
                <p className="text-xs text-muted-foreground">Expira en 15 minutos</p>
                <code className="break-all text-lg font-semibold">
                  {mutation.temporaryPassword}
                </code>
              </div>
            ) : null}
            {search.user.events.length ? (
              <div className="mt-6">
                <h3 className="font-semibold">Eventos de seguridad</h3>
                <ul className="mt-2 flex flex-col gap-2 text-sm">
                  {search.user.events.map((event) => (
                    <li
                      className="rounded-md bg-muted p-2"
                      key={`${event.action}-${event.createdAt.toString()}`}
                    >
                      {event.action} ·{" "}
                      {new Intl.DateTimeFormat("es-MX", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(event.createdAt))}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
