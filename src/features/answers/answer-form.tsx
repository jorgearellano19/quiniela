"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MyAnswersDetail } from "@/application/answer/use-cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
import { Textarea } from "@/components/ui/textarea";
import { LocalDateTime } from "@/features/rounds/local-date-time";
import { saveAnswerAction, type AnswerActionState } from "./answer-actions";

type Item = MyAnswersDetail["questions"][number];

function title(item: Item) {
  return item.type === "MATCH_SCORE" ? "Marcador" : item.prompt;
}
function points(item: Item) {
  if (item.type === "MATCH_SCORE") {
    const values = [
      `${item.scoring.exactScorePoints} exacto`,
      item.scoring.goalDifferencePoints === null
        ? null
        : `${item.scoring.goalDifferencePoints} diferencia`,
      `${item.scoring.normalResultPoints} resultado`,
    ].filter(Boolean);
    return values.join(" · ");
  }
  return `${item.scoring.points} ${item.scoring.points === 1 ? "punto" : "puntos"}`;
}
function displayValue(item: Item) {
  const value = item.answer?.value;
  if (!value) return "Sin pronóstico";
  if (value.type === "MATCH_SCORE") return `${value.homeScore} – ${value.awayScore}`;
  if (value.type === "OPTIONS")
    return item.type === "OPTIONS"
      ? (item.options.find((option) => option.id === value.optionId)?.label ??
          "Opción guardada")
      : "Opción guardada";
  return value.value;
}

export function AnswerForm({
  competitionId,
  roundId,
  item,
}: {
  competitionId: string;
  roundId: string;
  item: Item;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const mode = item.answer ? "update" : "submit";
  const initialOption =
    item.answer?.value.type === "OPTIONS" ? item.answer.value.optionId : "";
  const initialHomeScore =
    item.answer?.value.type === "MATCH_SCORE" ? String(item.answer.value.homeScore) : "";
  const initialAwayScore =
    item.answer?.value.type === "MATCH_SCORE" ? String(item.answer.value.awayScore) : "";
  const initialValue =
    item.answer?.value.type === "OPEN_TEXT" ||
    item.answer?.value.type === "CLOSEST_VALUE" ||
    item.answer?.value.type === "EXACT_VALUE"
      ? item.answer.value.value
      : "";
  const [optionId, setOptionId] = useState(initialOption);
  const [homeScore, setHomeScore] = useState(initialHomeScore);
  const [awayScore, setAwayScore] = useState(initialAwayScore);
  const [value, setValue] = useState(initialValue);
  const [baseline, setBaseline] = useState(() => ({
    optionId: initialOption,
    homeScore: initialHomeScore,
    awayScore: initialAwayScore,
    value: initialValue,
  }));
  const serverAction = saveAnswerAction.bind(null, mode, competitionId, roundId, item.id);
  const action = async (previous: AnswerActionState, data: FormData) => {
    const result = await serverAction(previous, data);
    if (result.success) setBaseline({ optionId, homeScore, awayScore, value });
    return result;
  };
  const [state, formAction, pending] = useActionState<AnswerActionState, FormData>(
    action,
    {},
  );
  useEffect(() => {
    if (state.refresh) router.refresh();
    if (state.fieldErrors)
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [router, state.fieldErrors, state.refresh]);
  useEffect(() => {
    if (!item.canEdit) return;
    let timer: ReturnType<typeof setTimeout>;
    const refreshAtDeadline = () => {
      const remaining = new Date(item.deadlineAt).valueOf() - Date.now();
      if (remaining <= 0) router.refresh();
      else timer = setTimeout(refreshAtDeadline, Math.min(remaining + 50, 2_147_483_647));
    };
    refreshAtDeadline();
    return () => clearTimeout(timer);
  }, [item.canEdit, item.deadlineAt, router]);
  const homeError = state.fieldErrors?.homeScore;
  const awayError = state.fieldErrors?.awayScore;
  const valueError = state.fieldErrors?.value;
  const optionError = state.fieldErrors?.optionId;
  const changed =
    item.type === "MATCH_SCORE"
      ? homeScore !== baseline.homeScore || awayScore !== baseline.awayScore
      : item.type === "OPTIONS"
        ? optionId !== baseline.optionId
        : value !== baseline.value;
  const complete =
    item.type === "MATCH_SCORE"
      ? Boolean(homeScore && awayScore)
      : item.type === "OPTIONS"
        ? Boolean(optionId)
        : Boolean(value.trim());

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="secondary">Pregunta {item.sequence}</Badge>
          <Badge variant="outline">{points(item)}</Badge>
        </div>
        <CardTitle className="font-heading text-2xl">{title(item)}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cierra <LocalDateTime value={item.deadlineAt} />
        </p>
      </CardHeader>
      {item.canEdit ? (
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="type" value={item.type} />
          <CardContent className="pb-(--card-spacing)">
            <FieldGroup>
              {item.type === "MATCH_SCORE" ? (
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 rounded-2xl bg-muted p-4 sm:gap-6 sm:p-6">
                  <Field data-invalid={Boolean(homeError)}>
                    <FieldLabel
                      htmlFor={`${item.id}-home`}
                      className="mx-auto text-center"
                    >
                      {item.homeLabel}
                    </FieldLabel>
                    <Input
                      id={`${item.id}-home`}
                      name="homeScore"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="999"
                      step="1"
                      required
                      aria-invalid={Boolean(homeError)}
                      aria-describedby={homeError ? `${item.id}-home-error` : undefined}
                      value={homeScore}
                      onChange={(event) => setHomeScore(event.currentTarget.value)}
                      className="mx-auto h-14 max-w-24 text-center font-heading text-3xl tabular-nums"
                    />
                    <FieldError id={`${item.id}-home-error`}>{homeError}</FieldError>
                  </Field>
                  <span
                    aria-hidden="true"
                    className="mt-8 flex size-10 items-center justify-center rounded-full bg-background font-heading text-sm font-semibold shadow-sm"
                  >
                    VS
                  </span>
                  <Field data-invalid={Boolean(awayError)}>
                    <FieldLabel
                      htmlFor={`${item.id}-away`}
                      className="mx-auto text-center"
                    >
                      {item.awayLabel}
                    </FieldLabel>
                    <Input
                      id={`${item.id}-away`}
                      name="awayScore"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="999"
                      step="1"
                      required
                      aria-invalid={Boolean(awayError)}
                      aria-describedby={awayError ? `${item.id}-away-error` : undefined}
                      value={awayScore}
                      onChange={(event) => setAwayScore(event.currentTarget.value)}
                      className="mx-auto h-14 max-w-24 text-center font-heading text-3xl tabular-nums"
                    />
                    <FieldError id={`${item.id}-away-error`}>{awayError}</FieldError>
                  </Field>
                </div>
              ) : item.type === "OPTIONS" ? (
                <Field data-invalid={Boolean(optionError)}>
                  <FieldLabel htmlFor={`${item.id}-options`}>Elige una opción</FieldLabel>
                  <Select name="optionId" value={optionId} onValueChange={setOptionId}>
                    <SelectTrigger
                      id={`${item.id}-options`}
                      className="w-full"
                      aria-invalid={Boolean(optionError)}
                      aria-describedby={
                        optionError ? `${item.id}-option-error` : undefined
                      }
                    >
                      <SelectValue placeholder="Selecciona una opción" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {item.options.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError id={`${item.id}-option-error`}>{optionError}</FieldError>
                </Field>
              ) : item.type === "OPEN_TEXT" ? (
                <Field data-invalid={Boolean(valueError)}>
                  <FieldLabel htmlFor={`${item.id}-value`}>Tu respuesta</FieldLabel>
                  <Textarea
                    id={`${item.id}-value`}
                    name="value"
                    maxLength={500}
                    required
                    aria-invalid={Boolean(valueError)}
                    aria-describedby={valueError ? `${item.id}-value-error` : undefined}
                    value={value}
                    onChange={(event) => setValue(event.currentTarget.value)}
                  />
                  <FieldDescription>Máximo 500 caracteres.</FieldDescription>
                  <FieldError id={`${item.id}-value-error`}>{valueError}</FieldError>
                </Field>
              ) : (
                <Field data-invalid={Boolean(valueError)}>
                  <FieldLabel htmlFor={`${item.id}-value`}>Tu respuesta</FieldLabel>
                  <Input
                    id={`${item.id}-value`}
                    name="value"
                    type="text"
                    inputMode="decimal"
                    placeholder={
                      item.type === "EXACT_VALUE" ? "Ejemplo: 25" : "Ejemplo: 12.5"
                    }
                    required
                    aria-invalid={Boolean(valueError)}
                    aria-describedby={valueError ? `${item.id}-value-error` : undefined}
                    value={value}
                    onChange={(event) => setValue(event.currentTarget.value)}
                  />
                  {item.type === "CLOSEST_VALUE" ? (
                    <FieldDescription>Usa hasta 6 decimales.</FieldDescription>
                  ) : null}
                  <FieldError id={`${item.id}-value-error`}>{valueError}</FieldError>
                </Field>
              )}
            </FieldGroup>
            {state.message ? (
              <p className="mt-4 text-sm" role={state.success ? "status" : "alert"}>
                {state.message}
              </p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button
              className="w-full sm:w-auto"
              disabled={pending || !changed || !complete}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "Guardando…" : "Guardar pronóstico"}
            </Button>
          </CardFooter>
        </form>
      ) : (
        <CardContent>
          <div className="rounded-xl bg-muted p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Pronóstico cerrado
            </p>
            <p className="mt-2 text-lg font-medium">{displayValue(item)}</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
