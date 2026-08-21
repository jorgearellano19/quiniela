import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/features/security/change-password-form";
import { SessionList } from "@/features/security/session-list";
import { getServerSession } from "@/infrastructure/auth/session";

export default async function AccountSecurityPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");
  if (session.user.passwordChangeRequired) redirect("/account/change-password");
  return (
    <main className="mx-auto min-h-svh max-w-4xl px-4 py-10">
      <h1 className="mb-6 font-heading text-4xl">Seguridad de la cuenta</h1>
      <ChangePasswordForm />
      <SessionList />
    </main>
  );
}
