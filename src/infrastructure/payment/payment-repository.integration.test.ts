import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createQuestion } from "@/domain/round/round";
import {
  competition,
  payment,
  paymentEvent,
  paymentObligation,
  prizeConfiguration,
  prizeConfigurationEvent,
} from "@/infrastructure/db/schema";
import { createCompetitionRepository } from "@/infrastructure/competition/competition-repository";
import { createRoundRepository } from "@/infrastructure/round/round-repository";
import {
  createIntegrationDatabase,
  IntegrationTestData,
} from "@/test/integration/database";
import { createPaymentRepository } from "./payment-repository";

const { client, database } = createIntegrationDatabase();
const payments = createPaymentRepository(database);
const rounds = createRoundRepository(database);
const competitions = createCompetitionRepository(database);
const data = new IntegrationTestData(database);

describe("payment persistence", () => {
  afterEach(() => data.cleanup());
  afterAll(() => client.end());

  it("creates publication obligations and audits idempotent payments/corrections", async () => {
    const admin = await data.createUser({ email: `${randomUUID()}@example.test` });
    const person = await data.createUser({ email: `${randomUUID()}@example.test` });
    const value = data.competitionValue({ creatorId: admin.id });
    const adminMembershipId = randomUUID();
    await competitions.createWithAdmin(value, adminMembershipId);
    const participant = await data.createMembership({
      competitionId: value.id,
      userId: person.id,
      status: "ACTIVE",
      isAdmin: false,
      requestedAt: new Date(),
      approvedAt: new Date(),
      statusChangedAt: new Date(),
      updatedByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await payments.configure(value.id, admin.id, new Date(), () => ({
      financialFeaturesEnabled: true,
      roundFeeAmount: 5000,
      maximumDebt: 0,
      prizes: { ROUND_WINNER: 10000 },
    }));
    await database
      .update(competition)
      .set({ status: "STARTED", startedAt: new Date() })
      .where(eq(competition.id, value.id));
    const roundId = randomUUID();
    const future = new Date(Date.now() + 86_400_000);
    await rounds.create(
      {
        id: roundId,
        competitionId: value.id,
        sequence: 1,
        name: "Con cuota",
        startsAt: future,
        status: "DRAFT",
        unansweredPenalty: -1,
        publishedAt: null,
        finishedAt: null,
        finalizedAt: null,
        createdByUserId: admin.id,
        updatedByUserId: admin.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      admin.id,
    );
    const question = createQuestion({
      id: randomUUID(),
      roundId,
      sequence: 1,
      type: "OPEN_TEXT",
      prompt: "Pregunta",
      points: 1,
      deadlineAt: future,
      actorUserId: admin.id,
    });
    await rounds.mutateQuestion(roundId, admin.id, () => ({
      kind: "save",
      value: question,
      isNew: true,
    }));
    await rounds.publish(roundId, admin.id, new Date());
    await rounds.publish(roundId, admin.id, new Date());
    expect(
      await database
        .select()
        .from(paymentObligation)
        .where(eq(paymentObligation.competitionId, value.id)),
    ).toHaveLength(2);

    const paymentId = randomUUID();
    const paidAt = new Date(Date.now() - 60_000);
    await payments.record(
      value.id,
      participant.id,
      paymentId,
      admin.id,
      5000,
      paidAt,
      new Date(),
    );
    await payments.record(
      value.id,
      participant.id,
      paymentId,
      admin.id,
      5000,
      paidAt,
      new Date(),
    );
    expect(
      await database.select().from(payment).where(eq(payment.id, paymentId)),
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(paymentEvent)
        .where(eq(paymentEvent.paymentId, paymentId)),
    ).toHaveLength(1);
    expect(
      (await payments.getMine(value.id, person.id))?.participants.find(
        (item) => item.participantId === participant.id,
      ),
    ).toMatchObject({ balance: 0, restricted: false });
    await expect(payments.getMine(value.id, person.id)).resolves.toMatchObject({
      actorIsAdmin: false,
      participants: [{ participantId: participant.id }],
    });
    await expect(payments.getAdmin(value.id, person.id)).resolves.toBeNull();

    await payments.update(value.id, paymentId, admin.id, 2500, paidAt, new Date());
    const events = await database
      .select()
      .from(paymentEvent)
      .where(eq(paymentEvent.paymentId, paymentId));
    expect(events).toHaveLength(2);
    expect(events.find((event) => event.action === "CORRECTED")).toMatchObject({
      beforeAmount: 5000,
      afterAmount: 2500,
      actorUserId: admin.id,
    });
    expect(
      (await payments.getMine(value.id, person.id))?.participants.find(
        (item) => item.participantId === participant.id,
      ),
    ).toMatchObject({ balance: 2500, restricted: true });
    await expect(payments.getPrizes(value.id, person.id)).resolves.toEqual({
      currency: "MXN",
      financialFeaturesEnabled: true,
      prizes: [{ type: "ROUND_WINNER", amount: 10000 }],
    });
  });

  it("atomically audits prize upserts and removals", async () => {
    const admin = await data.createUser({ email: `${randomUUID()}@example.test` });
    const value = data.competitionValue({ creatorId: admin.id });
    await competitions.createWithAdmin(value, randomUUID());
    const now = new Date();
    await payments.configure(value.id, admin.id, now, () => ({
      financialFeaturesEnabled: true,
      roundFeeAmount: null,
      maximumDebt: null,
      prizes: { LEAGUE_WINNER: 100_000 },
    }));
    await payments.configure(value.id, admin.id, new Date(now.valueOf() + 1), () => ({
      financialFeaturesEnabled: false,
      roundFeeAmount: null,
      maximumDebt: null,
      prizes: {},
    }));
    expect(
      await database
        .select()
        .from(prizeConfiguration)
        .where(eq(prizeConfiguration.competitionId, value.id)),
    ).toHaveLength(0);
    expect(
      await database
        .select({
          action: prizeConfigurationEvent.action,
          beforeAmount: prizeConfigurationEvent.beforeAmount,
          afterAmount: prizeConfigurationEvent.afterAmount,
          actorUserId: prizeConfigurationEvent.actorUserId,
        })
        .from(prizeConfigurationEvent)
        .where(eq(prizeConfigurationEvent.competitionId, value.id)),
    ).toEqual([
      {
        action: "UPSERTED",
        beforeAmount: null,
        afterAmount: 100_000,
        actorUserId: admin.id,
      },
      {
        action: "REMOVED",
        beforeAmount: 100_000,
        afterAmount: null,
        actorUserId: admin.id,
      },
    ]);
  });
});
