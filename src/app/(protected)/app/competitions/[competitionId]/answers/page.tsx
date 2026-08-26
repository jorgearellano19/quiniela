import Link from "next/link";
import { notFound } from "next/navigation";
import { listParticipantRounds } from "@/application/answer/use-cases";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { answerRepository } from "@/infrastructure/answer/answer-repository";

export default async function ParticipantRoundsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const [{ competitionId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const rounds = await listParticipantRounds(answerRepository, actor, competitionId);
  if (!rounds) notFound();
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm hover:underline"
      >
        ← Volver a la quiniela
      </Link>
      <div>
        <p className="text-sm font-medium text-primary">Tus pronósticos</p>
        <h1 className="font-heading text-4xl tracking-tight">Jornadas publicadas</h1>
        <p className="mt-2 text-muted-foreground">
          Guarda cada respuesta antes de su cierre.
        </p>
      </div>
      {rounds.length ? (
        <div className="grid gap-3">
          {rounds.map((item) => (
            <Link
              key={item.id}
              href={`/app/competitions/${competitionId}/answers/${item.id}`}
              className="rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Jornada {item.sequence}
                  </p>
                  <h2 className="font-heading text-2xl">{item.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {item.answeredCount} de {item.questionCount} guardados
                  </p>
                </div>
                <Badge>{item.status === "ACTIVE" ? "Activa" : "Cerrada"}</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyTitle>Aún no hay jornadas publicadas</EmptyTitle>
            <EmptyDescription>
              Cuando la administración abra una jornada, aparecerá aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
