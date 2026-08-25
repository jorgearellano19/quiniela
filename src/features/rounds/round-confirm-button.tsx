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
import type { RoundActionState } from "./round-actions";
export function RoundConfirmButton({
  action,
  label,
  title,
  description,
  variant = "default",
  disabled = false,
  successHref,
}: {
  action: () => Promise<RoundActionState>;
  label: string;
  title: string;
  description: string;
  variant?: "default" | "destructive";
  disabled?: boolean;
  successHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<RoundActionState>();
  function run() {
    start(async () => {
      const result = await action();
      setState(result);
      if (result.success) {
        if (successHref) router.push(successHref);
        else router.refresh();
      }
    });
  }
  return (
    <div className="grid gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant={variant} disabled={disabled || pending}>
            {pending ? "Procesando…" : label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant={variant} onClick={run}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state?.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={
            state.success ? "text-sm text-muted-foreground" : "text-sm text-destructive"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
