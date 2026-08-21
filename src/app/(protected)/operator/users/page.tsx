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
    <main className="auth-stage min-h-svh px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            Soporte de cuentas
          </p>
          <h1 className="font-heading text-4xl leading-none tracking-tight sm:text-5xl">
            Operación de plataforma
          </h1>
          <p className="mt-4 text-muted-foreground">
            Busca una cuenta por correo exacto para realizar acciones de
            seguridad autorizadas.
          </p>
        </div>
        <OperatorConsole />
      </div>
    </main>
  );
}
