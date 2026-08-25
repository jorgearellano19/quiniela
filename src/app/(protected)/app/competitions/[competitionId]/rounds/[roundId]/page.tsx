import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoundEditor } from "@/application/round/use-cases";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoundSettingsForm } from "@/features/rounds/round-editor-forms";
import { RoundConfirmButton } from "@/features/rounds/round-confirm-button";
import { LocalDateTime } from "@/features/rounds/local-date-time";
import { deleteRoundAction, publishRoundAction } from "@/features/rounds/round-actions";
import { QuestionWorkspace } from "@/features/rounds/question-workspace";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { roundRepository } from "@/infrastructure/round/round-repository";
export default async function RoundEditorPage({
  params,
}: {
  params: Promise<{ competitionId: string; roundId: string }>;
}) {
  const [{ competitionId, roundId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const value = await getRoundEditor(roundRepository, actor, competitionId, roundId);
  if (!value) notFound();
  const publicationIssues = [
    value.competitionStatus !== "STARTED"
      ? "Primero inicia la quiniela desde Participantes."
      : null,
    !value.questions.length ? "Agrega al menos una pregunta." : null,
    value.questions.some((question) => new Date(question.deadlineAt) <= new Date())
      ? "Corrige las preguntas cuyo cierre ya pasó."
      : null,
  ].filter((issue): issue is string => Boolean(issue));
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}/rounds`}
        className="text-sm hover:underline"
      >
        ← Jornadas
      </Link>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge>{value.status === "ACTIVE" ? "Activa" : "Borrador"}</Badge>
          <h1 className="mt-3 font-heading text-4xl tracking-tight">{value.name}</h1>
        </div>
        {value.publishedAt ? (
          <p className="text-xs text-muted-foreground">
            Publicada <LocalDateTime value={value.publishedAt} />
          </p>
        ) : null}
      </div>
      {value.readOnly ? (
        <p role="status" className="rounded-2xl bg-secondary p-4 text-sm">
          Esta jornada está activa y su configuración quedó congelada.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Ajustes de jornada</CardTitle>
          </CardHeader>
          <CardContent>
            <RoundSettingsForm competitionId={competitionId} value={value} />
            <div className="mt-6 border-t pt-6">
              <RoundConfirmButton
                action={deleteRoundAction.bind(null, competitionId, roundId)}
                label="Eliminar jornada"
                title="Eliminar jornada en borrador"
                description="Se eliminarán la jornada y todas sus preguntas. Esta acción no se puede deshacer."
                variant="destructive"
                successHref={`/app/competitions/${competitionId}/rounds`}
              />
            </div>
          </CardContent>
        </Card>
      )}
      <QuestionWorkspace
        key={JSON.stringify(value.questions)}
        competitionId={competitionId}
        roundId={roundId}
        questions={value.questions}
        scoringDefaults={value.scoringDefaults}
        readOnly={value.readOnly}
      />
      {!value.readOnly ? (
        <>
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>Revisión de publicación</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Publicar congela ajustes y preguntas. Todas las fechas de cierre deben
                estar en el futuro.
              </p>
              {publicationIssues.length ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium">Antes de publicar:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {publicationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  La jornada está lista para publicarse.
                </p>
              )}
              <RoundConfirmButton
                action={publishRoundAction.bind(null, competitionId, roundId)}
                label="Publicar y abrir jornada"
                title="Publicar jornada"
                description="La configuración quedará congelada y las preguntas se abrirán hasta su cierre."
                disabled={publicationIssues.length > 0}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  );
}
