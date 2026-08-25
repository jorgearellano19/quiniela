import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PencilIcon, UsersIcon } from "lucide-react";
import { leaveCompetitionAction } from "@/features/competitions/membership-actions";
import { MembershipActionButton } from "@/features/competitions/membership-action-button";
import { RulesSummary } from "@/features/competitions/rules-summary";
import { getCompetitionDetail } from "@/application/competition/use-cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { competitionRepository } from "@/infrastructure/competition/competition-repository";
export const metadata: Metadata = { title: "Detalle de quiniela · Quiniela" };
export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    requested?: string;
    started?: string;
  }>;
}) {
  const [{ competitionId }, query, actor] = await Promise.all([
    params,
    searchParams,
    requireCompetitionPageActor(),
  ]);
  const detail = await getCompetitionDetail(competitionRepository, actor, competitionId);
  if (!detail) notFound();
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href="/app" className="text-sm underline-offset-4 hover:underline">
        ← Mis quinielas
      </Link>
      {query.created ? (
        <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm">
          Quiniela creada.
        </p>
      ) : null}
      {query.updated ? (
        <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm">
          Configuración guardada.
        </p>
      ) : null}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>{detail.statusLabel}</Badge>
            <Badge variant="outline">{detail.currency}</Badge>
          </div>
          <h1 className="font-heading text-4xl leading-none tracking-tight sm:text-5xl">
            {detail.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.canManageParticipants ? (
            <Button asChild variant="outline">
              <Link href={`/app/competitions/${detail.id}/participants`}>
                <UsersIcon data-icon="inline-start" aria-hidden="true" />
                Participantes
              </Link>
            </Button>
          ) : null}
          {detail.canEdit ? (
            <Button asChild variant="outline">
              <Link href={`/app/competitions/${detail.id}/edit`}>
                <PencilIcon data-icon="inline-start" aria-hidden="true" />
                Editar configuración
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {detail.membershipStatus === "PENDING" && !detail.isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Solicitud pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              La administración revisará tu solicitud. Podrás abrir la quiniela cuando sea
              aprobada.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <RulesSummary typeLabel={detail.typeLabel} statusLabel={detail.statusLabel} />
      {detail.status === "DRAFT" && detail.membershipStatus === "ACTIVE" ? (
        <MembershipActionButton
          action={leaveCompetitionAction.bind(null, detail.id)}
          confirmation={{
            title: "Salir de la quiniela",
            description:
              "Tu participación se retirará. Necesitarás una invitación válida para solicitar acceso de nuevo.",
            confirmLabel: "Salir de la quiniela",
          }}
          label="Salir de esta quiniela"
          pendingLabel="Saliendo…"
          variant="outline"
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Nota de la administración</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {detail.rulesNote ?? "Aún no se agregó una nota de reglas."}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
