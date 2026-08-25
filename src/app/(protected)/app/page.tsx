import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, PlusIcon, TrophyIcon } from "lucide-react";
import { listMyCompetitions } from "@/application/competition/use-cases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireCompetitionPageActor } from "@/features/competitions/competition-session";
import { competitionRepository } from "@/infrastructure/competition/competition-repository";
export const metadata: Metadata = { title: "Mis quinielas · Quiniela" };
export default async function AppHomePage() {
  const actor = await requireCompetitionPageActor();
  const items = await listMyCompetitions(competitionRepository, actor);
  return (
    <section aria-labelledby="app-title" className="flex flex-col gap-8">
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
            Mis quinielas
          </p>
          <h1
            id="app-title"
            className="font-heading text-4xl leading-none tracking-tight sm:text-5xl"
          >
            Cada pronóstico cuenta
          </h1>
        </div>
        <Button asChild size="lg">
          <Link href="/app/competitions/new">
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            Crear quiniela
          </Link>
        </Button>
      </div>
      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{item.statusLabel}</Badge>
                  <span className="text-xs text-muted-foreground">{item.currency}</span>
                </div>
                <CardTitle className="font-heading text-2xl">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.typeLabel}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Actualizada{" "}
                  {new Intl.DateTimeFormat("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(item.updatedAt)}
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/app/competitions/${item.id}`}>
                    Abrir quiniela
                    <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Empty className="min-h-72 border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrophyIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Aún no tienes quinielas</EmptyTitle>
            <EmptyDescription>
              Crea una quiniela para configurar sus reglas. Las quinielas a las que te
              unas también aparecerán aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
