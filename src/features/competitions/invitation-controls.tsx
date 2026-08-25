"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { generateInvitationAction, revokeInvitationAction } from "./membership-actions";
export function InvitationControls({
  competitionId,
  active,
}: {
  competitionId: string;
  active: boolean;
}) {
  const [url, setUrl] = useState<string>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();
  const router = useRouter();

  function generate() {
    start(async () => {
      const result = await generateInvitationAction(competitionId);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setUrl(result.url);
    });
  }

  function revoke() {
    start(async () => {
      const result = await revokeInvitationAction(competitionId);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setUrl(undefined);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {active
          ? "Hay una invitación activa. Por seguridad, el enlace solo se muestra al generarlo."
          : "No hay una invitación activa."}
      </p>
      {url ? (
        <div className="flex gap-2">
          <input
            aria-label="Enlace de invitación"
            readOnly
            value={url}
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMessage({ ok: true, text: "Enlace copiado." });
              } catch {
                setMessage({ ok: false, text: "No fue posible copiar el enlace." });
              }
            }}
          >
            Copiar
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={generate}>
          {active ? "Rotar enlace" : "Generar enlace"}
        </Button>
        {active ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={pending}>
                Revocar enlace
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revocar invitación</AlertDialogTitle>
                <AlertDialogDescription>
                  El enlace actual dejará de funcionar inmediatamente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={revoke}>
                  Revocar invitación
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {message ? (
        <p
          className={
            message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"
          }
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
