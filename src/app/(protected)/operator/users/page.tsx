import { redirect } from "next/navigation";
import { OperatorConsole } from "@/features/security/operator-console";
import { getServerSession } from "@/infrastructure/auth/session";
import { isPlatformOperator } from "@/infrastructure/auth/permissions";

export default async function OperatorUsersPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");
  if (session.user.passwordChangeRequired) redirect("/account/change-password");
  if (!isPlatformOperator(session.user.role)) redirect("/app");
  return (
    <main className="mx-auto min-h-svh max-w-4xl px-4 py-10">
      <h1 className="mb-8 font-heading text-4xl">Operación de plataforma</h1>
      <OperatorConsole />
    </main>
  );
}
