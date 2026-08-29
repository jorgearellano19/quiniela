"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { configureH2HAction, type H2HActionState } from "@/features/h2h/h2h-actions";

export function H2HConfigurationForm({
  competitionId,
  type,
  participantCount,
}: {
  competitionId: string;
  type: "LEAGUE_PLAYOFFS" | "GROUP_PLAYOFFS";
  participantCount: number;
}) {
  const action = configureH2HAction.bind(null, competitionId, type);
  const [state, formAction, pending] = useActionState<H2HActionState, FormData>(
    action,
    {},
  );
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {type === "LEAGUE_PLAYOFFS" ? (
        <>
          <Field>
            <FieldLabel htmlFor="roundCount">Jornadas de fase regular</FieldLabel>
            <input
              id="roundCount"
              name="roundCount"
              type="number"
              min={1}
              max={Math.max(1, participantCount - 1)}
              required
              className="h-10 rounded-md border bg-background px-3"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="qualifierCount">Clasifican</FieldLabel>
            <select
              id="qualifierCount"
              name="qualifierCount"
              required
              className="h-10 rounded-md border bg-background px-3"
            >
              {[2, 4, 8, 16]
                .filter((value) => value <= participantCount)
                .map((value) => (
                  <option key={value} value={value}>
                    {value} participantes
                  </option>
                ))}
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor="groupSize">Participantes por grupo</FieldLabel>
            <select
              id="groupSize"
              name="groupSize"
              className="h-10 rounded-md border bg-background px-3"
            >
              <option value="4">4</option>
              <option value="8">8</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="advancersPerGroup">Avanzan por grupo</FieldLabel>
            <select
              id="advancersPerGroup"
              name="advancersPerGroup"
              className="h-10 rounded-md border bg-background px-3"
            >
              <option value="1">1 participante</option>
              <option value="2">2 participantes</option>
            </select>
          </Field>
        </>
      )}
      <div className="sm:col-span-2">
        {state.message ? (
          <p role="status" className="mb-3 text-sm text-muted-foreground">
            {state.message}
          </p>
        ) : null}
        <Button disabled={pending} type="submit">
          {pending ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}
