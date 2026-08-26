"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RoundResultsDetail } from "@/application/scoring/use-cases";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  judgeOpenTextAction,
  saveOfficialResultAction,
  type ResultActionState,
} from "./result-actions";

type Question = RoundResultsDetail["questions"][number];

export function OfficialResultForm({
  competitionId,
  roundId,
  question,
}: {
  competitionId: string;
  roundId: string;
  question: Question;
}) {
  const router = useRouter();
  const mode = question.result ? "correct" : "record";
  const current = question.result;
  const [optionId, setOptionId] = useState(
    current?.type === "OPTIONS" ? current.optionId : "",
  );
  const action = saveOfficialResultAction.bind(
    null,
    mode,
    competitionId,
    roundId,
    question.id,
  );
  const [state, formAction, pending] = useActionState<ResultActionState, FormData>(
    action,
    {},
  );
  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);
  if (question.type === "OPEN_TEXT") return null;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="type" value={question.type} />
      <FieldGroup>
        {question.type === "MATCH_SCORE" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor={`${question.id}-result-home`}>
                {"homeLabel" in question ? question.homeLabel : "Local"}
              </FieldLabel>
              <Input
                id={`${question.id}-result-home`}
                name="homeScore"
                type="number"
                inputMode="numeric"
                min="0"
                max="999"
                step="1"
                required
                defaultValue={current?.type === "MATCH_SCORE" ? current.homeScore : ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${question.id}-result-away`}>
                {"awayLabel" in question ? question.awayLabel : "Visita"}
              </FieldLabel>
              <Input
                id={`${question.id}-result-away`}
                name="awayScore"
                type="number"
                inputMode="numeric"
                min="0"
                max="999"
                step="1"
                required
                defaultValue={current?.type === "MATCH_SCORE" ? current.awayScore : ""}
              />
            </Field>
          </div>
        ) : question.type === "OPTIONS" && "options" in question ? (
          <Field>
            <FieldLabel htmlFor={`${question.id}-result-option`}>
              Opción correcta
            </FieldLabel>
            <Select name="optionId" value={optionId} onValueChange={setOptionId}>
              <SelectTrigger id={`${question.id}-result-option`} className="w-full">
                <SelectValue placeholder="Selecciona la opción correcta" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {question.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${question.id}-result-value`}>Valor oficial</FieldLabel>
            <Input
              id={`${question.id}-result-value`}
              name="value"
              inputMode="decimal"
              required
              defaultValue={
                current?.type === "CLOSEST_VALUE" || current?.type === "EXACT_VALUE"
                  ? current.value
                  : ""
              }
            />
          </Field>
        )}
      </FieldGroup>
      <Button
        type="submit"
        disabled={pending || (question.type === "OPTIONS" && !optionId)}
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending
          ? "Guardando…"
          : mode === "record"
            ? "Guardar resultado"
            : "Guardar corrección"}
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

export function JudgmentControls({
  competitionId,
  roundId,
  answerId,
  value,
}: {
  competitionId: string;
  roundId: string;
  answerId: string;
  value: boolean | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ResultActionState>({});
  function save(isCorrect: boolean) {
    startTransition(async () => {
      const result = await judgeOpenTextAction(
        competitionId,
        roundId,
        answerId,
        isCorrect,
      );
      setState(result);
      if (result.success) router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" aria-label="Juicio de respuesta">
        <Button
          type="button"
          size="sm"
          variant={value === true ? "default" : "outline"}
          disabled={pending}
          onClick={() => save(true)}
        >
          Correcta
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === false ? "destructive" : "outline"}
          disabled={pending}
          onClick={() => save(false)}
        >
          Incorrecta
        </Button>
      </div>
      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className="text-sm text-muted-foreground"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
