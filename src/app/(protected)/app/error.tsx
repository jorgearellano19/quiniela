"use client";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <Empty className="min-h-72 border bg-card">
      <EmptyHeader>
        <EmptyTitle>No pudimos cargar esta vista</EmptyTitle>
        <EmptyDescription>
          Inténtalo de nuevo. Tus datos guardados no se modificaron.
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </Empty>
  );
}
