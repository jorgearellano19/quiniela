import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-label="Cargando quinielas">
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
