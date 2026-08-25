import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function AppNotFound() {
  return (
    <Empty className="min-h-72 border bg-card">
      <EmptyHeader>
        <EmptyTitle>Vista no disponible</EmptyTitle>
        <EmptyDescription>
          No encontramos el recurso solicitado o ya no puedes consultarlo.
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild>
        <Link href="/app">Volver a mis quinielas</Link>
      </Button>
    </Empty>
  );
}
