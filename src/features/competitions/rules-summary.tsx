import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvitationView } from "@/application/competition/membership-use-cases";
import type { CompetitionType } from "@/domain/competition/competition";

type InvitationRules = Pick<InvitationView, "phase" | "scoringDefaults" | "financial">;

const prizeLabels = {
  ROUND_WINNER: "Premio por jornada",
  LEAGUE_WINNER: "Premio de liga",
  LEAGUE_PHASE_WINNER: "Premio de fase regular",
  PLAYOFF_CHAMPION: "Premio de campeonato",
} as const;

export function RulesSummary({
  typeLabel,
  type,
  statusLabel,
  configuration,
}: {
  typeLabel: string;
  type: CompetitionType;
  statusLabel?: string;
  configuration?: InvitationRules;
}) {
  const money = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  });
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
        {configuration ? (
          <div className="mt-6 grid gap-6 border-t pt-6">
            <section aria-labelledby="phase-rules-title">
              <h3 id="phase-rules-title" className="font-medium">
                Formato de competencia
              </h3>
              <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                <Rule label="Fase regular" value={phaseDescription(configuration)} />
                <Rule
                  label="Clasificación"
                  value={qualificationDescription(configuration)}
                />
              </dl>
            </section>
            <section aria-labelledby="scoring-rules-title">
              <h3 id="scoring-rules-title" className="font-medium">
                Puntajes predeterminados
              </h3>
              <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Rule
                  label="Marcador exacto"
                  value={`${configuration.scoringDefaults.matchScore.exactScorePoints} pts`}
                />
                <Rule
                  label="Diferencia de goles"
                  value={
                    configuration.scoringDefaults.matchScore.goalDifferencePoints === null
                      ? "Desactivada"
                      : `${configuration.scoringDefaults.matchScore.goalDifferencePoints} pts`
                  }
                />
                <Rule
                  label="Resultado normal"
                  value={`${configuration.scoringDefaults.matchScore.normalResultPoints} pts`}
                />
                <Rule
                  label="Valor más cercano"
                  value={`${configuration.scoringDefaults.closestValuePoints} pts`}
                />
                <Rule
                  label="Opciones"
                  value={`${configuration.scoringDefaults.optionsPoints} pts`}
                />
                <Rule
                  label="Texto abierto"
                  value={`${configuration.scoringDefaults.openTextPoints} pts`}
                />
                <Rule
                  label="Valor exacto"
                  value={`${configuration.scoringDefaults.exactValuePoints} pts`}
                />
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">
                Una pregunta en borrador puede usar estos valores o definir los suyos.
              </p>
            </section>
            <section aria-labelledby="financial-rules-title">
              <h3 id="financial-rules-title" className="font-medium">
                Pagos y premios
              </h3>
              {configuration.financial.enabled ? (
                <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Rule
                    label="Cuota por jornada"
                    value={
                      configuration.financial.roundFeeAmount === null
                        ? "Sin cuota"
                        : money.format(configuration.financial.roundFeeAmount / 100)
                    }
                  />
                  <Rule
                    label="Deuda máxima"
                    value={
                      configuration.financial.maximumDebt === null
                        ? "Sin restricción por deuda"
                        : money.format(configuration.financial.maximumDebt / 100)
                    }
                  />
                  {configuration.financial.prizes.map((prize) => (
                    <Rule
                      key={prize.type}
                      label={prizeLabels[prize.type]}
                      value={money.format(prize.amount / 100)}
                    />
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Esta quiniela no usa cuotas, restricciones por deuda ni premios.
                </p>
              )}
            </section>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function phaseDescription(configuration: InvitationRules) {
  if (configuration.phase?.type === "LEAGUE_PLAYOFFS")
    return `${configuration.phase.roundCount} jornada${configuration.phase.roundCount === 1 ? "" : "s"} H2H`;
  if (configuration.phase?.type === "GROUP_PLAYOFFS")
    return `Grupos de ${configuration.phase.groupSize}`;
  if (configuration.phase?.type === "LEAGUE") return "Puntaje acumulado, sin H2H";
  return "Pendiente de configuración";
}

function qualificationDescription(configuration: InvitationRules) {
  if (configuration.phase?.type === "LEAGUE_PLAYOFFS")
    return `${configuration.phase.qualifierCount} participantes avanzan`;
  if (configuration.phase?.type === "GROUP_PLAYOFFS")
    return `${configuration.phase.advancersPerGroup} por grupo`;
  if (configuration.phase?.type === "LEAGUE") return "Mayor puntaje final";
  return "Pendiente de configuración";
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
