import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-8 sm:px-6">
      <Card className="w-full max-w-lg" aria-labelledby="title">
        <CardHeader>
          <p className="text-xs font-medium tracking-widest text-primary uppercase">
            Quiniela
          </p>
          <CardTitle>
            <h1 id="title" className="text-3xl font-semibold tracking-tight">
              La base está lista.
            </h1>
          </CardTitle>
          <CardDescription>
            Una base técnica pequeña, reproducible y preparada para crecer.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Autenticación y persistencia están preparadas para el primer flujo del
          producto.
        </CardContent>
      </Card>
    </main>
  );
}
