import "server-only";

import { redirect } from "next/navigation";
import { getServerSession } from "@/infrastructure/auth/session";

export async function requireCompetitionPageActor() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");
  if (session.user.passwordChangeRequired) redirect("/account/change-password");
  return { userId: session.user.id, passwordChangeRequired: false } as const;
}
