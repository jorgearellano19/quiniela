import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpForm } from "@/features/auth/sign-up-form";

export const metadata: Metadata = { title: "Crear cuenta · Quiniela" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const requested = (await searchParams).returnTo;
  const returnTo = requested?.startsWith("/invite/") ? requested : "/app";
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
              Empieza a competir
            </h1>
          </CardTitle>
          <CardDescription>
            Crea tu cuenta y prepárate para compartir tus pronósticos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm returnTo={returnTo} />
        </CardContent>
      </Card>
    </div>
  );
}
