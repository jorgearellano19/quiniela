import Link from "next/link";
import { notFound } from "next/navigation";
import { TrophyIcon } from "lucide-react";
import { getPlayoffOverview } from "@/application/playoff/use-cases";
import { getH2HStandings } from "@/application/h2h/use-cases";
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
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { PlayoffRoundForm } from "@/features/playoffs/playoff-round-form";
import {
  advancePlayoffRoundAction,
  generatePlayoffBracketAction,
} from "@/features/playoffs/playoff-actions";
import { h2hRepository } from "@/infrastructure/h2h/h2h-repository";
import { playoffRepository } from "@/infrastructure/playoff/playoff-repository";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";

export default async function PlayoffsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const [{ competitionId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const overview = await getPlayoffOverview(playoffRepository, actor, competitionId);
  if (!overview) notFound();
  const tables =
    overview.rounds.length > 0 && overview.seeds.length === 0 && overview.actorIsAdmin
      ? await getH2HStandings(
          { competitionId },
          actor,
          h2hRepository,
          standingsRepository,
        )
      : [];
  const qualifiers = tables
    .flatMap((table) => table.rows.filter((row) => row.qualification === "OFICIAL"))
    .sort(
      (a, b) =>
        b.predictionScore - a.predictionScore || b.exactScorePoints - a.exactScorePoints,
    );
  const expectedRoundCount = overview.seeds.length ? Math.log2(overview.seeds.length) : 0;
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-7">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm hover:underline"
      >
        ← Volver a la quiniela
      </Link>
      <header className="relative overflow-hidden rounded-3xl bg-primary px-5 py-8 text-primary-foreground sm:px-8">
        <div
          className="absolute top-0 right-0 font-heading text-[9rem] leading-none opacity-10"
          aria-hidden="true"
        >
          {overview.seeds.length || qualifiers.length}
        </div>
        <p className="text-sm font-semibold tracking-[0.18em] uppercase opacity-70">
          Eliminación · cuadro oficial
        </p>
        <h1 className="mt-2 max-w-2xl font-heading text-4xl leading-none sm:text-6xl">
          El camino al campeonato
        </h1>
        <p className="mt-4 max-w-xl text-sm text-primary-foreground/75">
          Cada etapa vuelve a enfrentar la mejor siembra disponible contra la más baja.
        </p>
      </header>
      {overview.champion ? (
        <Card className="border-primary/30 bg-secondary">
          <CardHeader>
            <TrophyIcon aria-hidden="true" className="text-primary" />
            <CardDescription>Campeón oficial</CardDescription>
            <CardTitle className="font-heading text-4xl">
              {overview.champion.name}
            </CardTitle>
          </CardHeader>
        </Card>
      ) : null}
      {overview.rounds.length === 0 && overview.actorIsAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Configura la primera etapa</CardTitle>
            <CardDescription>
              Crea la ronda antes de fijar las siembras oficiales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlayoffRoundForm competitionId={competitionId} />
          </CardContent>
        </Card>
      ) : null}
      {overview.rounds.length === 0 && !overview.actorIsAdmin ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>El cuadro aún no está listo</EmptyTitle>
            <EmptyDescription>
              Cuando la administración confirme la primera etapa aparecerá aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {overview.rounds.length > 0 &&
      overview.seeds.length === 0 &&
      overview.actorIsAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirma las siembras</CardTitle>
            <CardDescription>
              El orden respeta Puntaje de pronóstico y Marcadores exactos. Cambia
              únicamente participantes empatados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={generatePlayoffBracketAction.bind(
                null,
                competitionId,
                overview.rounds[0]!.id,
              )}
              className="grid gap-3"
            >
              {qualifiers.map((row, index) => (
                <label
                  key={`${index}-${row.participantId}`}
                  className="grid grid-cols-[2rem_1fr] items-center gap-3 rounded-xl border p-3"
                >
                  <span className="font-heading text-xl">{index + 1}</span>
                  <select
                    name="seedOrder"
                    defaultValue={row.participantId}
                    className="h-10 min-w-0 rounded-md border bg-background px-3"
                    aria-label={`Siembra ${index + 1}`}
                  >
                    {qualifiers.map((item) => (
                      <option key={item.participantId} value={item.participantId}>
                        {item.participantName} · {item.predictionScore} pts ·{" "}
                        {item.exactScorePoints} exactos
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <Button disabled={!qualifiers.length}>Fijar cuadro oficial</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {overview.actorIsAdmin &&
      overview.seeds.length > 0 &&
      overview.rounds.length < expectedRoundCount ? (
        <Card>
          <CardHeader>
            <CardTitle>Configura la siguiente etapa</CardTitle>
            <CardDescription>
              Déjala lista antes de confirmar el avance de la etapa anterior.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlayoffRoundForm
              competitionId={competitionId}
              defaults={{
                sequence: overview.rounds.length + 1,
                name:
                  overview.rounds.length + 1 === expectedRoundCount
                    ? "Final"
                    : `Etapa ${overview.rounds.length + 1}`,
              }}
            />
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6">
        {overview.rounds.map((round) => (
          <section key={round.id} className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Etapa {round.sequence}
                </p>
                <h2 className="font-heading text-3xl">{round.name}</h2>
              </div>
              <div className="flex gap-2">
                <Badge>{round.status}</Badge>
                {overview.actorIsAdmin ? (
                  <Button asChild variant="outline">
                    <Link
                      href={`/app/competitions/${competitionId}/playoffs/${round.id}`}
                    >
                      Administrar
                    </Link>
                  </Button>
                ) : null}
                {overview.currentParticipantId &&
                round.status !== "DRAFT" &&
                round.matchups.some(
                  (item) =>
                    item.participantAId === overview.currentParticipantId ||
                    item.participantBId === overview.currentParticipantId,
                ) ? (
                  <Button asChild>
                    <Link
                      href={`/app/competitions/${competitionId}/playoffs/${round.id}/answers`}
                    >
                      Pronosticar
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {round.matchups.map((matchup) => (
                <Card key={matchup.id} className="overflow-hidden">
                  <div className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 border-b px-4 py-3">
                    <span className="font-heading text-2xl text-muted-foreground">
                      {matchup.participantASeed}
                    </span>
                    <span className="font-medium">{matchup.participantAName}</span>
                    {matchup.winnerParticipantId === matchup.participantAId ? (
                      <Badge>Avanza</Badge>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 px-4 py-3">
                    <span className="font-heading text-2xl text-muted-foreground">
                      {matchup.participantBSeed}
                    </span>
                    <span className="font-medium">{matchup.participantBName}</span>
                    {matchup.winnerParticipantId === matchup.participantBId ? (
                      <Badge>Avanza</Badge>
                    ) : null}
                  </div>
                </Card>
              ))}
              {round.matchups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Los cruces aparecerán cuando avance la etapa anterior.
                </p>
              ) : null}
            </div>
            {overview.actorIsAdmin &&
            round.status === "FINALIZED" &&
            !round.advancementConfirmed ? (
              <form
                action={advancePlayoffRoundAction.bind(null, competitionId, round.id)}
              >
                <Button>Confirmar avance</Button>
              </form>
            ) : null}
          </section>
        ))}
      </div>
    </section>
  );
}
