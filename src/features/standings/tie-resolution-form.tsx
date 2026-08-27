"use client";

import { useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { RankingScope } from "@/application/standings/use-cases";
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
import { resolveRankingTieAction, type StandingsActionState } from "./standings-actions";

type Participant = Readonly<{ id: string; name: string; adminLabel: string | null }>;

export function TieResolutionForm({
  competitionId,
  scope,
  roundId,
  participants: initialParticipants,
}: {
  competitionId: string;
  scope: RankingScope;
  roundId: string | null;
  participants: readonly Participant[];
}) {
  const [participants, setParticipants] = useState([...initialParticipants]);
  const [state, setState] = useState<StandingsActionState>();
  const [pending, startTransition] = useTransition();

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= participants.length) return;
    const next = [...participants];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    setParticipants(next);
  }

  function save() {
    startTransition(async () => {
      setState(
        await resolveRankingTieAction(
          competitionId,
          scope,
          roundId,
          participants.map((participant) => participant.id),
        ),
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Ordena el grupo completo. La primera posición gana el desempate.
      </p>
      <ol className="flex flex-col gap-2" aria-label="Orden manual del empate">
        {participants.map((participant, index) => (
          <li
            key={participant.id}
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <span className="font-heading text-xl tabular-nums" aria-hidden="true">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {participant.name}
              </span>
              {participant.adminLabel ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {participant.adminLabel}
                </span>
              ) : null}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={pending || index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Mover ${participant.name} hacia arriba`}
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={pending || index === participants.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Mover ${participant.name} hacia abajo`}
            >
              <ArrowDownIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={pending}>
            {pending ? "Guardando…" : "Guardar desempate"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar orden del empate</AlertDialogTitle>
            <AlertDialogDescription>
              Este orden decidirá las posiciones mientras los datos de la clasificación no
              cambien. La decisión quedará registrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={save}>Guardar orden</AlertDialogAction>
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
