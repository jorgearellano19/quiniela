import Link from "next/link";
import { notFound } from "next/navigation";
import { roundEditorDetail } from "@/application/round/use-cases";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { PlayoffRoundForm } from "@/features/playoffs/playoff-round-form";
import { publishPlayoffRoundAction } from "@/features/playoffs/playoff-actions";
import { QuestionWorkspace } from "@/features/rounds/question-workspace";
import { playoffRepository } from "@/infrastructure/playoff/playoff-repository";

export default async function PlayoffRoundPage({
  params,
}: {
  params: Promise<{ competitionId: string; playoffRoundId: string }>;
}) {
  const [{ competitionId, playoffRoundId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const value = await playoffRepository.getRound(playoffRoundId, actor.userId);
  if (!value || value.round.competitionId !== competitionId) notFound();
  const detail = roundEditorDetail(value);
  const questionLabels = detail.questions.map((item) => ({
    id: item.id,
    label:
      item.type === "MATCH_SCORE"
        ? `${item.homeLabel} vs ${item.awayLabel}`
        : (item.prompt ?? "Pregunta"),
  }));
  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}/playoffs`}
        className="text-sm hover:underline"
      >
        ← Volver al cuadro
      </Link>
      <header>
        <p className="text-sm font-medium text-primary">Etapa {detail.sequence}</p>
        <h1 className="font-heading text-4xl sm:text-5xl">{detail.name}</h1>
      </header>
      {detail.readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link
              href={`/app/competitions/${competitionId}/playoffs/${playoffRoundId}/answers`}
            >
              Pronósticos
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              href={`/app/competitions/${competitionId}/playoffs/${playoffRoundId}/results`}
            >
              Resultados
            </Link>
          </Button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Ajustes de la etapa</CardTitle>
          <CardDescription>La publicación congela estas reglas.</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.readOnly ? (
            <p className="text-sm text-muted-foreground">
              La etapa está publicada y su configuración es inmutable.
            </p>
          ) : (
            <PlayoffRoundForm
              competitionId={competitionId}
              value={{
                id: detail.id,
                sequence: detail.sequence,
                name: detail.name,
                startsAt: detail.startsAt,
                unansweredPenalty: detail.unansweredPenalty,
                advancementMode: value.advancementMode,
                tiebreakerQuestionId: value.tiebreakerQuestionId,
                questions: questionLabels,
              }}
            />
          )}
        </CardContent>
      </Card>
      <QuestionWorkspace
        competitionId={competitionId}
        roundId={playoffRoundId}
        questions={detail.questions}
        scoringDefaults={detail.scoringDefaults}
        readOnly={detail.readOnly}
        context="playoff"
      />
      {!detail.readOnly ? (
        <form
          action={publishPlayoffRoundAction.bind(null, competitionId, playoffRoundId)}
        >
          <Button className="w-full">Publicar etapa</Button>
        </form>
      ) : null}
    </section>
  );
}
