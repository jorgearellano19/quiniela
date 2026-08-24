import { and, desc, eq, exists } from "drizzle-orm";
import type { CompetitionRepository } from "@/application/competition/use-cases";
import type { Competition } from "@/domain/competition/competition";
import { db } from "@/infrastructure/db/client";
import {
  competition,
  competitionParticipant,
} from "@/infrastructure/db/schema";

const selection = {
  id: competition.id,
  name: competition.name,
  type: competition.type,
  status: competition.status,
  currency: competition.currency,
  rulesNote: competition.rulesNote,
  createdByUserId: competition.createdByUserId,
  updatedByUserId: competition.updatedByUserId,
  createdAt: competition.createdAt,
  updatedAt: competition.updatedAt,
  isAdmin: competitionParticipant.isAdmin,
};
type CompetitionRow = Omit<Competition, "currency"> & {
  currency: string;
  isAdmin: boolean;
};
function map(row: CompetitionRow): Competition & { isAdmin: boolean } {
  if (row.currency !== "MXN")
    throw new Error("Unsupported Competition currency.");
  return { ...row, currency: "MXN" };
}

export function createCompetitionRepository(
  database: typeof db,
): CompetitionRepository {
  return {
    async createWithAdmin(value, membershipId) {
      await database.transaction(async (tx) => {
        await tx.insert(competition).values(value);
        await tx.insert(competitionParticipant).values({
          id: membershipId,
          competitionId: value.id,
          userId: value.createdByUserId,
          isAdmin: true,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        });
      });
    },
    async listForUser(userId) {
      const rows = await database
        .select(selection)
        .from(competitionParticipant)
        .innerJoin(
          competition,
          eq(competition.id, competitionParticipant.competitionId),
        )
        .where(eq(competitionParticipant.userId, userId))
        .orderBy(desc(competition.updatedAt));
      return rows.map(map);
    },
    async findForUser(competitionId, userId) {
      const [row] = await database
        .select(selection)
        .from(competitionParticipant)
        .innerJoin(
          competition,
          eq(competition.id, competitionParticipant.competitionId),
        )
        .where(
          and(
            eq(competitionParticipant.competitionId, competitionId),
            eq(competitionParticipant.userId, userId),
          ),
        )
        .limit(1);
      return row ? map(row) : null;
    },
    async updateDraft(value, userId) {
      const changed = await database
        .update(competition)
        .set({
          name: value.name,
          type: value.type,
          rulesNote: value.rulesNote,
          updatedAt: value.updatedAt,
          updatedByUserId: userId,
        })
        .where(
          and(
            eq(competition.id, value.id),
            eq(competition.status, "DRAFT"),
            exists(
              database
                .select({ id: competitionParticipant.id })
                .from(competitionParticipant)
                .where(
                  and(
                    eq(competitionParticipant.competitionId, value.id),
                    eq(competitionParticipant.userId, userId),
                    eq(competitionParticipant.isAdmin, true),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: competition.id });
      return changed.length === 1;
    },
  };
}
export const competitionRepository = createCompetitionRepository(db);
