import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  competition as competitionTable,
  competitionParticipant,
  competitionParticipantEvent,
  h2hPhaseConfiguration,
  round,
} from "@/infrastructure/db/schema";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createCompetitionRepository } from "./competition-repository";
import { createMembershipRepository } from "./membership-repository";

const { client, database } = createIntegrationDatabase();
const testData = new IntegrationTestData(database);
const competitions = createCompetitionRepository(database);
const memberships = createMembershipRepository(database);
const adminId = "m3-admin";
const participantId = "m3-participant";
const otherId = "m3-other";

describe("membership persistence", () => {
  beforeEach(async () => {
    await testData.createUser({
      id: adminId,
      name: "Admin",
      email: "m3-admin@example.test",
    });
    await testData.createUser({
      id: participantId,
      name: "Participante",
      email: "m3-participant@example.test",
    });
    await testData.createUser({
      id: otherId,
      name: "Otra persona",
      email: "m3-other@example.test",
    });
  });

  afterEach(async () => testData.cleanup());

  afterAll(async () => {
    await client.end();
  });

  const competition = (id = randomUUID(), creatorId = adminId) =>
    testData.competitionValue({
      id,
      creatorId,
      name: "Copa M3",
      rulesNote: "Reglas M3",
    });

  it("preserves one row through request, approval, removal, and reapproval", async () => {
    const value = competition();
    await competitions.createWithAdmin(value, randomUUID());
    expect(await memberships.setInvitation(value.id, adminId, "hash", null)).toBe(true);

    const first = await memberships.request({
      competitionId: value.id,
      userId: participantId,
      membershipId: randomUUID(),
      invitationHash: "hash",
      now: new Date("2026-08-24T10:00:00Z"),
    });
    const retry = await memberships.request({
      competitionId: value.id,
      userId: participantId,
      membershipId: randomUUID(),
      invitationHash: "hash",
      now: new Date("2026-08-24T10:01:00Z"),
    });
    expect(first).toEqual({ status: "PENDING", changed: true });
    expect(retry).toEqual({ status: "PENDING", changed: false });

    const [pending] = await database
      .select({ id: competitionParticipant.id })
      .from(competitionParticipant)
      .where(
        and(
          eq(competitionParticipant.competitionId, value.id),
          eq(competitionParticipant.userId, participantId),
        ),
      );
    expect(
      await memberships.transition({
        competitionId: value.id,
        membershipId: String(pending?.id),
        actorUserId: adminId,
        action: "APPROVE",
        now: new Date("2026-08-24T10:02:00Z"),
      }),
    ).toBe(true);
    expect(
      await memberships.transition({
        competitionId: value.id,
        membershipId: String(pending?.id),
        actorUserId: adminId,
        action: "REMOVE",
        now: new Date("2026-08-24T10:03:00Z"),
      }),
    ).toBe(true);
    await memberships.request({
      competitionId: value.id,
      userId: participantId,
      membershipId: randomUUID(),
      invitationHash: "hash",
      now: new Date("2026-08-24T10:04:00Z"),
    });

    const [row] = await database
      .select()
      .from(competitionParticipant)
      .where(
        and(
          eq(competitionParticipant.competitionId, value.id),
          eq(competitionParticipant.userId, participantId),
        ),
      );
    const events = await database
      .select({
        type: competitionParticipantEvent.type,
        previousStatus: competitionParticipantEvent.previousStatus,
        nextStatus: competitionParticipantEvent.nextStatus,
      })
      .from(competitionParticipantEvent)
      .where(eq(competitionParticipantEvent.membershipId, row!.id))
      .orderBy(asc(competitionParticipantEvent.createdAt));
    expect(row).toMatchObject({
      id: pending?.id,
      status: "PENDING",
      updatedByUserId: participantId,
    });
    expect(events).toMatchObject([
      { type: "REQUESTED", previousStatus: null, nextStatus: "PENDING" },
      { type: "APPROVED", previousStatus: "PENDING", nextStatus: "ACTIVE" },
      { type: "REMOVED", previousStatus: "ACTIVE", nextStatus: "REMOVED" },
      { type: "REQUESTED", previousStatus: "REMOVED", nextStatus: "PENDING" },
    ]);
  });

  it("returns every Competition-level rule without unpublished Round data", async () => {
    const value = competition();
    await competitions.createWithAdmin(value, randomUUID(), {
      financialFeaturesEnabled: true,
      roundFeeAmount: 25_000,
      maximumDebt: 50_000,
      prizes: { ROUND_WINNER: 100_000, LEAGUE_WINNER: 500_000 },
    });
    expect(await memberships.setInvitation(value.id, adminId, "rules-hash", null)).toBe(
      true,
    );

    await expect(
      memberships.findInvitation("rules-hash", participantId),
    ).resolves.toMatchObject({
      competitionId: value.id,
      phase: { type: "LEAGUE" },
      scoringDefaults: {
        matchScore: {
          exactScorePoints: 3,
          goalDifferencePoints: 2,
          normalResultPoints: 1,
        },
        closestValuePoints: 1,
        optionsPoints: 1,
        openTextPoints: 1,
        exactValuePoints: 1,
      },
      financial: {
        enabled: true,
        roundFeeAmount: 25_000,
        maximumDebt: 50_000,
        prizes: [
          { type: "ROUND_WINNER", amount: 100_000 },
          { type: "LEAGUE_WINNER", amount: 500_000 },
        ],
      },
    });
  });

  it("rejects cross-Competition membership IDs without writing an event", async () => {
    const first = competition();
    const second = competition(randomUUID(), otherId);
    await competitions.createWithAdmin(first, randomUUID());
    const otherMembershipId = randomUUID();
    await competitions.createWithAdmin(second, otherMembershipId);

    expect(
      await memberships.transition({
        competitionId: first.id,
        membershipId: otherMembershipId,
        actorUserId: adminId,
        action: "REMOVE",
        now: new Date(),
      }),
    ).toBe(false);
    const [eventCount] = await database
      .select({ count: count() })
      .from(competitionParticipantEvent);
    expect(eventCount?.count).toBe(0);
  });

  it("starts atomically and invalidates the invitation", async () => {
    const value = competition();
    await competitions.createWithAdmin(value, randomUUID());
    await memberships.setInvitation(value.id, adminId, "active-hash", null);
    const startedAt = new Date("2026-08-24T12:00:00Z");

    expect(await memberships.start(value.id, adminId, startedAt)).toBe(true);
    const [row] = await database
      .select()
      .from(competitionTable)
      .where(eq(competitionTable.id, value.id));
    expect(row).toMatchObject({
      status: "STARTED",
      invitationTokenHash: null,
    });
    expect(row?.startedAt).toEqual(startedAt);
    expect(row?.invitationInvalidatedAt).toEqual(startedAt);
    await expect(
      memberships.request({
        competitionId: value.id,
        userId: participantId,
        membershipId: randomUUID(),
        invitationHash: "active-hash",
        now: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("preserves Admin capability through leave, self-request, and self-approval", async () => {
    const value = competition();
    await competitions.createWithAdmin(value, randomUUID());
    await memberships.setInvitation(value.id, adminId, "admin-hash", null);

    expect(await memberships.leave(value.id, adminId, new Date())).toBe(true);
    const removedRoster = await memberships.list(value.id, adminId);
    const removedAdmin = removedRoster?.[0];
    expect(removedAdmin).toMatchObject({
      userId: adminId,
      isAdmin: true,
      status: "REMOVED",
    });

    await memberships.request({
      competitionId: value.id,
      userId: adminId,
      membershipId: randomUUID(),
      invitationHash: "admin-hash",
      now: new Date(),
    });
    const pendingRoster = await memberships.list(value.id, adminId);
    const pendingAdmin = pendingRoster?.[0];
    expect(
      await memberships.transition({
        competitionId: value.id,
        membershipId: pendingAdmin!.id,
        actorUserId: adminId,
        action: "APPROVE",
        now: new Date(),
      }),
    ).toBe(true);
    const activeRoster = await memberships.list(value.id, adminId);
    const activeAdmin = activeRoster?.[0];
    expect(activeAdmin).toMatchObject({ isAdmin: true, status: "ACTIVE" });
  });

  it("serializes concurrent approvals at the LEAGUE_PLAYOFFS maximum", async () => {
    const value = { ...competition(), type: "LEAGUE_PLAYOFFS" as const };
    await competitions.createWithAdmin(value, randomUUID());
    const activeUsers = Array.from({ length: 28 }, (_, index) => ({
      id: `m3-concurrent-active-${index}`,
      email: `m3-concurrent-active-${index}@example.test`,
    }));
    const pendingUsers = [
      {
        id: "m3-concurrent-pending-one",
        email: "m3-concurrent-pending-one@example.test",
      },
      {
        id: "m3-concurrent-pending-two",
        email: "m3-concurrent-pending-two@example.test",
      },
    ];

    for (const candidate of [...activeUsers, ...pendingUsers]) {
      await testData.createUser({
        id: candidate.id,
        name: "Concurrente",
        email: candidate.email,
      });
    }
    for (const candidate of activeUsers) {
      await testData.createMembership({
        competitionId: value.id,
        userId: candidate.id,
        status: "ACTIVE",
        approvedAt: new Date(),
        statusChangedAt: new Date(),
        updatedByUserId: adminId,
      });
    }
    const pendingMembershipIds = pendingUsers.map(() => randomUUID());
    for (const [index, candidate] of pendingUsers.entries()) {
      const membershipId = pendingMembershipIds[index]!;
      await testData.createMembership({
        id: membershipId,
        competitionId: value.id,
        userId: candidate.id,
        status: "PENDING",
        requestedAt: new Date(),
        statusChangedAt: new Date(),
        updatedByUserId: candidate.id,
      });
    }

    const results = await Promise.all(
      pendingMembershipIds.map((membershipId) =>
        memberships.transition({
          competitionId: value.id,
          membershipId,
          actorUserId: adminId,
          action: "APPROVE",
          now: new Date(),
        }),
      ),
    );
    const [activeCount] = await database
      .select({ count: count() })
      .from(competitionParticipant)
      .where(
        and(
          eq(competitionParticipant.competitionId, value.id),
          eq(competitionParticipant.status, "ACTIVE"),
        ),
      );
    expect(results.sort()).toEqual([false, true]);
    expect(activeCount?.count).toBe(30);
  });

  it("revalidates GROUP_PLAYOFFS configuration against the final roster", async () => {
    const value = { ...competition(), type: "GROUP_PLAYOFFS" as const };
    await competitions.createWithAdmin(value, randomUUID());
    const rosterIds: string[] = [];
    for (let index = 1; index < 16; index += 1) {
      const candidate = await testData.createUser({
        email: `m3-group-roster-${index}@example.test`,
      });
      const membership = await testData.createMembership({
        competitionId: value.id,
        userId: candidate.id,
        status: "ACTIVE",
        statusChangedAt: new Date(),
        updatedByUserId: adminId,
      });
      rosterIds.push(membership.id);
    }
    const now = new Date();
    await database.insert(h2hPhaseConfiguration).values({
      competitionId: value.id,
      groupSize: 4,
      advancersPerGroup: 1,
      updatedAt: now,
      updatedByUserId: adminId,
    });
    await database.insert(round).values(
      [1, 2, 3].map((sequence) => ({
        id: randomUUID(),
        competitionId: value.id,
        sequence,
        name: `Jornada ${sequence}`,
        startsAt: now,
        status: "DRAFT" as const,
        unansweredPenalty: -1 as const,
        createdByUserId: adminId,
        updatedByUserId: adminId,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await database
      .update(competitionParticipant)
      .set({ status: "REMOVED" })
      .where(
        // Keep the Admin plus seven participants: 8 active makes a field of 2,
        // which is invalid for groupSize=4 and one advancer per group.
        inArray(competitionParticipant.id, rosterIds.slice(7)),
      );

    await expect(memberships.start(value.id, adminId, now)).rejects.toThrow();
    const [stored] = await database
      .select({ status: competitionTable.status })
      .from(competitionTable)
      .where(eq(competitionTable.id, value.id));
    expect(stored?.status).toBe("DRAFT");
  });
});
