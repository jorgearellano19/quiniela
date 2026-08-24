import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createCompetition as createDomainCompetition,
  CompetitionDomainError,
  COMPETITION_TYPES,
  updateCompetitionConfiguration,
  type Competition,
  type CompetitionStatus,
  type CompetitionType,
} from "@/domain/competition/competition";
import { ApplicationError } from "@/lib/errors/application-error";

export type CompetitionActor = Readonly<{
  userId: string;
  passwordChangeRequired?: boolean;
}> | null;
export type CompetitionSummary = Readonly<{
  id: string;
  name: string;
  type: CompetitionType;
  typeLabel: string;
  status: CompetitionStatus;
  statusLabel: string;
  currency: "MXN";
  updatedAt: Date;
  capabilities: Readonly<{ canView: true; canEdit: boolean }>;
}>;
export type CompetitionDetail = CompetitionSummary &
  Readonly<{ rulesNote: string | null; createdAt: Date; canEdit: boolean }>;

export interface CompetitionRepository {
  createWithAdmin(
    competition: Competition,
    membershipId: string,
  ): Promise<void>;
  listForUser(
    userId: string,
  ): Promise<ReadonlyArray<Competition & { isAdmin: boolean }>>;
  findForUser(
    competitionId: string,
    userId: string,
  ): Promise<(Competition & { isAdmin: boolean }) | null>;
  updateDraft(competition: Competition, userId: string): Promise<boolean>;
}

const inputSchema = z.object({
  name: z.string(),
  type: z.enum(COMPETITION_TYPES),
  rulesNote: z.string().optional(),
});
const competitionIdSchema = z.uuid();
const typeLabels: Record<CompetitionType, string> = {
  LEAGUE: "Liga",
  LEAGUE_PLAYOFFS: "Liga con eliminatorias",
  GROUP_PLAYOFFS: "Grupos con eliminatorias",
};
const statusLabels: Record<CompetitionStatus, string> = {
  DRAFT: "Borrador",
  STARTED: "Iniciada",
  COMPLETED: "Completada",
};

function requireActor(actor: CompetitionActor) {
  if (!actor)
    throw new ApplicationError(
      "UNAUTHENTICATED",
      "Inicia sesión para continuar.",
    );
  if (actor.passwordChangeRequired)
    throw new ApplicationError(
      "UNAUTHORIZED",
      "Cambia tu contraseña para continuar.",
    );
  return actor;
}
function safeDomain<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CompetitionDomainError)
      throw new ApplicationError(
        "INVALID_INPUT",
        "Revisa la configuración de la quiniela.",
      );
    throw error;
  }
}
function summary(row: Competition & { isAdmin: boolean }): CompetitionSummary {
  const canEdit = row.isAdmin && row.status === "DRAFT";
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    typeLabel: typeLabels[row.type],
    status: row.status,
    statusLabel: statusLabels[row.status],
    currency: row.currency,
    updatedAt: row.updatedAt,
    capabilities: { canView: true, canEdit },
  };
}

export async function createCompetition(
  repository: CompetitionRepository,
  actorValue: CompetitionActor,
  input: unknown,
) {
  const actor = requireActor(actorValue);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError(
      "INVALID_INPUT",
      "Revisa los datos de la quiniela.",
    );
  const competition = safeDomain(() =>
    createDomainCompetition({
      id: randomUUID(),
      actorUserId: actor.userId,
      ...parsed.data,
      rulesNote: parsed.data.rulesNote ?? null,
    }),
  );
  await repository.createWithAdmin(competition, randomUUID());
  return summary({ ...competition, isAdmin: true });
}
export async function listMyCompetitions(
  repository: CompetitionRepository,
  actorValue: CompetitionActor,
) {
  const actor = requireActor(actorValue);
  return (await repository.listForUser(actor.userId)).map(summary);
}
export async function getCompetitionDetail(
  repository: CompetitionRepository,
  actorValue: CompetitionActor,
  competitionId: string,
): Promise<CompetitionDetail | null> {
  const actor = requireActor(actorValue);
  if (!z.uuid().safeParse(competitionId).success) return null;
  const row = await repository.findForUser(competitionId, actor.userId);
  if (!row) return null;
  const value = summary(row);
  return {
    ...value,
    rulesNote: row.rulesNote,
    createdAt: row.createdAt,
    canEdit: value.capabilities.canEdit,
  };
}
export async function updateCompetition(
  repository: CompetitionRepository,
  actorValue: CompetitionActor,
  input: unknown,
) {
  const actor = requireActor(actorValue);
  const candidate = typeof input === "object" && input ? input : {};
  const competitionId = competitionIdSchema.safeParse(
    Reflect.get(candidate, "competitionId"),
  );
  if (!competitionId.success)
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No fue posible actualizar la quiniela.",
    );
  const current = await repository.findForUser(
    competitionId.data,
    actor.userId,
  );
  if (!current?.isAdmin)
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No fue posible actualizar la quiniela.",
    );
  const parsed = inputSchema.safeParse(candidate);
  if (!parsed.success)
    throw new ApplicationError(
      "INVALID_INPUT",
      "Revisa los datos de la quiniela.",
    );
  const updated = safeDomain(() =>
    updateCompetitionConfiguration(current, {
      ...parsed.data,
      rulesNote: parsed.data.rulesNote ?? null,
      actorUserId: actor.userId,
    }),
  );
  if (!(await repository.updateDraft(updated, actor.userId)))
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No fue posible actualizar la quiniela.",
    );
  return summary({ ...updated, isAdmin: true });
}
