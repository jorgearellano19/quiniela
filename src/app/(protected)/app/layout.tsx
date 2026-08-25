import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutForm } from "@/features/auth/sign-out-form";
import { getServerSession } from "@/infrastructure/auth/session";
import { isPlatformOperator } from "@/infrastructure/auth/permissions";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");
  if (session.user.passwordChangeRequired) redirect("/account/change-password");

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-4 py-4 sm:items-center sm:px-6">
          <Link className="flex items-center gap-3" href="/app">
            <span className="match-dot" aria-hidden="true" />
            <span className="font-heading text-xl font-semibold tracking-tight">
              Quiniela
            </span>
          </Link>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Link
              className="rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              href="/account/security"
            >
              Seguridad
            </Link>
            {isPlatformOperator(session.user.role) ? (
              <Link
                className="rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                href="/operator/users"
              >
                Operación
              </Link>
            ) : null}
            <div className="max-w-44 text-right sm:max-w-60">
              <p className="truncate text-sm font-medium">{session.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {session.user.email}
              </p>
            </div>
            <SignOutForm />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
