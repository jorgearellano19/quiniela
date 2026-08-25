"use client";
import { useActionState, useState } from "react";
import type { QuestionEditor } from "@/application/round/use-cases";
import type { CompetitionScoringDefaults, QuestionType } from "@/domain/round/round";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createQuestionAction,
  createRoundAction,
  updateQuestionAction,
  updateRoundAction,
  updateScoringDefaultsAction,
  type RoundActionState,
} from "./round-actions";
const initial: RoundActionState = {};
function Status({ state }: { state: RoundActionState }) {
  return state.message ? (
    <div
      role={state.success ? "status" : "alert"}
      className={
        state.success ? "text-sm text-muted-foreground" : "text-sm text-destructive"
      }
    >
      <p>{state.message}</p>
      {state.fieldErrors ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {Object.values(state.fieldErrors).map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;
}
export function ScoringDefaultsForm({
  competitionId,
  value,
}: {
  competitionId: string;
  value: CompetitionScoringDefaults;
}) {
  const [goalDifferenceEnabled, setGoalDifferenceEnabled] = useState(
    value.matchScore.goalDifferencePoints !== null,
  );
  const [state, action, pending] = useActionState(
    updateScoringDefaultsAction.bind(null, competitionId),
    initial,
  );
  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-medium">Marcador</legend>
        <Field
          prefix="defaults"
          name="exactScorePoints"
          label="Marcador exacto"
          value={String(value.matchScore.exactScorePoints)}
        />
        <Field
          prefix="defaults"
          name="goalDifferencePoints"
          label="Diferencia"
          value={String(value.matchScore.goalDifferencePoints ?? 2)}
          disabled={!goalDifferenceEnabled}
        />
        <Field
          prefix="defaults"
          name="normalResultPoints"
          label="Resultado"
          value={String(value.matchScore.normalResultPoints)}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-3">
          <input
            type="checkbox"
            name="goalDifferenceEnabled"
            checked={goalDifferenceEnabled}
            onChange={(event) => setGoalDifferenceEnabled(event.currentTarget.checked)}
          />{" "}
          Usar diferencia de goles
        </label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          prefix="defaults"
          name="closestValuePoints"
          label="Valor más cercano"
          value={String(value.closestValuePoints)}
        />
        <Field
          prefix="defaults"
          name="optionsPoints"
          label="Opciones"
          value={String(value.optionsPoints)}
        />
        <Field
          prefix="defaults"
          name="openTextPoints"
          label="Texto abierto"
          value={String(value.openTextPoints)}
        />
        <Field
          prefix="defaults"
          name="exactValuePoints"
          label="Valor exacto"
          value={String(value.exactValuePoints)}
        />
      </div>
      <Button disabled={pending}>{pending ? "Guardando…" : "Guardar puntajes"}</Button>
      <Status state={state} />
    </form>
  );
}
export function NewRoundForm({
  competitionId,
  nextSequence,
}: {
  competitionId: string;
  nextSequence: number;
}) {
  const [startsAt, setStartsAt] = useState("");
  const [state, action, pending] = useActionState(
    createRoundAction.bind(null, competitionId),
    initial,
  );
  return (
    <form action={action} className="grid gap-4">
      <Label htmlFor="name">Nombre</Label>
      <Input id="name" name="name" required maxLength={120} placeholder="Jornada 1" />
      <input type="hidden" name="sequence" value={nextSequence} />
      <Label htmlFor="startsAt">Inicio de jornada</Label>
      <Input
        id="startsAt"
        type="datetime-local"
        required
        onChange={(event) => {
          const local = event.currentTarget.value;
          setStartsAt(local ? new Date(local).toISOString() : "");
        }}
      />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="unansweredPenalty" value="-1" />
      <Button disabled={pending}>{pending ? "Creando…" : "Crear jornada"}</Button>
      <Status state={state} />
    </form>
  );
}
export function NewRoundDisclosure(props: {
  competitionId: string;
  nextSequence: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-4">
      <Button type="button" className="w-full sm:w-fit" onClick={() => setOpen(!open)}>
        {open ? "Cancelar" : "Crear jornada"}
      </Button>
      {open ? (
        <CardLike>
          <NewRoundForm {...props} />
        </CardLike>
      ) : null}
    </div>
  );
}
function CardLike({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-5">{children}</div>;
}
export function RoundSettingsForm({
  competitionId,
  value,
}: {
  competitionId: string;
  value: Readonly<{
    id: string;
    name: string;
    sequence: number;
    startsAt: string;
    unansweredPenalty: -1 | 0;
  }>;
}) {
  const [startsAt, setStartsAt] = useState(value.startsAt);
  const [state, action, pending] = useActionState(
    updateRoundAction.bind(null, competitionId, value.id),
    initial,
  );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="round-name">Nombre</Label>
        <Input
          id="round-name"
          name="name"
          defaultValue={value.name}
          maxLength={120}
          required
        />
      </div>
      <input type="hidden" name="sequence" value={value.sequence} />
      <div className="grid gap-2">
        <Label htmlFor="round-starts-at">Inicio de jornada</Label>
        <Input
          id="round-starts-at"
          name="startsAt"
          type="datetime-local"
          value={toLocalInput(startsAt)}
          onChange={(event) => {
            const local = event.currentTarget.value;
            setStartsAt(local ? new Date(local).toISOString() : "");
          }}
          required
        />
        <input type="hidden" name="startsAt" value={startsAt} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="penalty">Pregunta sin responder</Label>
        <Select name="unansweredPenalty" defaultValue={String(value.unansweredPenalty)}>
          <SelectTrigger id="penalty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-1">−1 punto</SelectItem>
            <SelectItem value="0">Sin penalización</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button disabled={pending}>{pending ? "Guardando…" : "Guardar ajustes"}</Button>
      </div>
      <Status state={state} />
    </form>
  );
}
export function QuestionForm({
  competitionId,
  roundId,
  nextSequence,
  value,
  scoringDefaults,
}: {
  competitionId: string;
  roundId: string;
  nextSequence: number;
  value?: QuestionEditor;
  scoringDefaults: CompetitionScoringDefaults;
}) {
  const [type, setType] = useState<QuestionType>(value?.type ?? "MATCH_SCORE");
  const prefix = value?.id ?? "new-question";
  const [deadlineAt, setDeadlineAt] = useState(value?.deadlineAt ?? "");
  const [deadlineMode, setDeadlineMode] = useState(value?.deadlineMode ?? "ROUND_START");
  const [usesDefaults, setUsesDefaults] = useState(value?.usesDefaultScoring ?? true);
  const [goalDifferenceEnabled, setGoalDifferenceEnabled] = useState(
    value?.type !== "MATCH_SCORE" || value.goalDifferencePoints !== null,
  );
  const [state, action, pending] = useActionState(
    value
      ? updateQuestionAction.bind(null, competitionId, roundId, value.id)
      : createQuestionAction.bind(null, competitionId, roundId),
    initial,
  );
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-type`}>Tipo de pregunta</Label>
        <Select
          name="type"
          value={type}
          onValueChange={(v) => setType(v as QuestionType)}
        >
          <SelectTrigger id={`${prefix}-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MATCH_SCORE">Marcador</SelectItem>
            <SelectItem value="CLOSEST_VALUE">Valor más cercano</SelectItem>
            <SelectItem value="OPTIONS">Opciones</SelectItem>
            <SelectItem value="OPEN_TEXT">Texto abierto</SelectItem>
            <SelectItem value="EXACT_VALUE">Valor exacto</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {type !== "MATCH_SCORE" ? (
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-prompt`}>Pregunta</Label>
          <Textarea
            id={`${prefix}-prompt`}
            name="prompt"
            maxLength={500}
            defaultValue={value?.prompt ?? ""}
            required
          />
        </div>
      ) : null}
      <input type="hidden" name="sequence" value={value?.sequence ?? nextSequence} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${prefix}-deadline-mode`}>Cierre de respuestas</Label>
          <Select
            name="deadlineMode"
            value={deadlineMode}
            onValueChange={(mode) => setDeadlineMode(mode as "ROUND_START" | "CUSTOM")}
          >
            <SelectTrigger id={`${prefix}-deadline-mode`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ROUND_START">Al inicio de la jornada</SelectItem>
              <SelectItem value="CUSTOM">Fecha personalizada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {deadlineMode === "CUSTOM" ? (
          <div>
            <Label htmlFor={`${prefix}-deadline`}>Fecha personalizada</Label>
            <Input
              id={`${prefix}-deadline`}
              type="datetime-local"
              required
              value={deadlineAt ? toLocalInput(deadlineAt) : ""}
              suppressHydrationWarning
              onChange={(event) => {
                const localValue = event.currentTarget.value;
                setDeadlineAt(localValue ? new Date(localValue).toISOString() : "");
              }}
            />
            <input type="hidden" name="deadlineAt" value={deadlineAt} />
          </div>
        ) : null}
      </div>
      <label className="flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm font-medium">
        <input
          type="checkbox"
          name="usesDefaultScoring"
          checked={usesDefaults}
          onChange={(event) => setUsesDefaults(event.currentTarget.checked)}
        />
        Mantener puntajes predeterminados
      </label>
      {type === "MATCH_SCORE" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            prefix={prefix}
            name="homeLabel"
            label="Local"
            text
            value={value?.type === "MATCH_SCORE" ? value.homeLabel : undefined}
          />
          <Field
            prefix={prefix}
            name="awayLabel"
            label="Visitante"
            text
            value={value?.type === "MATCH_SCORE" ? value.awayLabel : undefined}
          />
          {!usesDefaults ? (
            <>
              <Field
                prefix={prefix}
                name="exactScorePoints"
                label="Marcador exacto"
                value={String(
                  value?.type === "MATCH_SCORE"
                    ? value.exactScorePoints
                    : scoringDefaults.matchScore.exactScorePoints,
                )}
              />
              <Field
                prefix={prefix}
                name="normalResultPoints"
                label="Resultado"
                value={String(
                  value?.type === "MATCH_SCORE"
                    ? value.normalResultPoints
                    : scoringDefaults.matchScore.normalResultPoints,
                )}
              />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="goalDifferenceEnabled"
                  checked={goalDifferenceEnabled}
                  onChange={(event) =>
                    setGoalDifferenceEnabled(event.currentTarget.checked)
                  }
                />{" "}
                Usar diferencia de goles
              </label>
              <Field
                prefix={prefix}
                name="goalDifferencePoints"
                label="Diferencia"
                value={String(
                  value?.type === "MATCH_SCORE"
                    ? (value.goalDifferencePoints ??
                        scoringDefaults.matchScore.goalDifferencePoints ??
                        2)
                    : (scoringDefaults.matchScore.goalDifferencePoints ?? 2),
                )}
                disabled={!goalDifferenceEnabled}
              />
            </>
          ) : null}
        </div>
      ) : (
        <>
          {!usesDefaults ? (
            <Field
              prefix={prefix}
              name="points"
              label="Puntos"
              value={String(
                value && value.type !== "MATCH_SCORE"
                  ? value.points
                  : defaultPoints(type, scoringDefaults),
              )}
            />
          ) : null}
          {type === "CLOSEST_VALUE" ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="againstRival"
                defaultChecked={value?.type === "CLOSEST_VALUE" && value.againstRival}
              />{" "}
              Comparar contra rival
            </label>
          ) : null}
          {type === "OPTIONS" ? (
            <div className="grid gap-2">
              <OptionsEditor
                prefix={prefix}
                value={
                  value?.type === "OPTIONS"
                    ? value.options.map((option) => option.label)
                    : []
                }
              />
            </div>
          ) : null}
        </>
      )}
      <Button disabled={pending}>
        {pending ? "Guardando…" : value ? "Guardar pregunta" : "Agregar pregunta"}
      </Button>
      <Status state={state} />
    </form>
  );
}
function defaultPoints(type: QuestionType, value: CompetitionScoringDefaults) {
  if (type === "CLOSEST_VALUE") return value.closestValuePoints;
  if (type === "OPTIONS") return value.optionsPoints;
  if (type === "OPEN_TEXT") return value.openTextPoints;
  return value.exactValuePoints;
}
function OptionsEditor({ prefix, value }: { prefix: string; value: string[] }) {
  const [options, setOptions] = useState(value);
  const [draft, setDraft] = useState("");
  const add = () => {
    const label = draft.trim();
    if (
      !label ||
      options.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())
    )
      return;
    setOptions([...options, label]);
    setDraft("");
  };
  return (
    <div className="grid gap-3">
      <Label htmlFor={`${prefix}-option-input`}>Opciones</Label>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          id={`${prefix}-option-input`}
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Escribe una opción"
        />
        <Button
          type="button"
          className="w-full sm:w-auto"
          variant="outline"
          onClick={add}
        >
          Agregar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {options.map((option, index) => (
          <span
            key={`${option}-${index}`}
            className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full bg-secondary px-3 text-sm"
          >
            <span className="truncate">{option}</span>
            <button
              type="button"
              className="min-h-6 min-w-6 rounded-full"
              aria-label={`Eliminar ${option}`}
              onClick={() =>
                setOptions(options.filter((_, current) => current !== index))
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input type="hidden" name="options" value={options.join("\n")} />
    </div>
  );
}
function toLocalInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}
function Field({
  prefix,
  name,
  label,
  value,
  text,
  disabled,
}: {
  prefix: string;
  name: string;
  label: string;
  value?: string | undefined;
  text?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={`${prefix}-${name}`}>{label}</Label>
      <Input
        id={`${prefix}-${name}`}
        name={name}
        type={text ? "text" : "number"}
        min={text ? undefined : 1}
        max={text ? undefined : 100}
        defaultValue={value}
        required
        disabled={disabled}
      />
    </div>
  );
}
