"use client";

import { useActionState, useState } from "react";
import { configurePlayoffRoundAction } from "./playoff-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localDateTimeToUtcIso, toLocalDateTimeInput } from "@/lib/date-time";

export function PlayoffRoundForm({
  competitionId,
  value,
  defaults,
}: {
  competitionId: string;
  defaults?: { sequence: number; name: string };
  value?: {
    id: string;
    sequence: number;
    name: string;
    startsAt: string;
    unansweredPenalty: -1 | 0;
    advancementMode: "BEST_SEED" | "TIEBREAKER_QUESTION";
    tiebreakerQuestionId: string | null;
    questions: readonly { id: string; label: string }[];
  };
}) {
  const [mode, setMode] = useState(value?.advancementMode ?? "BEST_SEED");
  const [startsAt, setStartsAt] = useState(value?.startsAt ?? "");
  const [state, action, pending] = useActionState(
    configurePlayoffRoundAction.bind(null, competitionId, value?.id ?? null),
    {},
  );
  return (
    <form action={action} className="grid gap-5">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="playoff-name">Nombre</FieldLabel>
            <Input
              id="playoff-name"
              name="name"
              defaultValue={value?.name ?? defaults?.name ?? "Semifinal"}
              maxLength={120}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="playoff-sequence">Etapa</FieldLabel>
            <Input
              id="playoff-sequence"
              name="sequence"
              type="number"
              min="1"
              defaultValue={value?.sequence ?? defaults?.sequence ?? 1}
              required
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="playoff-start">Cierre predeterminado</FieldLabel>
          <Input
            id="playoff-start"
            type="datetime-local"
            value={toLocalDateTimeInput(startsAt)}
            onChange={(event) =>
              setStartsAt(localDateTimeToUtcIso(event.currentTarget.value))
            }
            required
          />
          <input type="hidden" name="startsAt" value={startsAt} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="playoff-mode">Desempate del cruce</FieldLabel>
            <Select
              name="advancementMode"
              value={mode}
              onValueChange={(value) => setMode(value as typeof mode)}
            >
              <SelectTrigger id="playoff-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BEST_SEED">Mejor siembra</SelectItem>
                <SelectItem value="TIEBREAKER_QUESTION">Pregunta de desempate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="playoff-penalty">Sin pronóstico</FieldLabel>
            <Select
              name="unansweredPenalty"
              defaultValue={String(value?.unansweredPenalty ?? -1)}
            >
              <SelectTrigger id="playoff-penalty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">−1 punto</SelectItem>
                <SelectItem value="0">0 puntos</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {mode === "TIEBREAKER_QUESTION" && value?.questions.length ? (
          <Field>
            <FieldLabel htmlFor="playoff-tiebreaker">Pregunta compartida</FieldLabel>
            <Select
              name="tiebreakerQuestionId"
              defaultValue={value.tiebreakerQuestionId ?? ""}
            >
              <SelectTrigger id="playoff-tiebreaker">
                <SelectValue placeholder="Selecciona una pregunta" />
              </SelectTrigger>
              <SelectContent>
                {value.questions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </FieldGroup>
      <Button disabled={pending}>
        {pending ? "Guardando…" : value ? "Guardar ronda" : "Crear ronda"}
      </Button>
      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className="text-sm text-muted-foreground"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
