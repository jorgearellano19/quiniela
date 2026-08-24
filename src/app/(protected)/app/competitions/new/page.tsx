import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createCompetitionAction } from "@/features/competitions/competition-actions";
import { CompetitionForm } from "@/features/competitions/competition-form";
export const metadata: Metadata = { title: "Crear quiniela · Quiniela" };
export default function NewCompetitionPage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href="/app" className="text-sm underline-offset-4 hover:underline">
        ← Mis quinielas
      </Link>
      <div>
        <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
          Nueva competencia
        </p>
        <h1 className="font-heading text-4xl leading-none tracking-tight">
          Crea tu quiniela
        </h1>
        <p className="mt-4 text-muted-foreground">
          Define la base. La moneda será MXN y podrás editar estas reglas
          mientras siga en borrador.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Configuración inicial</CardTitle>
          <CardDescription>
            No incluye participantes, pagos ni rondas todavía.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitionForm action={createCompetitionAction} />
        </CardContent>
      </Card>
    </section>
  );
}
