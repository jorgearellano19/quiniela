import type { Membership } from "@/application/competition/membership-use-cases";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MembershipActionButton } from "./membership-action-button";
import { participantAction } from "./membership-actions";

const membershipStatusLabels = {
  PENDING: "Pendiente",
  ACTIVE: "Participante",
  REJECTED: "Rechazada",
  REMOVED: "Retirada",
} as const;

export function ParticipantCard({
  competitionId,
  editable,
  membership,
}: {
  competitionId: string;
  editable: boolean;
  membership: Membership;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{membership.name}</p>
            {membership.isAdmin ? <Badge>Admin</Badge> : null}
            <Badge variant="outline">{membershipStatusLabels[membership.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{membership.email}</p>
        </div>
        {editable ? (
          <div className="flex gap-2">
            <MembershipActions competitionId={competitionId} membership={membership} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MembershipActions({
  competitionId,
  membership,
}: {
  competitionId: string;
  membership: Membership;
}) {
  if (membership.status === "PENDING") {
    return (
      <>
        <MembershipActionButton
          action={participantAction.bind(null, competitionId, membership.id, "approve")}
          label="Aprobar"
          pendingLabel="Aprobando…"
          size="sm"
        />
        <MembershipActionButton
          action={participantAction.bind(null, competitionId, membership.id, "reject")}
          label="Rechazar"
          pendingLabel="Rechazando…"
          size="sm"
          variant="outline"
        />
      </>
    );
  }

  if (membership.status !== "ACTIVE") return null;
  return (
    <MembershipActionButton
      action={participantAction.bind(null, competitionId, membership.id, "remove")}
      confirmation={{
        title: "Retirar participación",
        description:
          "La persona dejará de participar y deberá solicitar acceso de nuevo.",
        confirmLabel: "Retirar participación",
      }}
      label="Retirar"
      pendingLabel="Retirando…"
      size="sm"
      variant="destructive"
    />
  );
}
