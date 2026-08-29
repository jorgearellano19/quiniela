import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRoundResults,
  type RoundResultsDetail,
} from "@/application/scoring/use-cases";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { JudgmentControls, OfficialResultForm } from "@/features/results/result-controls";
import { LocalDateTime } from "@/features/rounds/local-date-time";
import { playoffResultRepository } from "@/infrastructure/scoring/result-repository";
import { getPlayoffOverview } from "@/application/playoff/use-cases";
import { resolvePlayoffWinner } from "@/domain/playoff/playoff";
import { playoffRepository } from "@/infrastructure/playoff/playoff-repository";
import { ManualTieForm } from "@/features/playoffs/manual-tie-form";

type Question = RoundResultsDetail["questions"][number];
function title(question: Question) {
  return question.type === "MATCH_SCORE" && "homeLabel" in question
    ? `${question.homeLabel} vs ${question.awayLabel}`
    : question.prompt;
}
function label(
  question: Question,
  value: Question["result"] | Question["entries"][number]["answer"],
) {
  if (!value) return "Sin pronóstico";
  if (value.type === "MATCH_SCORE") return `${value.homeScore} – ${value.awayScore}`;
  if (value.type === "OPTIONS" && "options" in question)
    return question.options.find((item) => item.id === value.optionId)?.label ?? "Opción";
  return "value" in value ? value.value : "Opción";
}

export default async function PlayoffResultsPage({
  params,
}: {
  params: Promise<{ competitionId: string; playoffRoundId: string }>;
}) {
  const [{ competitionId, playoffRoundId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const [value, overview] = await Promise.all([
    getRoundResults(playoffResultRepository, actor, competitionId, playoffRoundId),
    getPlayoffOverview(playoffRepository, actor, competitionId),
  ]);
  if (!value || !overview) notFound();
  const configured = overview.rounds.find((item) => item.id === playoffRoundId);
  if (!configured) notFound();
  const matchups = configured.matchups;
  const totals = new Map(value.participants.map((item) => [item.id, item.total]));
  const tiebreaker = value.questions.find(
    (item) => item.id === configured.tiebreakerQuestionId,
  );
  const decisions = matchups.map((matchup) => ({
    matchup,
    decision: resolvePlayoffWinner({
      participantAId: matchup.participantAId,
      participantASeed: matchup.participantASeed,
      participantAScore: totals.get(matchup.participantAId) ?? 0,
      participantATiebreakerPoints:
        tiebreaker?.entries.find((item) => item.participantId === matchup.participantAId)
          ?.score?.points ?? 0,
      participantBId: matchup.participantBId,
      participantBSeed: matchup.participantBSeed,
      participantBScore: totals.get(matchup.participantBId) ?? 0,
      participantBTiebreakerPoints:
        tiebreaker?.entries.find((item) => item.participantId === matchup.participantBId)
          ?.score?.points ?? 0,
      mode: configured.advancementMode,
      manualWinnerId:
        matchup.winnerDecidedBy === "MANUAL" ? matchup.winnerParticipantId : null,
    }),
  }));
  const unresolved = decisions
    .filter((item) => item.decision.state === "UNRESOLVED")
    .map((item) => item.matchup);
  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}/playoffs`}
        className="text-sm hover:underline"
      >
        ← Volver al cuadro
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">
            Resultados · Etapa {value.sequence}
          </p>
          <h1 className="font-heading text-4xl">{value.name}</h1>
        </div>
        <Badge>{value.status}</Badge>
      </div>
      {value.correctionEndsAt && value.status === "FINISHED" ? (
        <p role="status" className="rounded-2xl bg-secondary p-4 text-sm">
          El cuadro muestra ganadores provisionales. Las correcciones cierran{" "}
          <LocalDateTime value={value.correctionEndsAt} />.
        </p>
      ) : null}
      {["FINISHED", "FINALIZED"].includes(value.status) ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {value.status === "FINISHED" ? "Avance provisional" : "Avance calculado"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {decisions.map(({ matchup, decision }) => (
                <li key={matchup.id} className="rounded-xl border p-3 text-sm">
                  {decision.state === "WINNER"
                    ? `Avanza ${
                        decision.participantId === matchup.participantAId
                          ? matchup.participantAName
                          : matchup.participantBName
                      }`
                    : `${matchup.participantAName} vs ${matchup.participantBName}: requiere decisión manual`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {value.canManage &&
      ["FINISHED", "FINALIZED"].includes(value.status) &&
      unresolved.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Empates por resolver</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {unresolved.map((matchup) => (
              <ManualTieForm
                key={matchup.id}
                competitionId={competitionId}
                playoffRoundId={playoffRoundId}
                matchupId={matchup.id}
                participantA={{
                  id: matchup.participantAId,
                  name: matchup.participantAName,
                }}
                participantB={{
                  id: matchup.participantBId,
                  name: matchup.participantBName,
                }}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Marcador de la etapa</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {value.participants.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-muted px-4 py-3"
              >
                <span>{item.name}</span>
                <span className="font-heading text-2xl">{item.total}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="grid gap-5">
        {value.questions.map((question) => (
          <Card key={question.id}>
            <CardHeader>
              <div className="flex justify-between gap-2">
                <Badge variant="secondary">Pregunta {question.sequence}</Badge>
                <Badge variant="outline">{question.closed ? "Cerrada" : "Abierta"}</Badge>
              </div>
              <CardTitle className="font-heading text-2xl">{title(question)}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {question.closed && question.type !== "OPEN_TEXT" ? (
                <div className="rounded-xl bg-secondary p-4">
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    Resultado oficial
                  </p>
                  <p className="font-heading text-2xl">
                    {label(question, question.result)}
                  </p>
                </div>
              ) : null}
              <ul className="grid gap-2">
                {question.entries.map((entry) => (
                  <li key={entry.participantId} className="rounded-xl border p-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{entry.participantName}</p>
                        <p className="text-sm text-muted-foreground">
                          {label(question, entry.answer)}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {entry.score?.state === "SCORED"
                          ? `${entry.score.points} pts`
                          : "Pendiente"}
                      </Badge>
                    </div>
                    {value.canManage &&
                    value.status !== "FINALIZED" &&
                    question.closed &&
                    question.type === "OPEN_TEXT" &&
                    entry.answerId ? (
                      <div className="mt-4">
                        <JudgmentControls
                          competitionId={competitionId}
                          roundId={playoffRoundId}
                          answerId={entry.answerId}
                          value={entry.judgment}
                          context="playoff"
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {value.canManage &&
              value.status !== "FINALIZED" &&
              question.closed &&
              question.type !== "OPEN_TEXT" ? (
                <div className="border-t pt-4">
                  <OfficialResultForm
                    competitionId={competitionId}
                    roundId={playoffRoundId}
                    question={question}
                    context="playoff"
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
