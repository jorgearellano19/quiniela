import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionDetail } from "@/application/competition/use-cases";
import { listRounds } from "@/application/round/use-cases";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewRoundDisclosure } from "@/features/rounds/round-editor-forms";
import { reorderRoundsAction } from "@/features/rounds/round-actions";
import { SortableOrder } from "@/features/rounds/sortable-order";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { competitionRepository } from "@/infrastructure/competition/competition-repository";
import { roundRepository } from "@/infrastructure/round/round-repository";
export default async function RoundsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const [{ competitionId }, actor] = await Promise.all([
    params,
    requireCompetitionPageActor(),
  ]);
  const detail = await getCompetitionDetail(competitionRepository, actor, competitionId);
  if (!detail?.isAdmin) notFound();
  const rounds = await listRounds(roundRepository, actor, competitionId);
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm hover:underline"
      >
        ← {detail.name}
      </Link>
      <div>
        <p className="text-sm font-medium text-primary">Administración</p>
        <h1 className="font-heading text-4xl tracking-tight">Jornadas</h1>
        <p className="mt-2 text-muted-foreground">
          Prepara preguntas y publica cuando todas tengan un cierre futuro.
        </p>
      </div>
      <h2 className="font-heading text-2xl">Jornadas disponibles</h2>
      <div className="grid gap-3">
        {rounds.map((item) => (
          <Link
            key={item.id}
            href={`/app/competitions/${competitionId}/rounds/${item.id}`}
            className="rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Jornada {item.sequence}
                </p>
                <h2 className="font-heading text-2xl">{item.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {item.questionCount} preguntas
                </p>
              </div>
              <Badge>
                {item.status === "DRAFT"
                  ? "Borrador"
                  : item.status === "ACTIVE" || item.status === "PUBLISHED"
                    ? "Activa"
                    : "Cerrada"}
              </Badge>
            </div>
          </Link>
        ))}
        {!rounds.length ? (
          <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            Todavía no hay jornadas.
          </p>
        ) : null}
      </div>
      {rounds.length > 1 && rounds.every((item) => item.status === "DRAFT") ? (
        <Card>
          <CardHeader>
            <CardTitle>Orden de jornadas</CardTitle>
          </CardHeader>
          <CardContent>
            <SortableOrder
              label="Orden de jornadas"
              items={rounds.map((item) => ({ id: item.id, label: item.name }))}
              action={reorderRoundsAction.bind(null, competitionId)}
            />
          </CardContent>
        </Card>
      ) : null}
      {detail.status !== "COMPLETED" ? (
        <NewRoundDisclosure
          competitionId={competitionId}
          nextSequence={(rounds.at(-1)?.sequence ?? 0) + 1}
        />
      ) : null}
    </section>
  );
}
