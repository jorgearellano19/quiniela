import Link from "next/link";
import { notFound } from "next/navigation";
import type { RoundResultsDetail } from "@/application/scoring/use-cases";
import { getRoundResults } from "@/application/scoring/use-cases";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/features/rounds/local-date-time";
import { JudgmentControls, OfficialResultForm } from "@/features/results/result-controls";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { resultRepository } from "@/infrastructure/scoring/result-repository";

type Question = RoundResultsDetail["questions"][number];
type Entry = Question["entries"][number];

const statusLabel = {
  ACTIVE: "Activa",
  FINISHED: "En corrección",
  FINALIZED: "Finalizada",
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
} as const;

function title(question: Question) {
  return question.type === "MATCH_SCORE" && "homeLabel" in question
    ? `${question.homeLabel} vs ${question.awayLabel}`
    : question.prompt;
}

function valueLabel(question: Question, value: Entry["answer"] | Question["result"]) {
  if (!value) return "Sin pronóstico";
  if (value.type === "MATCH_SCORE") return `${value.homeScore} – ${value.awayScore}`;
  if (value.type === "OPTIONS")
    return "options" in question
      ? (question.options.find((option) => option.id === value.optionId)?.label ??
          "Opción registrada")
      : "Opción registrada";
  return value.value;
}

function scoreLabel(entry: Entry) {
  if (!entry.score || entry.score.state === "PENDING") return "Pendiente";
  return `${entry.score.points} ${entry.score.points === 1 ? "punto" : "puntos"}`;
}

export default async function RoundResultsPage({
  params,
}: {
  params: Promise<{ competitionId: string; roundId: string }>;
}) {
  const [{ competitionId, roundId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const value = await getRoundResults(resultRepository, actor, competitionId, roundId);
  if (!value) notFound();
  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm hover:underline"
      >
        ← Volver a la quiniela
      </Link>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">
            Resultados · Jornada {value.sequence}
          </p>
          <h1 className="font-heading text-4xl tracking-tight">{value.name}</h1>
        </div>
        <Badge variant={value.status === "FINALIZED" ? "outline" : "secondary"}>
          {statusLabel[value.status]}
        </Badge>
      </div>
      {value.correctionEndsAt && value.status === "FINISHED" ? (
        <p role="status" className="rounded-2xl bg-secondary p-4 text-sm">
          Las correcciones cierran <LocalDateTime value={value.correctionEndsAt} />.
        </p>
      ) : null}
      <Card className="overflow-hidden border-primary/20">
        <CardHeader>
          <CardTitle>Marcador parcial</CardTitle>
          <p className="text-sm text-muted-foreground">
            Solo suma preguntas con resultado completo. El orden alfabético no representa
            una clasificación.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Puntajes parciales">
            {value.participants.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3"
              >
                <span className="font-medium">{participant.name}</span>
                <span className="font-heading text-2xl tabular-nums">
                  {participant.total}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="grid gap-5">
        {value.questions.map((question) => (
          <Card key={question.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary">Pregunta {question.sequence}</Badge>
                <Badge variant="outline">{question.closed ? "Cerrada" : "Abierta"}</Badge>
              </div>
              <CardTitle className="font-heading text-2xl">{title(question)}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cierra <LocalDateTime value={question.deadlineAt} />
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {!question.closed ? (
                <p className="text-sm text-muted-foreground">
                  Los pronósticos de otras personas permanecen privados hasta el cierre.
                </p>
              ) : question.type !== "OPEN_TEXT" ? (
                <div className="rounded-xl bg-secondary px-4 py-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Resultado oficial
                  </p>
                  <p className="mt-1 font-heading text-2xl">
                    {question.result
                      ? valueLabel(question, question.result)
                      : "Resultado pendiente"}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  La pregunta queda completa cuando todos los pronósticos reciben juicio.
                </p>
              )}
              {question.entries.length ? (
                <ul
                  className="flex flex-col gap-3"
                  aria-label="Pronósticos de participantes"
                >
                  {question.entries.map((entry) => (
                    <li key={entry.participantId} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{entry.participantName}</p>
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {valueLabel(question, entry.answer)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            entry.score?.state === "SCORED" && entry.score.points! < 0
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {scoreLabel(entry)}
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
                            roundId={roundId}
                            answerId={entry.answerId}
                            value={entry.judgment}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún no hay pronósticos visibles.
                </p>
              )}
              {value.canManage &&
              value.status !== "FINALIZED" &&
              question.closed &&
              question.type !== "OPEN_TEXT" ? (
                <div className="border-t pt-5">
                  <OfficialResultForm
                    competitionId={competitionId}
                    roundId={roundId}
                    question={question}
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
