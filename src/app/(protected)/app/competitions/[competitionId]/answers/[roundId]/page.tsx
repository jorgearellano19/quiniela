import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyAnswers } from "@/application/answer/use-cases";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnswerForm } from "@/features/answers/answer-form";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { answerRepository } from "@/infrastructure/answer/answer-repository";

export default async function AnswersPage({
  params,
}: {
  params: Promise<{ competitionId: string; roundId: string }>;
}) {
  const [{ competitionId, roundId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const value = await getMyAnswers(answerRepository, actor, competitionId, roundId);
  if (!value) notFound();
  const answered = value.questions.filter((item) => item.answer).length;
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}/answers`}
        className="text-sm hover:underline"
      >
        ← Tus pronósticos
      </Link>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Jornada {value.sequence}</p>
          <h1 className="font-heading text-4xl tracking-tight">{value.name}</h1>
        </div>
        <Badge variant="secondary">
          {answered} de {value.questions.length} guardados
        </Badge>
      </div>
      <div className="grid gap-4">
        {value.questions.map((item) => (
          <AnswerForm
            key={item.id}
            competitionId={competitionId}
            roundId={roundId}
            item={item}
          />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Resultados y puntajes</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href={`/app/competitions/${competitionId}/rounds/${roundId}/results`}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Revisar resultados de la jornada
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
