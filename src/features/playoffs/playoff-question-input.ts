import type { RoundActionState } from "@/features/rounds/round-actions";

export function playoffQuestionInput(
  competitionId: string,
  roundId: string,
  data: FormData,
) {
  const type = String(data.get("type"));
  const common = {
    competitionId,
    roundId,
    type,
    sequence: data.get("sequence"),
    prompt: data.get("prompt"),
    deadlineMode: data.get("deadlineMode"),
    deadlineAt: data.get("deadlineMode") === "CUSTOM" ? data.get("deadlineAt") : null,
    usesDefaultScoring: data.get("usesDefaultScoring") === "on",
  };
  let typed: Record<string, unknown> = { points: data.get("points") };
  if (type === "MATCH_SCORE")
    typed = {
      homeLabel: data.get("homeLabel"),
      awayLabel: data.get("awayLabel"),
      exactScorePoints: data.get("exactScorePoints"),
      goalDifferencePoints: data.get("goalDifferenceEnabled")
        ? data.get("goalDifferencePoints")
        : null,
      normalResultPoints: data.get("normalResultPoints"),
    };
  else if (type === "CLOSEST_VALUE")
    typed.againstRival = data.get("againstRival") === "on";
  else if (type === "OPTIONS")
    typed.options = String(data.get("options") ?? "")
      .split("\n")
      .map((label) => ({ label }));
  return { ...common, ...typed } as typeof common & Record<string, unknown>;
}

export function validatePlayoffQuestionInput(
  value: ReturnType<typeof playoffQuestionInput>,
): RoundActionState | null {
  const fieldErrors: Record<string, string> = {};
  const sequence = Number(value.sequence);
  if (!Number.isInteger(sequence) || sequence < 1)
    fieldErrors.sequence = "Usa un orden entero mayor que cero.";
  if (value.type !== "MATCH_SCORE" && !String(value.prompt ?? "").trim())
    fieldErrors.prompt = "Escribe la pregunta.";
  const deadline = value.deadlineAt ? new Date(String(value.deadlineAt)) : null;
  if (value.deadlineMode === "CUSTOM" && (!deadline || Number.isNaN(deadline.valueOf())))
    fieldErrors.deadlineAt = "Selecciona una fecha y hora de cierre.";
  if (value.type === "MATCH_SCORE") {
    const home = String(value.homeLabel ?? "").trim(),
      away = String(value.awayLabel ?? "").trim();
    if (!home) fieldErrors.homeLabel = "Escribe el equipo local.";
    if (!away) fieldErrors.awayLabel = "Escribe el equipo visitante.";
    if (home && away && home.toLocaleLowerCase() === away.toLocaleLowerCase())
      fieldErrors.awayLabel = "Local y visitante deben ser distintos.";
    const exact = Number(value.exactScorePoints),
      normal = Number(value.normalResultPoints),
      difference =
        value.goalDifferencePoints === null ? null : Number(value.goalDifferencePoints);
    if (
      !value.usesDefaultScoring &&
      (!Number.isInteger(exact) ||
        !Number.isInteger(normal) ||
        exact < 1 ||
        exact > 100 ||
        normal < 1 ||
        normal > 100 ||
        !(exact > (difference ?? normal)) ||
        (difference !== null &&
          (!Number.isInteger(difference) ||
            difference < 1 ||
            difference > 100 ||
            difference <= normal)))
    )
      fieldErrors.scoring =
        "Usa enteros de 1 a 100 y conserva Marcador exacto > Diferencia > Resultado.";
  } else {
    const points = Number(value.points);
    if (
      !value.usesDefaultScoring &&
      (!Number.isInteger(points) || points < 1 || points > 100)
    )
      fieldErrors.points = "Usa un entero de 1 a 100.";
  }
  if (value.type === "OPTIONS") {
    const labels = (value.options as Array<{ label: string }>).map(({ label }) =>
      label.trim().toLocaleLowerCase(),
    );
    if (
      labels.length < 2 ||
      labels.length > 20 ||
      labels.some((label) => !label) ||
      new Set(labels).size !== labels.length
    )
      fieldErrors.options = "Agrega de 2 a 20 opciones únicas, una por línea.";
  }
  return Object.keys(fieldErrors).length
    ? { message: "Revisa los campos marcados.", fieldErrors }
    : null;
}
