import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/features/security/change-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getServerSession } from "@/infrastructure/auth/session";

export default async function ChangePasswordPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");
  return (
    <main className="auth-stage min-h-svh px-4 py-8 sm:px-6 sm:py-12">
      <Card className="auth-card mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>
            <h1 className="font-heading text-4xl leading-none tracking-tight">
              Protege tu cuenta
            </h1>
          </CardTitle>
          <CardDescription>
            Elige una contraseña nueva para continuar a tus quinielas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm required={session.user.passwordChangeRequired} />
        </CardContent>
      </Card>
    </main>
  );
}
