"use client";

import { useActionState } from "react";
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
          <Select name="type" {...(initial?.type ? { defaultValue: initial.type } : {})}>
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
