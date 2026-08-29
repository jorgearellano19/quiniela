import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { MembershipRepository } from "@/application/competition/membership-use-cases";
import {
  canApproveAtCount,
  requestMembership,
  transitionMembership,
  validateCompetitionStart,
} from "@/domain/competition/membership";
import { db } from "@/infrastructure/db/client";
import {
  competition,
  competitionParticipant,
  competitionParticipantEvent,
  user,
} from "@/infrastructure/db/schema";

function hasAdminCapability(competitionId: string, userId: string) {
  return sql`exists (
    select 1 from ${competitionParticipant} cp
    where cp.competition_id = ${competitionId}
      and cp.user_id = ${userId}
      and cp.is_admin = true
  )`;
}

export function createMembershipRepository(database: typeof db): MembershipRepository {
  return {
    async setInvitation(competitionId, actorUserId, hash, invalidatedAt) {
      const rows = await database
        .update(competition)
        .set({
          invitationTokenHash: hash,
          invitationInvalidatedAt: invalidatedAt,
          updatedAt: new Date(),
          updatedByUserId: actorUserId,
        })
        .where(
          and(
            eq(competition.id, competitionId),
            eq(competition.status, "DRAFT"),
            hasAdminCapability(competitionId, actorUserId),
          ),
        )
        .returning({ id: competition.id });
      return rows.length === 1;
    },
    async findInvitation(hash, userId) {
      const [row] = await database
        .select({
          competitionId: competition.id,
          name: competition.name,
          type: competition.type,
          currency: competition.currency,
          rulesNote: competition.rulesNote,
          membershipStatus: competitionParticipant.status,
        })
        .from(competition)
        .leftJoin(
          competitionParticipant,
          and(
            eq(competitionParticipant.competitionId, competition.id),
            eq(competitionParticipant.userId, userId),
          ),
        )
        .where(
          and(eq(competition.invitationTokenHash, hash), eq(competition.status, "DRAFT")),
        )
        .limit(1);
      if (!row || row.currency !== "MXN") return null;
      return { ...row, currency: "MXN", typeLabel: "" };
    },
    async request(input) {
      return database.transaction(async (tx) => {
        await tx.execute(
          sql`select id from ${competition}
              where id = ${input.competitionId}
                and status = 'DRAFT'
                and invitation_token_hash = ${input.invitationHash}
              for update`,
        );
        const [validInvitation] = await tx
          .select({ id: competition.id })
          .from(competition)
          .where(
            and(
              eq(competition.id, input.competitionId),
              eq(competition.status, "DRAFT"),
              eq(competition.invitationTokenHash, input.invitationHash),
            ),
          )
          .limit(1);
        if (!validInvitation) {
          throw new Error("Invitation is no longer valid.");
        }
        const [existing] = await tx
          .select()
          .from(competitionParticipant)
          .where(
            and(
              eq(competitionParticipant.competitionId, input.competitionId),
              eq(competitionParticipant.userId, input.userId),
            ),
          )
          .limit(1);
        const decision = requestMembership(existing?.status ?? null);
        if (!decision.changed) return { status: decision.next, changed: false };
        const membershipId = existing?.id ?? input.membershipId;
        if (existing)
          await tx
            .update(competitionParticipant)
            .set({
              status: "PENDING",
              requestedAt: input.now,
              statusChangedAt: input.now,
              updatedAt: input.now,
              updatedByUserId: input.userId,
            })
            .where(eq(competitionParticipant.id, existing.id));
        else
          await tx.insert(competitionParticipant).values({
            id: membershipId,
            competitionId: input.competitionId,
            userId: input.userId,
            isAdmin: false,
            status: "PENDING",
            requestedAt: input.now,
            statusChangedAt: input.now,
            updatedByUserId: input.userId,
            createdAt: input.now,
            updatedAt: input.now,
          });
        await tx.insert(competitionParticipantEvent).values({
          id: randomUUID(),
          membershipId,
          actorUserId: input.userId,
          type: "REQUESTED",
          previousStatus: existing?.status ?? null,
          nextStatus: "PENDING",
          createdAt: input.now,
        });
        return { status: decision.next, changed: true };
      });
    },
    async list(competitionId, actorUserId) {
      const [admin] = await database
        .select({ id: competitionParticipant.id })
        .from(competitionParticipant)
        .where(
          and(
            eq(competitionParticipant.competitionId, competitionId),
            eq(competitionParticipant.userId, actorUserId),
            eq(competitionParticipant.isAdmin, true),
          ),
        )
        .limit(1);
      if (!admin) return null;
      return database
        .select({
          id: competitionParticipant.id,
          competitionId: competitionParticipant.competitionId,
          userId: competitionParticipant.userId,
          name: user.name,
          email: user.email,
          isAdmin: competitionParticipant.isAdmin,
          status: competitionParticipant.status,
        })
        .from(competitionParticipant)
        .innerJoin(user, eq(user.id, competitionParticipant.userId))
        .where(eq(competitionParticipant.competitionId, competitionId))
        .orderBy(asc(competitionParticipant.status), asc(user.name));
    },
    async transition(input) {
      return database.transaction(async (tx) => {
        await tx.execute(
          sql`select id from ${competition} where id = ${input.competitionId} for update`,
        );
        const [context] = await tx
          .select({ status: competition.status, type: competition.type })
          .from(competition)
          .where(
            and(
              eq(competition.id, input.competitionId),
              hasAdminCapability(input.competitionId, input.actorUserId),
            ),
          )
          .limit(1);
        const [member] = await tx
          .select()
          .from(competitionParticipant)
          .where(
            and(
              eq(competitionParticipant.id, input.membershipId),
              eq(competitionParticipant.competitionId, input.competitionId),
            ),
          )
          .limit(1);
        if (!context || !member) return false;
        const next = transitionMembership(member.status, input.action, context.status);
        if (input.action === "APPROVE") {
          const [activeCount] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(competitionParticipant)
            .where(
              and(
                eq(competitionParticipant.competitionId, input.competitionId),
                eq(competitionParticipant.status, "ACTIVE"),
              ),
            );
          if (!activeCount || !canApproveAtCount(context.type, activeCount.count)) {
            return false;
          }
        }
        const eventType = (
          {
            APPROVE: "APPROVED",
            REJECT: "REJECTED",
            REMOVE: "REMOVED",
          } as const
        )[input.action];
        await tx
          .update(competitionParticipant)
          .set({
            status: next,
            approvedAt: input.action === "APPROVE" ? input.now : member.approvedAt,
            statusChangedAt: input.now,
            updatedAt: input.now,
            updatedByUserId: input.actorUserId,
          })
          .where(eq(competitionParticipant.id, member.id));
        await tx.insert(competitionParticipantEvent).values({
          id: randomUUID(),
          membershipId: member.id,
          actorUserId: input.actorUserId,
          type: eventType,
          previousStatus: member.status,
          nextStatus: next,
          createdAt: input.now,
        });
        return true;
      });
    },
    async leave(competitionId, actorUserId, now) {
      return database.transaction(async (tx) => {
        await tx.execute(
          sql`select id from ${competition} where id = ${competitionId} for update`,
        );
        const [row] = await tx
          .select({
            membership: competitionParticipant,
            competitionStatus: competition.status,
          })
          .from(competitionParticipant)
          .innerJoin(
            competition,
            eq(competition.id, competitionParticipant.competitionId),
          )
          .where(
            and(
              eq(competitionParticipant.competitionId, competitionId),
              eq(competitionParticipant.userId, actorUserId),
            ),
          )
          .limit(1);
        if (!row) return false;
        const next = transitionMembership(
          row.membership.status,
          "LEAVE",
          row.competitionStatus,
        );
        await tx
          .update(competitionParticipant)
          .set({
            status: next,
            statusChangedAt: now,
            updatedAt: now,
            updatedByUserId: actorUserId,
          })
          .where(eq(competitionParticipant.id, row.membership.id));
        await tx.insert(competitionParticipantEvent).values({
          id: randomUUID(),
          membershipId: row.membership.id,
          actorUserId,
          type: "LEFT",
          previousStatus: row.membership.status,
          nextStatus: next,
          createdAt: now,
        });
        return true;
      });
    },
    async start(competitionId, actorUserId, now) {
      return database.transaction(async (tx) => {
        await tx.execute(
          sql`select id from ${competition} where id = ${competitionId} for update`,
        );
        const [context] = await tx
          .select({ status: competition.status, type: competition.type })
          .from(competition)
          .where(
            and(
              eq(competition.id, competitionId),
              hasAdminCapability(competitionId, actorUserId),
            ),
          )
          .limit(1);
        if (!context) return false;
        const counts = await tx
          .select({
            status: competitionParticipant.status,
            count: sql<number>`count(*)::int`,
          })
          .from(competitionParticipant)
          .where(eq(competitionParticipant.competitionId, competitionId))
          .groupBy(competitionParticipant.status);
        const count = (status: string) =>
          counts.find((item) => item.status === status)?.count ?? 0;
        validateCompetitionStart({
          ...context,
          activeCount: count("ACTIVE"),
          pendingCount: count("PENDING"),
        });
        if (context.type !== "LEAGUE") {
          const phaseRows = await tx.execute<{
            league_round_count: number | null;
            qualifier_count: number | null;
            group_size: number | null;
            advancers_per_group: number | null;
            draft_round_count: number;
            total_round_count: number;
          }>(sql`
            select cfg.league_round_count, cfg.qualifier_count, cfg.group_size,
              cfg.advancers_per_group,
              count(r.id) filter (where r.status = 'DRAFT')::int as draft_round_count,
              count(r.id)::int as total_round_count
            from h2h_phase_configuration cfg
            left join round r on r.competition_id = cfg.competition_id
            where cfg.competition_id = ${competitionId} and cfg.generated_at is null
            group by cfg.league_round_count, cfg.qualifier_count, cfg.group_size,
              cfg.advancers_per_group
          `);
          const phase = phaseRows[0];
          const activeCount = count("ACTIVE");
          const requiredRounds =
            (context.type === "LEAGUE_PLAYOFFS"
              ? phase?.league_round_count
              : phase?.group_size
                ? phase.group_size - 1
                : null) ?? null;
          if (
            requiredRounds === null ||
            phase?.total_round_count !== requiredRounds ||
            phase?.draft_round_count !== requiredRounds ||
            (context.type === "LEAGUE_PLAYOFFS" &&
              (requiredRounds > activeCount - 1 ||
                !phase?.qualifier_count ||
                phase.qualifier_count > activeCount)) ||
            (context.type === "GROUP_PLAYOFFS" &&
              (!phase?.group_size ||
                !phase.advancers_per_group ||
                activeCount % phase.group_size !== 0 ||
                ![4, 8, 16, 32].includes(
                  (activeCount / phase.group_size) * phase.advancers_per_group,
                )))
          )
            throw new Error("H2H phase configuration is incomplete.");
        }
        await tx
          .update(competition)
          .set({
            status: "STARTED",
            startedAt: now,
            invitationTokenHash: null,
            invitationInvalidatedAt: now,
            updatedAt: now,
            updatedByUserId: actorUserId,
          })
          .where(and(eq(competition.id, competitionId), eq(competition.status, "DRAFT")));
        return true;
      });
    },
  };
}
export const membershipRepository = createMembershipRepository(db);
