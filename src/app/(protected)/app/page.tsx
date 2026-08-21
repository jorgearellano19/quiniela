import type { Metadata } from "next";
import { CircleCheckBigIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = { title: "Mis quinielas · Quiniela" };

export default function AppHomePage() {
  return (
    <section aria-labelledby="app-title" className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
          Mis quinielas
        </p>
        <h1
          className="font-heading text-4xl leading-none tracking-tight sm:text-5xl"
          id="app-title"
        >
          Cada pronóstico cuenta
        </h1>
      </div>
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheckBigIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Aún no tienes quinielas</EmptyTitle>
          <EmptyDescription>
            Cuando participes en una quiniela, aparecerá aquí con sus rondas,
            pronósticos y resultados.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}
