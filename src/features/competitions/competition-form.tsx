"use client";

import { useActionState, useState } from "react";
import type { CompetitionType } from "@/domain/competition/competition";
import { Button } from "@/components/ui/button";
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
import type { CompetitionFormState } from "./competition-actions";

const initialState: CompetitionFormState = {};
export function CompetitionForm({
  action,
  initial,
}: {
  action: (state: CompetitionFormState, data: FormData) => Promise<CompetitionFormState>;
  initial?: { name: string; type: CompetitionType; rulesNote: string | null };
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [type, setType] = useState<CompetitionType | "">(initial?.type ?? "");
  const [financialFeaturesEnabled, setFinancialFeaturesEnabled] = useState(false);
  const supportsRoundPayments = type !== "GROUP_PLAYOFFS";
  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.message ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors?.name)}>
          <FieldLabel htmlFor="name">Nombre</FieldLabel>
          <Input
            id="name"
            name="name"
            defaultValue={initial?.name}
            maxLength={120}
            aria-invalid={Boolean(state.fieldErrors?.name)}
            placeholder="Quiniela de verano"
          />
          <FieldError>{state.fieldErrors?.name}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.type)}>
          <FieldLabel htmlFor="type">Tipo de competencia</FieldLabel>
          <Select
            name="type"
            value={type}
            onValueChange={(value) => {
              setType(value as CompetitionType);
            }}
          >
            <SelectTrigger
              id="type"
              aria-invalid={Boolean(state.fieldErrors?.type)}
              className="w-full"
            >
              <SelectValue placeholder="Selecciona un tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="LEAGUE">Liga</SelectItem>
                <SelectItem value="LEAGUE_PLAYOFFS">Liga con eliminatorias</SelectItem>
                <SelectItem value="GROUP_PLAYOFFS">Grupos con eliminatorias</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {type === "LEAGUE_PLAYOFFS"
              ? "De 2 a 30 participantes. La cantidad de jornadas y clasificados se define después de completar el roster."
              : type === "GROUP_PLAYOFFS"
                ? "Admite exactamente 8, 16, 32 o 64 participantes, en grupos de 4 u 8."
                : type === "LEAGUE"
                  ? "Liga abierta por puntaje acumulado; no tiene un cupo máximo configurable en el MVP."
                  : "Cada formato tiene límites de participantes y fases distintos."}
          </FieldDescription>
          <FieldError>{state.fieldErrors?.type}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.rulesNote)}>
          <FieldLabel htmlFor="rulesNote">
            Nota de reglas{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </FieldLabel>
          <Textarea
            id="rulesNote"
            name="rulesNote"
            defaultValue={initial?.rulesNote ?? ""}
            maxLength={2000}
            rows={6}
            aria-invalid={Boolean(state.fieldErrors?.rulesNote)}
            placeholder="Agrega acuerdos o contexto para quienes participen."
          />
          <FieldDescription>
            Podrás editarla mientras la quiniela sea un borrador.
          </FieldDescription>
          <FieldError>{state.fieldErrors?.rulesNote}</FieldError>
        </Field>
        {!initial ? (
          <fieldset className="grid gap-4 rounded-2xl border bg-muted/30 p-4 sm:p-5">
            <legend className="px-2 font-heading text-xl">Pagos y premios</legend>
            <p className="text-sm leading-6 text-muted-foreground">
              Registro manual en MXN. Quiniela no procesa cobros ni transfiere premios.
            </p>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm font-medium">
              <input
                type="checkbox"
                name="financialFeaturesEnabled"
                checked={financialFeaturesEnabled}
                onChange={(event) =>
                  setFinancialFeaturesEnabled(event.currentTarget.checked)
                }
                className="size-4 accent-primary"
              />
              Activar pagos y premios
            </label>
            {supportsRoundPayments ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="roundFeeAmount">
                      Cuota por jornada (MXN)
                    </FieldLabel>
                    <Input
                      id="roundFeeAmount"
                      name="roundFeeAmount"
                      inputMode="decimal"
                      disabled={!financialFeaturesEnabled}
                      placeholder="250.00"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="maximumDebt">Deuda máxima (MXN)</FieldLabel>
                    <Input
                      id="maximumDebt"
                      name="maximumDebt"
                      inputMode="decimal"
                      disabled={!financialFeaturesEnabled}
                      placeholder="500.00"
                    />
                    <FieldDescription>
                      Vacío permite registrar saldos sin restringir pronósticos.
                    </FieldDescription>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="roundWinnerPrizeAmount">
                    Premio por jornada (MXN)
                  </FieldLabel>
                  <Input
                    id="roundWinnerPrizeAmount"
                    name="roundWinnerPrizeAmount"
                    inputMode="decimal"
                    disabled={!financialFeaturesEnabled}
                    placeholder="1000.00"
                  />
                  <FieldDescription>
                    Es independiente de las cuotas y solo se muestra junto al ganador.
                  </FieldDescription>
                </Field>
                {type === "LEAGUE" ? (
                  <Field>
                    <FieldLabel htmlFor="leagueWinnerPrizeAmount">
                      Premio de liga (MXN)
                    </FieldLabel>
                    <Input
                      id="leagueWinnerPrizeAmount"
                      name="leagueWinnerPrizeAmount"
                      inputMode="decimal"
                      disabled={!financialFeaturesEnabled}
                      placeholder="5000.00"
                    />
                  </Field>
                ) : null}
                {type === "LEAGUE_PLAYOFFS" ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="leaguePhaseWinnerPrizeAmount">
                        Premio de fase regular (MXN)
                      </FieldLabel>
                      <Input
                        id="leaguePhaseWinnerPrizeAmount"
                        name="leaguePhaseWinnerPrizeAmount"
                        inputMode="decimal"
                        disabled={!financialFeaturesEnabled}
                        placeholder="2500.00"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="playoffChampionPrizeAmount">
                        Premio de campeón (MXN)
                      </FieldLabel>
                      <Input
                        id="playoffChampionPrizeAmount"
                        name="playoffChampionPrizeAmount"
                        inputMode="decimal"
                        disabled={!financialFeaturesEnabled}
                        placeholder="5000.00"
                      />
                    </Field>
                  </>
                ) : null}
              </>
            ) : (
              <Field>
                <FieldLabel htmlFor="playoffChampionPrizeAmount">
                  Premio de campeón (MXN)
                </FieldLabel>
                <Input
                  id="playoffChampionPrizeAmount"
                  name="playoffChampionPrizeAmount"
                  inputMode="decimal"
                  disabled={!financialFeaturesEnabled}
                  required={financialFeaturesEnabled}
                  placeholder="5000.00"
                />
                <FieldDescription>
                  Este formato no usa cuotas ni control de deuda.
                </FieldDescription>
              </Field>
            )}
            {state.fieldErrors?.payments ? (
              <FieldError>{state.fieldErrors.payments}</FieldError>
            ) : null}
          </fieldset>
        ) : null}
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {initial
          ? pending
            ? "Guardando…"
            : "Guardar cambios"
          : pending
            ? "Creando…"
            : "Crear quiniela"}
      </Button>
    </form>
  );
}
