import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { getCompetitionDetail } from "@/application/competition/use-cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { competitionRepository } from "@/infrastructure/competition/competition-repository";
export const metadata: Metadata = { title: "Detalle de quiniela · Quiniela" };
export default async function CompetitionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const [{ competitionId }, query, actor] = await Promise.all([
    params,
    searchParams,
    requireCompetitionPageActor(),
  ]);
  const detail = await getCompetitionDetail(
    competitionRepository,
    actor,
    competitionId,
  );
  if (!detail)
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>Quiniela no disponible</EmptyTitle>
          <EmptyDescription>
            No encontramos una quiniela que puedas consultar. Vuelve a tu lista
            para continuar.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <Link href="/app">Volver a mis quinielas</Link>
        </Button>
      </Empty>
    );
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
        {detail.canEdit ? (
          <Button asChild variant="outline">
            <Link href={`/app/competitions/${detail.id}/edit`}>
              <PencilIcon data-icon="inline-start" aria-hidden="true" />
              Editar configuración
            </Link>
          </Button>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Resumen de reglas</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Formato
              </dt>
              <dd className="mt-1 font-medium">{detail.typeLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Estado
              </dt>
              <dd className="mt-1 font-medium">{detail.statusLabel}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Moneda
              </dt>
              <dd className="mt-1 font-medium">Peso mexicano (MXN)</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
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
