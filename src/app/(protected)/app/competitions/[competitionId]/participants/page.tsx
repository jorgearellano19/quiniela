import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionDetail } from "@/application/competition/use-cases";
import { listCompetitionParticipants } from "@/application/competition/membership-use-cases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvitationControls } from "@/features/competitions/invitation-controls";
import { MembershipActionButton } from "@/features/competitions/membership-action-button";
import { startCompetitionAction } from "@/features/competitions/membership-actions";
import { ParticipantCard } from "@/features/competitions/participant-card";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { competitionRepository } from "@/infrastructure/competition/competition-repository";
import { membershipRepository } from "@/infrastructure/competition/membership-repository";
export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const actor = await requireCompetitionPageActor();
  const detail = await getCompetitionDetail(competitionRepository, actor, competitionId);
  if (!detail?.isAdmin) notFound();
  const members = await listCompetitionParticipants(
    membershipRepository,
    actor,
    competitionId,
  );
  const active = members.filter((m) => m.status === "ACTIVE").length;
  const pending = members.filter((m) => m.status === "PENDING").length;
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href={`/app/competitions/${competitionId}`}>← {detail.name}</Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Administración
        </p>
        <h1 className="font-heading text-4xl">Participantes</h1>
      </div>
      {detail.status === "DRAFT" ? (
        <Card>
          <CardHeader>
            <CardTitle>Enlace de invitación</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationControls
              competitionId={competitionId}
              active={detail.invitationActive}
            />
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3">
        {members.map((member) => (
          <ParticipantCard
            competitionId={competitionId}
            editable={detail.status === "DRAFT"}
            key={member.id}
            membership={member}
          />
        ))}
      </div>
      {detail.status === "DRAFT" ? (
        <Card>
          <CardHeader>
            <CardTitle>Iniciar quiniela</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              {active} activos · {pending} pendientes
            </p>
            <p className="text-sm text-muted-foreground">
              Al iniciar se bloquean las reglas, la lista y la invitación.
            </p>
            <MembershipActionButton
              action={startCompetitionAction.bind(null, competitionId)}
              confirmation={{
                title: "Iniciar quiniela",
                description:
                  "Las reglas y la lista de participantes quedarán bloqueadas. El enlace dejará de funcionar.",
                confirmLabel: "Iniciar quiniela",
              }}
              label="Iniciar quiniela"
              pendingLabel="Iniciando…"
              variant="destructive"
            />
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
