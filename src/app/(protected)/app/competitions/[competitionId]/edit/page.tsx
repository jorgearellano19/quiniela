import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCompetitionDetail } from "@/application/competition/use-cases";
import { getCompetitionScoringDefaults } from "@/application/round/use-cases";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateCompetitionAction } from "@/features/competitions/competition-actions";
import { CompetitionForm } from "@/features/competitions/competition-form";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { ScoringDefaultsForm } from "@/features/rounds/round-editor-forms";
import { competitionRepository } from "@/infrastructure/competition/competition-repository";
import { roundRepository } from "@/infrastructure/round/round-repository";
export const metadata: Metadata = { title: "Editar quiniela · Quiniela" };
export default async function EditCompetitionPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const actor = await requireCompetitionPageActor();
  const detail = await getCompetitionDetail(competitionRepository, actor, competitionId);
  if (!detail?.isAdmin || detail.status === "COMPLETED")
    redirect(`/app/competitions/${competitionId}`);
  const scoringDefaults = await getCompetitionScoringDefaults(
    roundRepository,
    actor,
    competitionId,
  );
  const action = updateCompetitionAction.bind(null, competitionId);
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href={`/app/competitions/${competitionId}`}
        className="text-sm underline-offset-4 hover:underline"
      >
        ← Volver al detalle
      </Link>
      <div>
        <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
          Configuración
        </p>
        <h1 className="font-heading text-4xl leading-none tracking-tight">
          Edita tu quiniela
        </h1>
      </div>
      {detail.canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Reglas en borrador</CardTitle>
            <CardDescription>
              El estado y la moneda no pueden cambiarse desde aquí.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompetitionForm
              action={action}
              initial={{
                name: detail.name,
                type: detail.type,
                rulesNote: detail.rulesNote,
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
          La quiniela ya inició. Sus reglas generales están congeladas, pero puedes
          ajustar los puntajes para futuras jornadas en borrador.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Puntajes predeterminados</CardTitle>
          <CardDescription>
            Se aplican a preguntas en borrador que mantienen los valores predeterminados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScoringDefaultsForm competitionId={competitionId} value={scoringDefaults} />
        </CardContent>
      </Card>
    </section>
  );
}
