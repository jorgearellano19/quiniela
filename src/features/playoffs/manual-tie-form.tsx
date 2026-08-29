"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { resolvePlayoffTieAction } from "./playoff-actions";

export function ManualTieForm({
  competitionId,
  playoffRoundId,
  matchupId,
  participantA,
  participantB,
}: {
  competitionId: string;
  playoffRoundId: string;
  matchupId: string;
  participantA: { id: string; name: string };
  participantB: { id: string; name: string };
}) {
  const [state, action, pending] = useActionState(
    resolvePlayoffTieAction.bind(null, competitionId, playoffRoundId, matchupId),
    {},
  );
  return (
    <form action={action} className="grid gap-3 rounded-xl border p-4">
      <p className="font-medium">
        {participantA.name} vs {participantB.name}
      </p>
      <select
        name="participantId"
        className="h-11 rounded-md border bg-background px-3"
        aria-label={`Ganador de ${participantA.name} contra ${participantB.name}`}
      >
        <option value={participantA.id}>{participantA.name}</option>
        <option value={participantB.id}>{participantB.name}</option>
      </select>
      <Button disabled={pending}>
        {pending ? "Guardando…" : "Guardar decisión manual"}
      </Button>
      {state.message ? (
        <p role={state.success ? "status" : "alert"} className="text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
