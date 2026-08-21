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

export default function SignUpPage() {
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
              Arma tu jugada.
            </h1>
          </CardTitle>
          <CardDescription>
            Crea tu cuenta para empezar a participar en tus quinielas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </div>
  );
}
