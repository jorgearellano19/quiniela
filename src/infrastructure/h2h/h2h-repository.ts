import { and, asc, eq, or, sql } from "drizzle-orm";
import type { H2HRepository, H2HStructure } from "@/application/h2h/use-cases";
import { db } from "@/infrastructure/db/client";
import {
  competition,
  competitionGroup,
  competitionGroupParticipant,
  competitionParticipant,
  h2hDrawParticipant,
  h2hMatchup,
  h2hPhaseConfiguration,
  round,
  user,
} from "@/infrastructure/db/schema";

async function load(
  database: typeof db,
  competitionId: string,
  userId: string,
): Promise<H2HStructure | null> {
  const [scope] = await database
    .select({ competition, membership: competitionParticipant })
    .from(competition)
    .innerJoin(
      competitionParticipant,
      and(
        eq(competitionParticipant.competitionId, competition.id),
        eq(competitionParticipant.userId, userId),
        or(
          eq(competitionParticipant.isAdmin, true),
          eq(competitionParticipant.status, "ACTIVE"),
        ),
      ),
    )
    .where(eq(competition.id, competitionId))
    .limit(1);
  if (!scope) return null;
  const [participants, rounds, configurations, matchups, draws, groups, groupMembers] =
    await Promise.all([
      database
        .select({
          id: competitionParticipant.id,
          name: user.name,
          userId: competitionParticipant.userId,
        })
        .from(competitionParticipant)
        .innerJoin(user, eq(user.id, competitionParticipant.userId))
        .where(
          and(
            eq(competitionParticipant.competitionId, competitionId),
            eq(competitionParticipant.status, "ACTIVE"),
          ),
        )
        .orderBy(asc(competitionParticipant.id)),
      database
        .select({ id: round.id, sequence: round.sequence, status: round.status })
        .from(round)
        .where(eq(round.competitionId, competitionId))
        .orderBy(asc(round.sequence)),
      database
        .select()
        .from(h2hPhaseConfiguration)
        .where(eq(h2hPhaseConfiguration.competitionId, competitionId))
        .limit(1),
      database
        .select({
          id: h2hMatchup.id,
          roundId: h2hMatchup.roundId,
          groupId: h2hMatchup.groupId,
          participantAId: h2hMatchup.participantAId,
          participantBId: h2hMatchup.participantBId,
          position: h2hMatchup.position,
        })
        .from(h2hMatchup)
        .innerJoin(round, eq(round.id, h2hMatchup.roundId))
        .where(eq(h2hMatchup.competitionId, competitionId))
        .orderBy(asc(round.sequence), asc(h2hMatchup.position)),
      database
        .select()
        .from(h2hDrawParticipant)
        .where(eq(h2hDrawParticipant.competitionId, competitionId))
        .orderBy(asc(h2hDrawParticipant.position)),
      database
        .select()
        .from(competitionGroup)
        .where(eq(competitionGroup.competitionId, competitionId))
        .orderBy(asc(competitionGroup.position)),
      database
        .select()
        .from(competitionGroupParticipant)
        .where(eq(competitionGroupParticipant.competitionId, competitionId))
        .orderBy(
          asc(competitionGroupParticipant.groupId),
          asc(competitionGroupParticipant.position),
        ),
    ]);
  const configuration = configurations[0];
  return {
    competition: {
      id: scope.competition.id,
      type: scope.competition.type,
      status: scope.competition.status,
    },
    actorIsAdmin: scope.membership.isAdmin,
    participants: participants.map(({ id, name }) => ({ id, name })),
    rounds,
    configuration: configuration
      ? configuration.leagueRoundCount !== null
        ? {
            type: "LEAGUE_PLAYOFFS",
            roundCount: configuration.leagueRoundCount,
            qualifierCount: configuration.qualifierCount as 2 | 4 | 8 | 16,
          }
        : {
            type: "GROUP_PLAYOFFS",
            groupSize: configuration.groupSize as 4 | 8,
            advancersPerGroup: configuration.advancersPerGroup as 1 | 2,
          }
      : null,
    generated: Boolean(configuration?.generatedAt) || matchups.length > 0,
    currentParticipantId:
      participants.find((participant) => participant.userId === userId)?.id ?? null,
    drawOrder: draws.map((item) => item.participantId),
    groups: groups.map((group) => ({
      id: group.id,
      position: group.position,
      participantIds: groupMembers
        .filter((member) => member.groupId === group.id)
        .map((member) => member.participantId),
    })),
    matchups: matchups.map(
      ({ id, roundId, groupId, participantAId, participantBId, position }) => ({
        id,
        roundId,
        groupId,
        participantAId,
        participantBId,
        position,
      }),
    ),
  };
}

export function createH2HRepository(database: typeof db): H2HRepository {
  return {
    get(competitionId, userId) {
      return load(database, competitionId, userId);
    },
    async configure(competitionId, userId, configuration, now) {
      const [admin] = await database
        .select({ id: competition.id })
        .from(competition)
        .innerJoin(
          competitionParticipant,
          and(
            eq(competitionParticipant.competitionId, competition.id),
            eq(competitionParticipant.userId, userId),
            eq(competitionParticipant.isAdmin, true),
          ),
        )
        .where(and(eq(competition.id, competitionId), eq(competition.status, "DRAFT")))
        .limit(1);
      if (!admin) return false;
      await database
        .insert(h2hPhaseConfiguration)
        .values({
          competitionId,
          leagueRoundCount:
            configuration.type === "LEAGUE_PLAYOFFS" ? configuration.roundCount : null,
          qualifierCount:
            configuration.type === "LEAGUE_PLAYOFFS"
              ? configuration.qualifierCount
              : null,
          groupSize:
            configuration.type === "GROUP_PLAYOFFS" ? configuration.groupSize : null,
          advancersPerGroup:
            configuration.type === "GROUP_PLAYOFFS"
              ? configuration.advancersPerGroup
              : null,
          updatedAt: now,
          updatedByUserId: userId,
        })
        .onConflictDoUpdate({
          target: h2hPhaseConfiguration.competitionId,
          set: {
            leagueRoundCount:
              configuration.type === "LEAGUE_PLAYOFFS" ? configuration.roundCount : null,
            qualifierCount:
              configuration.type === "LEAGUE_PLAYOFFS"
                ? configuration.qualifierCount
                : null,
            groupSize:
              configuration.type === "GROUP_PLAYOFFS" ? configuration.groupSize : null,
            advancersPerGroup:
              configuration.type === "GROUP_PLAYOFFS"
                ? configuration.advancersPerGroup
                : null,
            updatedAt: now,
            updatedByUserId: userId,
          },
        });
      return true;
    },
    async generate(competitionId, userId, operation) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`select c.id from competition c join competition_participant cp on cp.competition_id = c.id and cp.user_id = ${userId} and cp.is_admin = true where c.id = ${competitionId} and c.status = 'STARTED' for update`,
        );
        if (!locked.length) return null;
        const txDb = tx as unknown as typeof db;
        const aggregate = await load(txDb, competitionId, userId);
        if (!aggregate) return null;
        if (aggregate.generated) return aggregate;
        const write = operation(aggregate);
        if (write.drawOrder.length)
          await tx.insert(h2hDrawParticipant).values(
            write.drawOrder.map((participantId, index) => ({
              competitionId,
              participantId,
              position: index + 1,
            })),
          );
        for (const group of write.groups) {
          await tx.insert(competitionGroup).values({
            id: group.id,
            competitionId,
            position: group.position,
            confirmedAt: write.generatedAt,
            confirmedByUserId: write.actorUserId,
          });
          await tx.insert(competitionGroupParticipant).values(
            group.participantIds.map((participantId, index) => ({
              groupId: group.id,
              competitionId,
              participantId,
              position: index + 1,
            })),
          );
        }
        if (write.matchups.length)
          await tx.insert(h2hMatchup).values(
            write.matchups.map((matchup) => ({
              ...matchup,
              competitionId,
              createdAt: write.generatedAt,
              updatedAt: write.generatedAt,
            })),
          );
        await tx
          .update(h2hPhaseConfiguration)
          .set({
            generatedAt: write.generatedAt,
            generatedByUserId: write.actorUserId,
            updatedAt: write.generatedAt,
            updatedByUserId: write.actorUserId,
          })
          .where(eq(h2hPhaseConfiguration.competitionId, competitionId));
        return load(txDb, competitionId, userId);
      });
    },
  };
}

export const h2hRepository = createH2HRepository(db);
