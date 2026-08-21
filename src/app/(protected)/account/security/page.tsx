import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/features/security/change-password-form";
import { SessionList } from "@/features/security/session-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getServerSession } from "@/infrastructure/auth/session";

export default async function AccountSecurityPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");
  if (session.user.passwordChangeRequired) redirect("/account/change-password");
  return (
    <main className="auth-stage min-h-svh px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            Tu cuenta
          </p>
          <h1 className="font-heading text-4xl leading-none tracking-tight sm:text-5xl">
            Seguridad de tu cuenta
          </h1>
        </div>
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <Card>
            <CardHeader>
              <CardTitle>Cambiar contraseña</CardTitle>
              <CardDescription>
                La nueva contraseña cerrará tus otras sesiones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="sr-only">
              <CardTitle>Acceso a tu cuenta</CardTitle>
              <CardDescription>Sesiones con acceso vigente.</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionList />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
