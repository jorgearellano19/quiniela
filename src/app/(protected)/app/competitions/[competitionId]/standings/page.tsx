import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrophyIcon } from "lucide-react";
import { getLeagueStandings } from "@/application/standings/use-cases";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { TieResolutionForm } from "@/features/standings/tie-resolution-form";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";

export const metadata: Metadata = { title: "Clasificación · Quiniela" };

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const [{ competitionId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const standings = await getLeagueStandings(standingsRepository, actor, competitionId);
  if (!standings) notFound();

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm hover:underline"
      >
        ← Volver a la quiniela
      </Link>
      <header className="grid gap-3 border-b pb-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Liga · Resultados acumulados</p>
          <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">
            Clasificación
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            La tabla se recalcula con cada resultado oficial. Los empates siguen
            únicamente los criterios aprobados.
          </p>
        </div>
        <Badge variant={standings.ready ? "secondary" : "outline"}>
          {standings.ready ? "Actualizada y estable" : "En curso"}
        </Badge>
      </header>

      {standings.winner ? (
        <Card className="overflow-hidden border-primary/30 bg-primary text-primary-foreground">
          <CardHeader>
            <p className="text-xs uppercase tracking-widest opacity-75">Ganador actual</p>
            <CardTitle className="flex items-center gap-2 font-heading text-3xl">
              <TrophyIcon aria-hidden="true" />
              {standings.winner.name}
            </CardTitle>
            <CardDescription className="text-primary-foreground/75">
              M11 bloqueará este resultado al completar la quiniela.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : standings.ready && standings.unresolvedGroups.length ? (
        <Alert>
          <TrophyIcon aria-hidden="true" />
          <AlertTitle>Hay posiciones empatadas</AlertTitle>
          <AlertDescription>
            La administración debe ordenar cada grupo que siga igual después de aplicar
            los criterios de la liga.
          </AlertDescription>
        </Alert>
      ) : null}

      {standings.rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Tabla general</CardTitle>
            <CardDescription>
              Puntaje de pronóstico y puntos obtenidos por marcador exacto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2" aria-label="Clasificación de la liga">
              {standings.rows.map((row) => (
                <li
                  key={row.participantId}
                  className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-xl border p-3 sm:grid-cols-[4rem_1fr_8rem_8rem]"
                >
                  <span
                    className="font-heading text-3xl tabular-nums"
                    aria-label={`Posición ${row.position}`}
                  >
                    {row.position}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {row.participantName}
                    </span>
                    {row.unresolved ? <Badge variant="outline">Empate</Badge> : null}
                  </span>
                  <span className="text-right sm:text-left">
                    <span className="block font-heading text-2xl tabular-nums">
                      {row.predictionScore}
                    </span>
                    <span className="text-xs text-muted-foreground">puntos</span>
                  </span>
                  <span className="col-start-2 text-sm text-muted-foreground sm:col-start-auto">
                    {row.exactScorePoints} por marcador exacto
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyTitle>Aún no hay clasificación</EmptyTitle>
            <EmptyDescription>
              Cuando la quiniela inicie y haya jornadas publicadas, los puntajes
              aparecerán aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {standings.canManage && standings.ready
        ? standings.decisionGroups.map((group, index) => (
            <Card key={group.participantIds.join(":")}>
              <CardHeader>
                <CardTitle>
                  {group.resolved ? "Corregir" : "Resolver"} empate {index + 1}
                </CardTitle>
                <CardDescription>
                  El orden manual se conserva con actor, fecha y revisión de datos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TieResolutionForm
                  competitionId={competitionId}
                  scope="LEAGUE_STANDINGS"
                  roundId={null}
                  participants={group.participantIds.map((id) => {
                    const row = standings.rows.find((item) => item.participantId === id)!;
                    return { id, name: row.participantName, adminLabel: row.adminLabel };
                  })}
                />
              </CardContent>
            </Card>
          ))
        : null}
    </section>
  );
}
