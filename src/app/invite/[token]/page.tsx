import Link from "next/link";
import { redirect } from "next/navigation";
import { viewInvitation } from "@/application/competition/membership-use-cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requestJoinAction } from "@/features/competitions/membership-actions";
import { MembershipActionButton } from "@/features/competitions/membership-action-button";
import { RulesSummary } from "@/features/competitions/rules-summary";
import { getServerSession } from "@/infrastructure/auth/session";
import { membershipRepository } from "@/infrastructure/competition/membership-repository";
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getServerSession();
  if (!session) redirect(`/sign-in?returnTo=${encodeURIComponent(`/invite/${token}`)}`);
  const invitation = await viewInvitation(
    membershipRepository,
    {
      userId: session.user.id,
      passwordChangeRequired: session.user.passwordChangeRequired,
    },
    token,
  );
  if (!invitation)
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Invitación no disponible</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            El enlace fue reemplazado, revocado o la quiniela ya inició.
          </p>
          <Button asChild>
            <Link href="/app">Ir a mis quinielas</Link>
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <Badge variant="secondary">Invitación</Badge>
        <h1 className="mt-3 font-heading text-4xl">{invitation.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Revisa las reglas antes de solicitar acceso.
        </p>
      </div>
      <RulesSummary type={invitation.type} typeLabel={invitation.typeLabel} />
      <Card>
        <CardHeader>
          <CardTitle>Nota de la administración</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {invitation.rulesNote ?? "No se agregó una nota adicional."}
          </p>
        </CardContent>
      </Card>
      {invitation.membershipStatus === "ACTIVE" ? (
        <Button asChild>
          <Link href={`/app/competitions/${invitation.competitionId}`}>
            Abrir quiniela
          </Link>
        </Button>
      ) : (
        <MembershipActionButton
          action={requestJoinAction.bind(null, token)}
          label={
            invitation.membershipStatus === "PENDING"
              ? "Solicitud pendiente"
              : "Solicitar unirme"
          }
          pendingLabel="Enviando solicitud…"
        />
      )}
    </main>
  );
}
