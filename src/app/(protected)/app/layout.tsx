import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountNavigation } from "@/features/navigation/account-navigation";
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
        <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link className="flex items-center gap-3" href="/app">
            <span className="match-dot" aria-hidden="true" />
            <span className="font-heading text-xl font-semibold tracking-tight">
              Quiniela
            </span>
          </Link>
          <AccountNavigation
            name={session.user.name}
            email={session.user.email}
            isOperator={isPlatformOperator(session.user.role)}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
