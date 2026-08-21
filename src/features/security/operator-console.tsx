"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  findUserAction,
  initialOperatorState,
  operatorMutationAction,
} from "./operator-actions";

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
    <div className="flex max-w-2xl flex-col gap-8">
      <form action={searchAction} className="flex gap-3">
        <Input
          aria-label="Correo exacto"
          name="email"
          placeholder="persona@ejemplo.com"
          required
          type="email"
        />
        <Button disabled={searching}>Buscar</Button>
      </form>
      {search.message ? <p role="alert">{search.message}</p> : null}
      {search.user ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-2xl">{search.user.name}</h2>
          <p className="text-sm text-muted-foreground">{search.user.email}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt>Estado</dt>
            <dd>{search.user.banned ? "Suspendida" : "Activa"}</dd>
            <dt>Sesiones</dt>
            <dd>{search.user.activeSessionCount}</dd>
            <dt>Cambio requerido</dt>
            <dd>{search.user.passwordChangeRequired ? "Sí" : "No"}</dd>
          </dl>
          <form action={mutationAction} className="mt-6 flex flex-col gap-3">
            <input name="targetId" type="hidden" value={search.user.id} />
            <Input
              aria-label="Motivo o nota de verificación"
              maxLength={500}
              name="reason"
              placeholder="Motivo o nota de verificación"
              required
            />
            <select
              aria-label="Método de verificación"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              name="verificationMethod"
              defaultValue="WHATSAPP"
            >
              <option value="WHATSAPP">WhatsApp</option>
              <option value="IN_PERSON">En persona</option>
              <option value="OTHER">Otro</option>
            </select>
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
            <p className="mt-4" role="status">
              {mutation.message}
            </p>
          ) : null}
          {mutation.temporaryPassword ? (
            <div
              className="mt-3 rounded-lg border border-primary bg-primary/5 p-3"
              role="status"
            >
              <p className="text-xs text-muted-foreground">
                Expira en 15 minutos
              </p>
              <code className="break-all text-lg font-semibold">
                {mutation.temporaryPassword}
              </code>
            </div>
          ) : null}
          {search.user.events.length ? (
            <div className="mt-6">
              <h3 className="font-semibold">Eventos de seguridad</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {search.user.events.map((event) => (
                  <li
                    className="rounded-md bg-muted p-2"
                    key={`${event.action}-${event.createdAt.toString()}`}
                  >
                    {event.action} ·{" "}
                    {new Date(event.createdAt).toLocaleString()}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
