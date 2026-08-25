"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authClient } from "@/infrastructure/auth/auth-client";

type SessionSummary = Readonly<{
  token: string;
  userAgent?: string | null;
  updatedAt: Date;
}>;

export function SessionList() {
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    void authClient.listSessions().then(({ data }) => {
      setSessions((data ?? []) as readonly SessionSummary[]);
    });
  }, []);

  return (
    <section aria-labelledby="sessions-title" className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-2xl" id="sessions-title">
          Sesiones activas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Revisa los dispositivos con acceso a tu cuenta.
        </p>
      </div>
      {message ? (
        <Alert>
          <AlertDescription role="status">{message}</AlertDescription>
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-3">
        {sessions.map((session) => (
          <li
            className="flex flex-col items-stretch gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            key={session.token}
          >
            <div className="min-w-0">
              <p className="text-sm">{session.userAgent || "Dispositivo desconocido"}</p>
              <p className="text-xs text-muted-foreground">
                Actualizada{" "}
                {new Intl.DateTimeFormat("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(session.updatedAt))}
              </p>
            </div>
            <Button
              onClick={async () => {
                const result = await authClient.revokeSession({
                  token: session.token,
                });
                if (result.error) setMessage("No fue posible revocar la sesión.");
                else {
                  setSessions((current) =>
                    current.filter(({ token }) => token !== session.token),
                  );
                  setMessage("Sesión revocada.");
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Revocar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
