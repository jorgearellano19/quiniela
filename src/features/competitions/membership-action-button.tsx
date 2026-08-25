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
import { Spinner } from "@/components/ui/spinner";
import type { MembershipActionState } from "./membership-actions";

type Action = () => Promise<MembershipActionState>;

export function MembershipActionButton({
  action,
  label,
  pendingLabel,
  variant = "default",
  size = "default",
  confirmation,
}: {
  action: Action;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "destructive";
  size?: "default" | "sm";
  confirmation?: Readonly<{ title: string; description: string; confirmLabel: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<MembershipActionState>();

  function run() {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result.redirectTo) {
        router.push(result.redirectTo);
      } else if (result.ok) {
        router.refresh();
      }
    });
  }

  const trigger = (
    <Button
      disabled={pending}
      onClick={confirmation ? undefined : run}
      size={size}
      variant={variant}
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-2">
      {confirmation ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmation.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant={variant} onClick={run}>
                {confirmation.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        trigger
      )}
      {message ? (
        <p
          className={
            message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"
          }
          role={message.ok ? "status" : "alert"}
        >
          {message.message}
        </p>
      ) : null}
    </div>
  );
}
