import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheckIcon, CircleDollarSignIcon, LockKeyholeIcon } from "lucide-react";
import { getCompetitionPaymentStatus, getMyDebt } from "@/application/payment/use-cases";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import {
  PaymentConfigurationForm,
  PaymentEntryForm,
} from "@/features/payments/payment-forms";
import { LocalDateTime } from "@/features/rounds/local-date-time";
import { paymentRepository } from "@/infrastructure/payment/payment-repository";

export const metadata: Metadata = { title: "Pagos · Quiniela" };

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});
const amount = (minor: number) => currency.format(minor / 100);

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const [{ competitionId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const admin = await getCompetitionPaymentStatus(
    paymentRepository,
    actor,
    competitionId,
  );
  const value = admin ?? (await getMyDebt(paymentRepository, actor, competitionId));
  if (!value || value.competition.type === "GROUP_PLAYOFFS") notFound();
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm hover:underline"
      >
        ← Volver a la quiniela
      </Link>
      <div className="grid gap-4 border-b pb-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Control de cuotas</p>
          <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">
            Pagos y saldo
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Registro manual en {value.competition.currency}. No se procesan cobros desde
            Quiniela.
          </p>
        </div>
        <Badge variant={value.competition.paymentsEnabled ? "default" : "outline"}>
          {value.competition.paymentsEnabled ? "Cuotas activas" : "Sin cuotas"}
        </Badge>
      </div>
      {value.canManage && value.competition.status === "DRAFT" ? (
        <Card className="border-primary/25">
          <CardHeader>
            <CardTitle>Reglas de pagos</CardTitle>
            <CardDescription>
              Configura cuotas, deuda máxima y premio antes de iniciar. Al publicar una
              jornada se crea un cargo para cada participante activo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentConfigurationForm
              competitionId={competitionId}
              value={value.competition}
            />
          </CardContent>
        </Card>
      ) : null}
      {!value.participants.length ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyTitle>Aún no hay información de pago</EmptyTitle>
            <EmptyDescription>
              Las obligaciones aparecen al publicar una jornada con cuotas activas.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-5">
          {value.participants.map((participant) => (
            <Card key={participant.participantId} className="overflow-hidden">
              <CardHeader className="bg-muted/45">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-heading text-2xl">
                      {participant.name}
                    </CardTitle>
                    {value.canManage ? (
                      <CardDescription>{participant.email}</CardDescription>
                    ) : null}
                  </div>
                  <Badge variant={participant.restricted ? "destructive" : "secondary"}>
                    {participant.restricted ? (
                      <LockKeyholeIcon aria-hidden="true" />
                    ) : (
                      <CircleCheckIcon aria-hidden="true" />
                    )}
                    {participant.restricted ? "Restringido" : "Elegible"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-6 pt-(--card-spacing)">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Cargos", participant.owed],
                    ["Pagado", participant.paid],
                    [
                      participant.balance < 0 ? "Crédito" : "Saldo",
                      Math.abs(participant.balance),
                    ],
                  ].map(([label, total]) => (
                    <div key={String(label)} className="rounded-xl bg-muted p-3">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-heading text-lg tabular-nums sm:text-2xl">
                        {amount(Number(total))}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <h2 className="mb-3 text-sm font-semibold">Obligaciones</h2>
                    {participant.obligations.length ? (
                      <ul className="grid gap-2">
                        {participant.obligations.map((item) => (
                          <li
                            key={item.id}
                            className="flex justify-between gap-3 rounded-xl border p-3 text-sm"
                          >
                            <span>
                              Jornada {item.roundSequence} · {item.roundName}
                            </span>
                            <strong className="tabular-nums">
                              {amount(item.amount)}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aún no hay cargos.</p>
                    )}
                  </div>
                  <div>
                    <h2 className="mb-3 text-sm font-semibold">Pagos registrados</h2>
                    {participant.payments.length ? (
                      <ul className="grid gap-3">
                        {participant.payments.map((item) => (
                          <li key={item.id} className="rounded-xl border p-3">
                            <div className="mb-3 flex justify-between gap-3 text-sm">
                              <span>
                                <LocalDateTime value={item.paidAt.toISOString()} />
                              </span>
                              <strong>{amount(item.amount)}</strong>
                            </div>
                            {value.canManage && value.competition.status === "STARTED" ? (
                              <PaymentEntryForm
                                competitionId={competitionId}
                                participantId={participant.participantId}
                                payment={item}
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aún no hay pagos.</p>
                    )}
                  </div>
                </div>
                {value.canManage &&
                value.competition.status === "STARTED" &&
                value.competition.paymentsEnabled ? (
                  <div className="rounded-2xl border border-primary/20 bg-secondary p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <CircleDollarSignIcon
                        className="size-5 text-primary"
                        aria-hidden="true"
                      />
                      <h2 className="font-semibold">Registrar pago</h2>
                    </div>
                    <PaymentEntryForm
                      competitionId={competitionId}
                      participantId={participant.participantId}
                      newPaymentId={randomUUID()}
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
