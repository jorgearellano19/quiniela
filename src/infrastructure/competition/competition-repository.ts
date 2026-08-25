import { and, desc, eq, exists, inArray, or } from "drizzle-orm";
import type { CompetitionRepository } from "@/application/competition/use-cases";
import type { Competition } from "@/domain/competition/competition";
import { db } from "@/infrastructure/db/client";
import { competition, competitionParticipant } from "@/infrastructure/db/schema";

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
  invitationTokenHash: competition.invitationTokenHash,
  invitationInvalidatedAt: competition.invitationInvalidatedAt,
  startedAt: competition.startedAt,
  isAdmin: competitionParticipant.isAdmin,
  membershipStatus: competitionParticipant.status,
};
type CompetitionRow = Omit<Competition, "currency"> & {
  currency: string;
  isAdmin: boolean;
  membershipStatus: "PENDING" | "ACTIVE" | "REJECTED" | "REMOVED";
};
function map(row: CompetitionRow): Competition & {
  isAdmin: boolean;
  membershipStatus: CompetitionRow["membershipStatus"];
} {
  if (row.currency !== "MXN") throw new Error("Unsupported Competition currency.");
  return { ...row, currency: "MXN" };
}

export function createCompetitionRepository(database: typeof db): CompetitionRepository {
  return {
    async createWithAdmin(value, membershipId) {
      await database.transaction(async (tx) => {
        await tx.insert(competition).values(value);
        await tx.insert(competitionParticipant).values({
          id: membershipId,
          competitionId: value.id,
          userId: value.createdByUserId,
          isAdmin: true,
          status: "ACTIVE",
          requestedAt: value.createdAt,
          approvedAt: value.createdAt,
          statusChangedAt: value.createdAt,
          updatedByUserId: value.createdByUserId,
          createdAt: value.createdAt,
          updatedAt: value.updatedAt,
        });
      });
    },
    async listForUser(userId) {
      const rows = await database
        .select(selection)
        .from(competitionParticipant)
        .innerJoin(competition, eq(competition.id, competitionParticipant.competitionId))
        .where(
          and(
            eq(competitionParticipant.userId, userId),
            or(
              eq(competitionParticipant.isAdmin, true),
              inArray(competitionParticipant.status, ["PENDING", "ACTIVE"]),
            ),
          ),
        )
        .orderBy(desc(competition.updatedAt));
      return rows.map(map);
    },
    async findForUser(competitionId, userId) {
      const [row] = await database
        .select(selection)
        .from(competitionParticipant)
        .innerJoin(competition, eq(competition.id, competitionParticipant.competitionId))
        .where(
          and(
            eq(competitionParticipant.competitionId, competitionId),
            eq(competitionParticipant.userId, userId),
            or(
              eq(competitionParticipant.isAdmin, true),
              inArray(competitionParticipant.status, ["PENDING", "ACTIVE"]),
            ),
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
