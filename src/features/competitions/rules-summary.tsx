import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompetitionType } from "@/domain/competition/competition";

export function RulesSummary({
  typeLabel,
  type,
  statusLabel,
}: {
  typeLabel: string;
  type: CompetitionType;
  statusLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de reglas</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-5 sm:grid-cols-3">
          <Rule label="Formato" value={typeLabel} />
          <Rule
            label="Participantes"
            value={
              type === "LEAGUE_PLAYOFFS"
                ? "2 a 30"
                : type === "GROUP_PLAYOFFS"
                  ? "8, 16, 32 o 64"
                  : "Sin cupo máximo configurable"
            }
          />
          {statusLabel ? <Rule label="Estado" value={statusLabel} /> : null}
          <Rule label="Moneda" value="Peso mexicano (MXN)" />
        </dl>
      </CardContent>
    </Card>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
