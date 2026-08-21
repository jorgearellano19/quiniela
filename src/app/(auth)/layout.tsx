import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/infrastructure/auth/session";

export default async function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await getServerSession();
  if (session) redirect("/app");

  return (
    <main className="auth-stage min-h-svh px-4 py-5 sm:px-6 sm:py-8 lg:grid lg:grid-cols-[minmax(20rem,0.9fr)_minmax(28rem,1.1fr)] lg:gap-8 lg:p-8">
      <section className="auth-editorial relative hidden min-h-[calc(100svh-4rem)] overflow-hidden rounded-3xl bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="relative flex items-center gap-3">
          <span className="match-dot" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-[0.28em] uppercase">
            Quiniela
          </span>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-sm font-medium tracking-[0.22em] uppercase opacity-70">
            Cada pronóstico cuenta
          </p>
          <p className="font-heading text-6xl leading-[0.98] tracking-[-0.045em] text-balance xl:text-7xl">
            Tus pronósticos. Tu competencia. Resultados claros.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-4 text-xs tracking-wide uppercase opacity-75">
          <span>Pronostica</span>
          <span className="text-center">Compite</span>
          <span className="text-right">Celebra</span>
        </div>
      </section>
      <section className="flex min-h-[calc(100svh-2.5rem)] items-center justify-center py-8 lg:min-h-0 lg:py-0">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
