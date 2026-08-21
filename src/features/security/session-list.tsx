"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
    <section className="mt-10 max-w-xl">
      <h2 className="font-heading text-2xl">Sesiones activas</h2>
      {message ? (
        <p className="mt-2" role="status">
          {message}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {sessions.map((session) => (
          <li
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
            key={session.token}
          >
            <div>
              <p className="text-sm">
                {session.userAgent || "Dispositivo desconocido"}
              </p>
              <p className="text-xs text-muted-foreground">
                Actualizada {new Date(session.updatedAt).toLocaleString()}
              </p>
            </div>
            <Button
              onClick={async () => {
                const result = await authClient.revokeSession({
                  token: session.token,
                });
                if (result.error)
                  setMessage("No fue posible revocar la sesión.");
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
