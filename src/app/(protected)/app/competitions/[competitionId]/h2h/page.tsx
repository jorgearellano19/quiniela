import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  getH2HMatchups,
  getH2HStandings,
  getH2HStructure,
  getMyH2HMatchup,
} from "@/application/h2h/use-cases";
import { H2HConfigurationForm } from "@/features/h2h/h2h-configuration-form";
import {
  confirmGroupsAction,
  generateLeagueScheduleAction,
  resolveH2HTieAction,
} from "@/features/h2h/h2h-actions";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { h2hRepository } from "@/infrastructure/h2h/h2h-repository";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";

export const metadata: Metadata = { title: "H2H · Quiniela" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const matchupStateLabel = {
  POR_JUGAR: "Por jugar",
  PROVISIONAL: "Provisional",
  FINAL: "Final",
} as const;

export default async function H2HPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const [{ competitionId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const phase = await getH2HStructure({ competitionId }, actor, h2hRepository);
  if (!phase || phase.competition.type === "LEAGUE") notFound();
  const [fixtures, myMatchup, standings] = phase.generated
    ? await Promise.all([
        getH2HMatchups({ competitionId }, actor, h2hRepository, standingsRepository),
        getMyH2HMatchup({ competitionId }, actor, h2hRepository, standingsRepository),
        getH2HStandings({ competitionId }, actor, h2hRepository, standingsRepository),
      ])
    : [[], null, []];
  const names = new Map(
    phase.participants.map((participant) => [participant.id, participant.name]),
  );
  const rivalId = myMatchup?.rival?.id ?? null;
  const myScore = myMatchup?.participant.predictionScore ?? 0;
  const rivalScore = myMatchup?.rival?.predictionScore ?? null;

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm hover:underline"
      >
        ← Volver a la quiniela
      </Link>
      <header className="border-b pb-6">
        <p className="text-sm font-medium text-primary">Fase regular · Cara a cara</p>
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">
          Centro de partidos
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Consulta rivales, descansos y el calendario confirmado. Los marcadores
          aparecerán conforme existan resultados oficiales.
        </p>
      </header>

      {phase.actorIsAdmin && phase.competition.status === "DRAFT" ? (
        <Card>
          <CardHeader>
            <CardTitle>Configura la fase</CardTitle>
            <CardDescription>
              La configuración se congela al iniciar la competencia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <H2HConfigurationForm
              competitionId={competitionId}
              type={phase.competition.type}
              participantCount={phase.participants.length}
            />
          </CardContent>
        </Card>
      ) : null}

      {phase.actorIsAdmin &&
      phase.competition.status === "STARTED" &&
      !phase.generated &&
      phase.configuration ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirmación irreversible</CardTitle>
            <CardDescription>
              Revisa las jornadas antes de confirmar. Los cruces persistidos no se vuelven
              a sortear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {phase.configuration.type === "LEAGUE_PLAYOFFS" ? (
              <form action={generateLeagueScheduleAction.bind(null, competitionId)}>
                <Button type="submit">Confirmar sorteo</Button>
              </form>
            ) : (
              <form
                action={confirmGroupsAction.bind(
                  null,
                  competitionId,
                  phase.configuration.groupSize,
                )}
              >
                <fieldset className="grid gap-3">
                  <legend className="mb-2 font-medium">Asignación manual</legend>
                  {phase.participants.map((participant, participantIndex) => (
                    <label
                      key={participant.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <span className="min-w-0 flex-1">{participant.name}</span>
                      <select
                        name="assignment"
                        defaultValue={`${participant.id}:${Math.floor(
                          participantIndex /
                            (phase.configuration?.type === "GROUP_PLAYOFFS"
                              ? phase.configuration.groupSize
                              : 4),
                        )}`}
                        aria-label={`Grupo de ${participant.name}`}
                        className="h-10 rounded-md border bg-background px-3"
                      >
                        {Array.from(
                          {
                            length:
                              phase.participants.length /
                              (phase.configuration?.type === "GROUP_PLAYOFFS"
                                ? phase.configuration.groupSize
                                : 4),
                          },
                          (_, index) => (
                            <option key={index} value={`${participant.id}:${index}`}>
                              Grupo {String.fromCharCode(65 + index)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  ))}
                  <p className="text-sm text-muted-foreground">
                    Cada grupo debe tener exactamente {phase.configuration.groupSize}{" "}
                    participantes.
                  </p>
                  <Button type="submit">Confirmar grupos</Button>
                </fieldset>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      {myMatchup && phase.currentParticipantId ? (
        <Card className="overflow-hidden border-primary/30 bg-primary text-primary-foreground">
          <CardHeader>
            <CardDescription className="text-primary-foreground/70">
              Tu cruce · {myMatchup.roundLabel}
            </CardDescription>
            <CardTitle className="font-heading text-3xl">
              Tú vs {rivalId ? names.get(rivalId) : "Descanso"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pb-7 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-foreground/15 font-heading text-xl">
                {initials(names.get(phase.currentParticipantId) ?? "Tú")}
              </span>
              <p className="mt-2 font-medium">Tú</p>
            </div>
            <div>
              <Badge variant="secondary">{matchupStateLabel[myMatchup.state]}</Badge>
              <p className="mt-2 font-heading text-4xl tabular-nums">
                {myScore} : {rivalScore ?? "—"}
              </p>
            </div>
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-foreground/15 font-heading text-xl">
                {rivalId ? initials(names.get(rivalId) ?? "Rival") : "—"}
              </span>
              <p className="mt-2 font-medium">
                {rivalId ? names.get(rivalId) : "Descanso"}
              </p>
            </div>
          </CardContent>
          {!rivalId ? (
            <p className="px-6 pb-6 text-sm text-primary-foreground/70">
              Tu Puntaje de pronóstico cuenta para la fase. No recibes puntos H2H y
              CLOSEST_VALUE contra rival usa el promedio elegible.
            </p>
          ) : null}
        </Card>
      ) : null}

      {fixtures.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Calendario</CardTitle>
            <CardDescription>
              Todos los cruces permitidos; los pronósticos privados siguen protegidos
              hasta el cierre de respuestas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-2" aria-label="Calendario H2H">
              {fixtures.map((matchup) => (
                <li key={matchup.id} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {matchup.groupLabel ? `${matchup.groupLabel} · ` : ""}
                      {matchup.roundLabel}
                    </span>
                    <Badge variant="outline">{matchupStateLabel[matchup.state]}</Badge>
                  </div>
                  <p className="flex justify-between font-medium">
                    <span>{matchup.participantA.name}</span>
                    <span>{matchup.participantA.predictionScore}</span>
                  </p>
                  <p className="my-1 text-xs text-muted-foreground">vs</p>
                  <p className="font-medium">
                    {matchup.participantB ? (
                      <span className="flex justify-between">
                        <span>{matchup.participantB.name}</span>
                        <span>{matchup.participantB.predictionScore}</span>
                      </span>
                    ) : (
                      "Descanso"
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyTitle>La fase aún no está confirmada</EmptyTitle>
            <EmptyDescription>
              {phase.actorIsAdmin
                ? "Configura la fase y confirma el sorteo o los grupos antes de publicar las jornadas."
                : "La administración todavía prepara los cruces."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {standings.map((table) => (
        <Card key={table.groupId ?? "league"}>
          <CardHeader>
            <CardTitle>{table.groupLabel ?? "Clasificación H2H"}</CardTitle>
            <CardDescription>
              {table.readiness === "OFFICIAL"
                ? "Clasificación oficial"
                : table.readiness === "PENDING_RESOLUTION"
                  ? "Requiere desempate de la administración"
                  : "Clasificación provisional"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol
              className="grid gap-2"
              aria-label={table.groupLabel ?? "Clasificación H2H"}
            >
              {table.rows.map((row) => (
                <li
                  key={row.participantId}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border p-3"
                >
                  <span className="font-heading text-2xl tabular-nums">
                    {row.position}
                  </span>
                  <div>
                    <p className="font-medium">{row.participantName}</p>
                    <p className="text-xs text-muted-foreground">
                      PJ {row.played} · PG {row.wins} · Pronóstico {row.predictionScore}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading text-2xl tabular-nums">{row.h2hPoints}</p>
                    <p className="text-xs">
                      {row.qualification === "OFICIAL"
                        ? "Clasifica"
                        : row.qualification === "PROVISIONAL"
                          ? "Zona provisional"
                          : "Fuera"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {phase.actorIsAdmin && table.decisionGroups.length ? (
              <div className="mt-5 grid gap-4 border-t pt-5">
                {table.decisionGroups.map((group, groupIndex) => (
                  <form
                    key={group.join(":")}
                    action={resolveH2HTieAction.bind(null, competitionId, table.groupId)}
                    className="grid gap-3 rounded-xl bg-muted/40 p-4"
                  >
                    <fieldset className="grid gap-3">
                      <legend className="font-medium">
                        Orden del desempate {groupIndex + 1}
                      </legend>
                      {group.map((_, position) => (
                        <label key={position} className="grid gap-1 text-sm">
                          Posición {position + 1}
                          <select
                            name="participantIds"
                            defaultValue={group[position]}
                            className="h-10 rounded-md border bg-background px-3"
                          >
                            {group.map((participantId) => (
                              <option key={participantId} value={participantId}>
                                {table.rows.find(
                                  (row) => row.participantId === participantId,
                                )?.participantName ?? "Participante"}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </fieldset>
                    <Button type="submit">Guardar desempate</Button>
                  </form>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {phase.drawOrder.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Orden del sorteo</CardTitle>
            <CardDescription>
              Este orden es visible, persistente y no cambia al reintentar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 sm:grid-cols-2">
              {phase.drawOrder.map((id, index) => (
                <li key={id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="font-heading text-2xl tabular-nums">{index + 1}</span>
                  <span>{names.get(id)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
