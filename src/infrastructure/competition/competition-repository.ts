import { randomUUID } from "node:crypto";
import { and, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import type { CompetitionRepository } from "@/application/competition/use-cases";
import type { Competition } from "@/domain/competition/competition";
import { db } from "@/infrastructure/db/client";
import {
  competition,
  competitionParticipant,
  prizeConfiguration,
  prizeConfigurationEvent,
} from "@/infrastructure/db/schema";

const selection = {
  id: competition.id,
  name: competition.name,
  type: competition.type,
  status: competition.status,
  currency: competition.currency,
  financialFeaturesEnabled: competition.financialFeaturesEnabled,
  rulesNote: competition.rulesNote,
  createdByUserId: competition.createdByUserId,
  updatedByUserId: competition.updatedByUserId,
  createdAt: competition.createdAt,
  updatedAt: competition.updatedAt,
  invitationTokenHash: competition.invitationTokenHash,
  invitationInvalidatedAt: competition.invitationInvalidatedAt,
  startedAt: competition.startedAt,
  completedAt: competition.completedAt,
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
    async createWithAdmin(value, membershipId, paymentConfiguration) {
      await database.transaction(async (tx) => {
        await tx.insert(competition).values({
          ...value,
          financialFeaturesEnabled:
            paymentConfiguration?.financialFeaturesEnabled ?? false,
          roundFeeAmount: paymentConfiguration?.roundFeeAmount ?? null,
          maximumDebt: paymentConfiguration?.maximumDebt ?? null,
        });
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
        const prizes = paymentConfiguration?.prizes ?? {};
        for (const [type, amount] of Object.entries(prizes)) {
          const prizeType = type as typeof prizeConfiguration.$inferInsert.type;
          await tx.insert(prizeConfiguration).values({
            id: randomUUID(),
            competitionId: value.id,
            type: prizeType,
            amount,
            updatedByUserId: value.createdByUserId,
            createdAt: value.createdAt,
            updatedAt: value.updatedAt,
          });
          await tx.insert(prizeConfigurationEvent).values({
            id: randomUUID(),
            competitionId: value.id,
            type: prizeType,
            action: "UPSERTED",
            beforeAmount: null,
            afterAmount: amount,
            actorUserId: value.createdByUserId,
            createdAt: value.createdAt,
          });
        }
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
            sql`(
              (${value.type} = 'LEAGUE' and not exists (
                select 1 from ${prizeConfiguration}
                where ${prizeConfiguration.competitionId} = ${competition.id}
                  and ${prizeConfiguration.type} not in ('ROUND_WINNER', 'LEAGUE_WINNER')
              )) or
              (${value.type} = 'LEAGUE_PLAYOFFS' and not exists (
                select 1 from ${prizeConfiguration}
                where ${prizeConfiguration.competitionId} = ${competition.id}
                  and ${prizeConfiguration.type} not in ('ROUND_WINNER', 'LEAGUE_PHASE_WINNER', 'PLAYOFF_CHAMPION')
              )) or
              (${value.type} = 'GROUP_PLAYOFFS'
                and ${competition.roundFeeAmount} is null
                and ${competition.maximumDebt} is null
                and not exists (
                  select 1 from ${prizeConfiguration}
                  where ${prizeConfiguration.competitionId} = ${competition.id}
                    and ${prizeConfiguration.type} <> 'PLAYOFF_CHAMPION'
                ))
            )`,
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
