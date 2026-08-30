import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFinalCompetitionResults } from "@/application/prize/use-cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { completeCompetitionAction } from "@/features/prizes/completion-actions";
import { TieResolutionForm } from "@/features/standings/tie-resolution-form";
import { paymentRepository } from "@/infrastructure/payment/payment-repository";
import { playoffRepository } from "@/infrastructure/playoff/playoff-repository";
import { standingsRepository } from "@/infrastructure/standings/standings-repository";

export const metadata: Metadata = { title: "Resultados finales · Quiniela" };

const labels = {
  ROUND_WINNER: "Ganador de jornada",
  LEAGUE_WINNER: "Ganador de liga",
  LEAGUE_PHASE_WINNER: "Ganador de fase regular",
  PLAYOFF_CHAMPION: "Campeón de eliminatorias",
} as const;

function winnerText(value: { state: string; winner?: { name: string } }) {
  if (value.state === "resolved") return value.winner!.name;
  if (value.state === "unresolved") return "Requiere desempate administrativo";
  return "Pendiente";
}

export default async function FinalResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ competitionId: string }>;
  searchParams: Promise<{ completed?: string }>;
}) {
  const [{ competitionId }, query, actor] = await Promise.all([
    params,
    searchParams,
    requireCompetitionPageActor(),
  ]);
  const results = await getFinalCompetitionResults(
    paymentRepository,
    standingsRepository,
    playoffRepository,
    actor,
    competitionId,
  );
  if (!results) notFound();
  const money = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: results.competition.currency,
  });
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-hidden">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        ← Volver a la quiniela
      </Link>
      {query.completed ? (
        <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm">
          La quiniela quedó completada y sus resultados son de solo lectura.
        </p>
      ) : null}
      <header className="grid gap-3 border-b pb-6">
        <Badge className="w-fit">
          {results.competition.status === "COMPLETED"
            ? "Completada"
            : "Resultados finales"}
        </Badge>
        <h1 className="font-heading text-4xl leading-none tracking-tight sm:text-5xl">
          {results.competition.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ganador final:{" "}
          <strong className="text-foreground">{winnerText(results.finalWinner)}</strong>
        </p>
      </header>
      {results.prizes.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {results.prizes.map((prize) => (
            <Card
              key={`${prize.configuration.type}-${prize.roundId ?? "final"}`}
              className="min-w-0"
            >
              <CardHeader>
                <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                  {prize.roundName ?? labels[prize.configuration.type]}
                </p>
                <CardTitle className="break-words">{winnerText(prize.winner)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-2xl">
                  {money.format(prize.configuration.amount / 100)}
                </p>
                {prize.winner.state === "unresolved" && results.canManage ? (
                  prize.configuration.type === "LEAGUE_PHASE_WINNER" &&
                  prize.tiedParticipants ? (
                    <div className="mt-4">
                      <TieResolutionForm
                        competitionId={competitionId}
                        scope="LEAGUE_PHASE_PRIZE"
                        roundId={null}
                        participants={prize.tiedParticipants}
                      />
                    </div>
                  ) : (
                    <Link
                      className="mt-3 inline-block text-sm underline"
                      href={
                        prize.roundId
                          ? `/app/competitions/${competitionId}/rounds/${prize.roundId}/results`
                          : `/app/competitions/${competitionId}/standings`
                      }
                    >
                      Resolver desempate
                    </Link>
                  )
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No hay premios configurados.</p>
      )}
      {results.canManage && results.competition.status === "STARTED" ? (
        <Card>
          <CardHeader>
            <CardTitle>Completar quiniela</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {results.completion.ready ? (
              <form
                action={completeCompetitionAction.bind(null, competitionId)}
                className="grid gap-4"
              >
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    required
                    className="mt-0.5 size-4 accent-primary"
                  />
                  Confirmo que los resultados y ganadores mostrados son definitivos.
                </label>
                <Button className="w-full sm:w-fit">Completar quiniela</Button>
              </form>
            ) : (
              <ul className="grid gap-2 text-sm text-muted-foreground">
                {results.completion.blockers.map((blocker) => (
                  <li key={blocker}>• {blocker}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
