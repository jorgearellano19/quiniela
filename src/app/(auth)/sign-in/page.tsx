import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "@/features/auth/sign-in-form";

export const metadata: Metadata = { title: "Iniciar sesión · Quiniela" };

type SignInPageProps = Readonly<{
  searchParams: Promise<{ signedOut?: string }>;
}>;

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { signedOut } = await searchParams;

  return (
    <div className="auth-card">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="match-dot" aria-hidden="true" />
            <span className="text-xs font-semibold tracking-[0.28em] text-primary uppercase">
              Quiniela
            </span>
          </div>
          <CardTitle>
            <h1 className="font-heading text-4xl leading-none tracking-tight">
              Vuelve a competir
            </h1>
          </CardTitle>
          <CardDescription>
            Inicia sesión para entrar a tus quinielas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {signedOut === "1" ? (
            <Alert>
              <AlertDescription>
                Tu sesión se cerró correctamente.
              </AlertDescription>
            </Alert>
          ) : null}
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
