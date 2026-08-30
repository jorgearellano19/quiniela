"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { PaymentActionState } from "./payment-actions";
import {
  configurePaymentsAction,
  recordPaymentAction,
  updatePaymentAction,
} from "./payment-actions";

const initial: PaymentActionState = {};
const pesos = (minor: number | null) => (minor === null ? "" : (minor / 100).toFixed(2));

export function PaymentConfigurationForm({
  competitionId,
  value,
}: {
  competitionId: string;
  value: {
    type: "LEAGUE" | "LEAGUE_PLAYOFFS" | "GROUP_PLAYOFFS";
    financialFeaturesEnabled: boolean;
    roundFeeAmount: number | null;
    maximumDebt: number | null;
    prizes: readonly {
      type: "ROUND_WINNER" | "LEAGUE_WINNER" | "LEAGUE_PHASE_WINNER" | "PLAYOFF_CHAMPION";
      amount: number;
    }[];
  };
}) {
  const [enabled, setEnabled] = useState(value.financialFeaturesEnabled);
  const prize = (type: NonNullable<typeof value.prizes>[number]["type"]) =>
    value.prizes.find((item) => item.type === type)?.amount ?? null;
  const [state, action, pending] = useActionState(
    configurePaymentsAction.bind(null, competitionId),
    initial,
  );
  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm font-medium">
        <input
          type="checkbox"
          name="financialFeaturesEnabled"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
          className="size-4 accent-primary"
        />
        Activar pagos y premios
      </label>
      <FieldGroup>
        {value.type !== "GROUP_PLAYOFFS" ? (
          <Field>
            <FieldLabel htmlFor="roundFeeAmount">Cuota por jornada (MXN)</FieldLabel>
            <Input
              id="roundFeeAmount"
              name="roundFeeAmount"
              inputMode="decimal"
              defaultValue={pesos(value.roundFeeAmount)}
              disabled={!enabled}
              placeholder="250.00"
            />
            <FieldDescription>
              Opcional. Déjalo vacío para usar solo premios.
            </FieldDescription>
          </Field>
        ) : null}
        {value.type !== "GROUP_PLAYOFFS" ? (
          <Field>
            <FieldLabel htmlFor="maximumDebt">Deuda máxima (MXN)</FieldLabel>
            <Input
              id="maximumDebt"
              name="maximumDebt"
              inputMode="decimal"
              defaultValue={pesos(value.maximumDebt)}
              disabled={!enabled}
              placeholder="500.00"
            />
            <FieldDescription>
              Déjalo vacío para llevar el saldo sin restringir pronósticos.
            </FieldDescription>
          </Field>
        ) : null}
        {value.type !== "GROUP_PLAYOFFS" ? (
          <Field>
            <FieldLabel htmlFor="roundWinnerPrizeAmount">
              Premio por jornada (MXN)
            </FieldLabel>
            <Input
              id="roundWinnerPrizeAmount"
              name="roundWinnerPrizeAmount"
              inputMode="decimal"
              defaultValue={pesos(prize("ROUND_WINNER"))}
              disabled={!enabled}
              placeholder="1000.00"
            />
            <FieldDescription>
              Se muestra junto al ganador; no registra pagos.
            </FieldDescription>
          </Field>
        ) : null}
        {value.type === "LEAGUE" ? (
          <Field>
            <FieldLabel htmlFor="leagueWinnerPrizeAmount">
              Premio de liga (MXN)
            </FieldLabel>
            <Input
              id="leagueWinnerPrizeAmount"
              name="leagueWinnerPrizeAmount"
              inputMode="decimal"
              defaultValue={pesos(prize("LEAGUE_WINNER"))}
              disabled={!enabled}
              placeholder="5000.00"
            />
          </Field>
        ) : null}
        {value.type === "LEAGUE_PLAYOFFS" ? (
          <Field>
            <FieldLabel htmlFor="leaguePhaseWinnerPrizeAmount">
              Premio de fase regular (MXN)
            </FieldLabel>
            <Input
              id="leaguePhaseWinnerPrizeAmount"
              name="leaguePhaseWinnerPrizeAmount"
              inputMode="decimal"
              defaultValue={pesos(prize("LEAGUE_PHASE_WINNER"))}
              disabled={!enabled}
              placeholder="2500.00"
            />
          </Field>
        ) : null}
        {value.type !== "LEAGUE" ? (
          <Field>
            <FieldLabel htmlFor="playoffChampionPrizeAmount">
              Premio de campeón (MXN)
            </FieldLabel>
            <Input
              id="playoffChampionPrizeAmount"
              name="playoffChampionPrizeAmount"
              inputMode="decimal"
              defaultValue={pesos(prize("PLAYOFF_CHAMPION"))}
              disabled={!enabled}
              placeholder="5000.00"
            />
          </Field>
        ) : null}
      </FieldGroup>
      {state.message ? (
        <p role={state.success ? "status" : "alert"} className="text-sm">
          {state.message}
        </p>
      ) : null}
      <Button disabled={pending} className="w-full sm:w-auto">
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? "Guardando…" : "Guardar pagos y premios"}
      </Button>
    </form>
  );
}

function localValue(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.valueOf() - offset).toISOString().slice(0, 16);
}

export function PaymentEntryForm({
  competitionId,
  participantId,
  payment,
  newPaymentId,
}: {
  competitionId: string;
  participantId: string;
  payment?: { id: string; amount: number; paidAt: Date };
  newPaymentId?: string;
}) {
  const router = useRouter();
  const [paymentId, setPaymentId] = useState(payment?.id ?? newPaymentId!);
  const [amount, setAmount] = useState(payment ? pesos(payment.amount) : "");
  const [paidAt, setPaidAt] = useState(localValue(payment?.paidAt ?? new Date()));
  const serverAction = payment
    ? updatePaymentAction.bind(null, competitionId, payment.id)
    : recordPaymentAction.bind(null, competitionId, participantId);
  const [state, action, pending] = useActionState(
    async (previousState: PaymentActionState, data: FormData) => {
      const nextState = await serverAction(previousState, data);
      if (nextState.success && !payment) {
        setPaymentId(crypto.randomUUID());
        setAmount("");
        setPaidAt(localValue(new Date()));
      }
      if (nextState.success) router.refresh();
      return nextState;
    },
    initial,
  );
  const iso = paidAt ? new Date(paidAt).toISOString() : "";
  return (
    <form
      action={action}
      className="grid gap-3 sm:grid-cols-[1fr_1.35fr_auto] sm:items-end"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="paidAt" value={iso} />
      <Field>
        <FieldLabel htmlFor={`${paymentId}-amount`}>Monto (MXN)</FieldLabel>
        <Input
          id={`${paymentId}-amount`}
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.currentTarget.value)}
          required
          placeholder="250.00"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${paymentId}-paidAt`}>Fecha del pago</FieldLabel>
        <Input
          id={`${paymentId}-paidAt`}
          type="datetime-local"
          value={paidAt}
          max={localValue(new Date())}
          onChange={(event) => setPaidAt(event.currentTarget.value)}
          required
        />
      </Field>
      <Button disabled={pending} variant={payment ? "outline" : "default"}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? "Guardando…" : payment ? "Corregir" : "Registrar pago"}
      </Button>
      {state.message ? (
        <p role={state.success ? "status" : "alert"} className="text-sm sm:col-span-3">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
