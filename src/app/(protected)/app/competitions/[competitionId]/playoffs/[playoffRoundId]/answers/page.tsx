import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyAnswers } from "@/application/answer/use-cases";
import { Badge } from "@/components/ui/badge";
import { AnswerForm } from "@/features/answers/answer-form";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { playoffAnswerRepository } from "@/infrastructure/playoff/playoff-answer-repository";

export default async function PlayoffAnswersPage({
  params,
}: {
  params: Promise<{ competitionId: string; playoffRoundId: string }>;
}) {
  const [{ competitionId, playoffRoundId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const value = await getMyAnswers(
    playoffAnswerRepository,
    actor,
    competitionId,
    playoffRoundId,
  );
  if (!value) notFound();
  const answered = value.questions.filter((item) => item.answer).length;
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}/playoffs`}
        className="text-sm hover:underline"
      >
        ← Volver al cuadro
      </Link>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">
            Playoffs · Etapa {value.sequence}
          </p>
          <h1 className="font-heading text-4xl">{value.name}</h1>
        </div>
        <Badge variant="secondary">
          {answered} de {value.questions.length} guardados
        </Badge>
      </div>
      {value.restricted ? (
        <p role="status" className="rounded-2xl bg-secondary p-4 text-sm">
          Tus pronósticos están en modo de consulta hasta recuperar la elegibilidad.
        </p>
      ) : null}
      <div className="grid gap-4">
        {value.questions.map((item) => (
          <AnswerForm
            key={item.id}
            competitionId={competitionId}
            roundId={playoffRoundId}
            item={item}
            context="playoff"
          />
        ))}
      </div>
      <Link
        href={`/app/competitions/${competitionId}/playoffs/${playoffRoundId}/results`}
        className="text-sm font-medium text-primary hover:underline"
      >
        Revisar resultados de la etapa
      </Link>
    </section>
  );
}
