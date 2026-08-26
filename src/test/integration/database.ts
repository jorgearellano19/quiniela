import { randomUUID } from "node:crypto";
import { inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Competition } from "@/domain/competition/competition";
import type { db as applicationDatabase } from "@/infrastructure/db/client";
import {
  account,
  answer,
  authSecurityEvent,
  competition,
  competitionParticipant,
  competitionParticipantEvent,
  matchQuestionConfig,
  question,
  questionOption,
  questionScoring,
  round,
  session,
  user,
} from "@/infrastructure/db/schema";
import * as schema from "@/infrastructure/db/schema";

export function createIntegrationDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required. Run pnpm db:setup before integration tests.",
    );
  }
  const client = postgres(url, { prepare: false });
  const database = drizzle(client, { schema }) as typeof applicationDatabase;
  return { client, database };
}

export async function cleanupUsersByEmail(
  database: typeof applicationDatabase,
  emails: string[],
) {
  const users = await database
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.email, emails));
  const userIds = users.map(({ id }) => id);
  if (!userIds.length) return;

  await database.transaction(async (transaction) => {
    const competitions = await transaction
      .select({ id: competition.id })
      .from(competition)
      .where(inArray(competition.createdByUserId, userIds));
    const competitionIds = competitions.map(({ id }) => id);

    if (competitionIds.length) {
      const rounds = await database
        .select({ id: round.id })
        .from(round)
        .where(inArray(round.competitionId, competitionIds));
      const roundIds = rounds.map(({ id }) => id);
      if (roundIds.length) {
        const questions = await database
          .select({ id: question.id })
          .from(question)
          .where(inArray(question.roundId, roundIds));
        const questionIds = questions.map(({ id }) => id);
        if (questionIds.length) {
          await database.delete(answer).where(inArray(answer.questionId, questionIds));
          await database
            .delete(questionOption)
            .where(inArray(questionOption.questionId, questionIds));
          await database
            .delete(matchQuestionConfig)
            .where(inArray(matchQuestionConfig.questionId, questionIds));
          await database
            .delete(questionScoring)
            .where(inArray(questionScoring.questionId, questionIds));
          await database.delete(question).where(inArray(question.id, questionIds));
        }
        await database.delete(round).where(inArray(round.id, roundIds));
      }
      const memberships = await transaction
        .select({ id: competitionParticipant.id })
        .from(competitionParticipant)
        .where(inArray(competitionParticipant.competitionId, competitionIds));
      const membershipIds = memberships.map(({ id }) => id);

      if (membershipIds.length) {
        await transaction
          .delete(competitionParticipantEvent)
          .where(inArray(competitionParticipantEvent.membershipId, membershipIds));
      }
      await transaction
        .delete(competitionParticipant)
        .where(inArray(competitionParticipant.competitionId, competitionIds));
      await transaction
        .delete(competition)
        .where(inArray(competition.id, competitionIds));
    }

    await transaction
      .delete(authSecurityEvent)
      .where(
        or(
          inArray(authSecurityEvent.actorUserId, userIds),
          inArray(authSecurityEvent.targetUserId, userIds),
        ),
      );
    await transaction.delete(session).where(inArray(session.userId, userIds));
    await transaction.delete(account).where(inArray(account.userId, userIds));
    await transaction.delete(user).where(inArray(user.id, userIds));
  });
}

export class IntegrationTestData {
  readonly #competitionIds = new Set<string>();
  readonly #userIds = new Set<string>();

  constructor(private readonly database: typeof applicationDatabase) {}

  async createUser(
    overrides: Partial<typeof user.$inferInsert> = {},
  ): Promise<typeof user.$inferSelect> {
    const id = overrides.id ?? randomUUID();
    const [created] = await this.database
      .insert(user)
      .values({
        id,
        name: overrides.name ?? "Persona de prueba",
        email: overrides.email ?? `${id}@example.test`,
        ...overrides,
      })
      .returning();
    if (!created) throw new Error("Expected test User creation to succeed.");
    this.#userIds.add(created.id);
    return created;
  }

  competitionValue(input: {
    creatorId: string;
    id?: string;
    name?: string;
    type?: Competition["type"];
    rulesNote?: string | null;
  }): Competition {
    const now = new Date();
    const id = input.id ?? randomUUID();
    this.#competitionIds.add(id);
    return {
      id,
      name: input.name ?? "Copa de prueba",
      type: input.type ?? "LEAGUE",
      status: "DRAFT",
      currency: "MXN",
      rulesNote: input.rulesNote ?? null,
      invitationTokenHash: null,
      invitationInvalidatedAt: null,
      startedAt: null,
      createdByUserId: input.creatorId,
      updatedByUserId: input.creatorId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async createMembership(
    input: Omit<typeof competitionParticipant.$inferInsert, "id"> & { id?: string },
  ) {
    const [created] = await this.database
      .insert(competitionParticipant)
      .values({ id: input.id ?? randomUUID(), ...input })
      .returning();
    if (!created) throw new Error("Expected test membership creation to succeed.");
    return created;
  }

  async cleanup() {
    const competitionIds = [...this.#competitionIds];
    const userIds = [...this.#userIds];

    if (competitionIds.length) {
      const rounds = await this.database
        .select({ id: round.id })
        .from(round)
        .where(inArray(round.competitionId, competitionIds));
      const roundIds = rounds.map(({ id }) => id);
      if (roundIds.length) {
        const questions = await this.database
          .select({ id: question.id })
          .from(question)
          .where(inArray(question.roundId, roundIds));
        const questionIds = questions.map(({ id }) => id);
        if (questionIds.length) {
          await this.database
            .delete(answer)
            .where(inArray(answer.questionId, questionIds));
          await this.database
            .delete(questionOption)
            .where(inArray(questionOption.questionId, questionIds));
          await this.database
            .delete(matchQuestionConfig)
            .where(inArray(matchQuestionConfig.questionId, questionIds));
          await this.database
            .delete(questionScoring)
            .where(inArray(questionScoring.questionId, questionIds));
          await this.database.delete(question).where(inArray(question.id, questionIds));
        }
        await this.database.delete(round).where(inArray(round.id, roundIds));
      }
      const memberships = await this.database
        .select({ id: competitionParticipant.id })
        .from(competitionParticipant)
        .where(inArray(competitionParticipant.competitionId, competitionIds));
      const membershipIds = memberships.map(({ id }) => id);
      if (membershipIds.length) {
        await this.database
          .delete(competitionParticipantEvent)
          .where(inArray(competitionParticipantEvent.membershipId, membershipIds));
      }
      await this.database
        .delete(competitionParticipant)
        .where(inArray(competitionParticipant.competitionId, competitionIds));
      await this.database
        .delete(competition)
        .where(inArray(competition.id, competitionIds));
    }

    if (userIds.length) {
      await this.database
        .delete(authSecurityEvent)
        .where(
          or(
            inArray(authSecurityEvent.actorUserId, userIds),
            inArray(authSecurityEvent.targetUserId, userIds),
          ),
        );
      await this.database.delete(session).where(inArray(session.userId, userIds));
      await this.database.delete(account).where(inArray(account.userId, userIds));
      await this.database.delete(user).where(inArray(user.id, userIds));
    }

    this.#competitionIds.clear();
    this.#userIds.clear();
  }
}
