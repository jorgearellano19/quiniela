import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Competition } from "@/domain/competition/competition";
import type { db as applicationDatabase } from "@/infrastructure/db/client";
import {
  account,
  answer,
  authSecurityEvent,
  competition,
  competitionGroup,
  competitionGroupParticipant,
  competitionParticipant,
  competitionParticipantEvent,
  matchQuestionConfig,
  h2hDrawParticipant,
  h2hMatchup,
  h2hPhaseConfiguration,
  manualRankingResolution,
  manualRankingResolutionEntry,
  officialResult,
  officialResultCorrectionEvent,
  openTextJudgment,
  openTextJudgmentCorrectionEvent,
  payment,
  paymentEvent,
  paymentObligation,
  playoffMatchup,
  playoffMatchupResolutionEvent,
  playoffRound,
  playoffSeed,
  prizeConfiguration,
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
      const paymentRows = await transaction
        .select({ id: payment.id })
        .from(payment)
        .innerJoin(
          competitionParticipant,
          eq(payment.competitionParticipantId, competitionParticipant.id),
        )
        .where(inArray(competitionParticipant.competitionId, competitionIds));
      if (paymentRows.length) {
        await transaction.delete(paymentEvent).where(
          inArray(
            paymentEvent.paymentId,
            paymentRows.map(({ id }) => id),
          ),
        );
        await transaction.delete(payment).where(
          inArray(
            payment.id,
            paymentRows.map(({ id }) => id),
          ),
        );
      }
      await transaction
        .delete(paymentObligation)
        .where(inArray(paymentObligation.competitionId, competitionIds));
      await transaction
        .delete(prizeConfiguration)
        .where(inArray(prizeConfiguration.competitionId, competitionIds));
      const resolutions = await transaction
        .select({ id: manualRankingResolution.id })
        .from(manualRankingResolution)
        .where(inArray(manualRankingResolution.competitionId, competitionIds));
      if (resolutions.length) {
        await transaction.delete(manualRankingResolutionEntry).where(
          inArray(
            manualRankingResolutionEntry.resolutionId,
            resolutions.map(({ id }) => id),
          ),
        );
        await transaction
          .delete(manualRankingResolution)
          .where(inArray(manualRankingResolution.competitionId, competitionIds));
      }
      await transaction
        .delete(h2hMatchup)
        .where(inArray(h2hMatchup.competitionId, competitionIds));
      await transaction
        .delete(h2hDrawParticipant)
        .where(inArray(h2hDrawParticipant.competitionId, competitionIds));
      await transaction
        .delete(competitionGroupParticipant)
        .where(inArray(competitionGroupParticipant.competitionId, competitionIds));
      await transaction
        .delete(competitionGroup)
        .where(inArray(competitionGroup.competitionId, competitionIds));
      await transaction
        .delete(h2hPhaseConfiguration)
        .where(inArray(h2hPhaseConfiguration.competitionId, competitionIds));
      const playoffMatchups = await transaction
        .select({ id: playoffMatchup.id })
        .from(playoffMatchup)
        .where(inArray(playoffMatchup.competitionId, competitionIds));
      if (playoffMatchups.length)
        await transaction.delete(playoffMatchupResolutionEvent).where(
          inArray(
            playoffMatchupResolutionEvent.matchupId,
            playoffMatchups.map(({ id }) => id),
          ),
        );
      await transaction
        .delete(playoffMatchup)
        .where(inArray(playoffMatchup.competitionId, competitionIds));
      const playoffRounds = await transaction
        .select({ id: playoffRound.id })
        .from(playoffRound)
        .where(inArray(playoffRound.competitionId, competitionIds));
      if (playoffRounds.length) {
        const playoffQuestions = await transaction
          .select({ id: question.id })
          .from(question)
          .where(
            inArray(
              question.playoffRoundId,
              playoffRounds.map(({ id }) => id),
            ),
          );
        const ids = playoffQuestions.map(({ id }) => id);
        await transaction
          .update(playoffRound)
          .set({ tiebreakerQuestionId: null })
          .where(
            inArray(
              playoffRound.id,
              playoffRounds.map(({ id }) => id),
            ),
          );
        if (ids.length) {
          const answers = await transaction
            .select({ id: answer.id })
            .from(answer)
            .where(inArray(answer.questionId, ids));
          if (answers.length) {
            await transaction.delete(openTextJudgmentCorrectionEvent).where(
              inArray(
                openTextJudgmentCorrectionEvent.answerId,
                answers.map(({ id }) => id),
              ),
            );
            await transaction.delete(openTextJudgment).where(
              inArray(
                openTextJudgment.answerId,
                answers.map(({ id }) => id),
              ),
            );
          }
          const results = await transaction
            .select({ id: officialResult.id })
            .from(officialResult)
            .where(inArray(officialResult.questionId, ids));
          if (results.length)
            await transaction.delete(officialResultCorrectionEvent).where(
              inArray(
                officialResultCorrectionEvent.officialResultId,
                results.map(({ id }) => id),
              ),
            );
          await transaction
            .delete(officialResult)
            .where(inArray(officialResult.questionId, ids));
          await transaction.delete(answer).where(inArray(answer.questionId, ids));
          await transaction
            .delete(questionOption)
            .where(inArray(questionOption.questionId, ids));
          await transaction
            .delete(matchQuestionConfig)
            .where(inArray(matchQuestionConfig.questionId, ids));
          await transaction
            .delete(questionScoring)
            .where(inArray(questionScoring.questionId, ids));
          await transaction.delete(question).where(inArray(question.id, ids));
        }
        await transaction.delete(playoffRound).where(
          inArray(
            playoffRound.id,
            playoffRounds.map(({ id }) => id),
          ),
        );
      }
      await transaction
        .delete(playoffSeed)
        .where(inArray(playoffSeed.competitionId, competitionIds));
      const rounds = await transaction
        .select({ id: round.id })
        .from(round)
        .where(inArray(round.competitionId, competitionIds))
        .for("update");
      const roundIds = rounds.map(({ id }) => id);
      if (roundIds.length) {
        const questions = await transaction
          .select({ id: question.id })
          .from(question)
          .where(inArray(question.roundId, roundIds));
        const questionIds = questions.map(({ id }) => id);
        if (questionIds.length) {
          const answers = await transaction
            .select({ id: answer.id })
            .from(answer)
            .where(inArray(answer.questionId, questionIds));
          const answerIds = answers.map(({ id }) => id);
          const results = await transaction
            .select({ id: officialResult.id })
            .from(officialResult)
            .where(inArray(officialResult.questionId, questionIds));
          const resultIds = results.map(({ id }) => id);
          if (resultIds.length)
            await transaction
              .delete(officialResultCorrectionEvent)
              .where(inArray(officialResultCorrectionEvent.officialResultId, resultIds));
          if (answerIds.length) {
            await transaction
              .delete(openTextJudgmentCorrectionEvent)
              .where(inArray(openTextJudgmentCorrectionEvent.answerId, answerIds));
            await transaction
              .delete(openTextJudgment)
              .where(inArray(openTextJudgment.answerId, answerIds));
          }
          await transaction
            .delete(officialResult)
            .where(inArray(officialResult.questionId, questionIds));
          await transaction.delete(answer).where(inArray(answer.questionId, questionIds));
          await transaction
            .delete(questionOption)
            .where(inArray(questionOption.questionId, questionIds));
          await transaction
            .delete(matchQuestionConfig)
            .where(inArray(matchQuestionConfig.questionId, questionIds));
          await transaction
            .delete(questionScoring)
            .where(inArray(questionScoring.questionId, questionIds));
          await transaction.delete(question).where(inArray(question.id, questionIds));
        }
        await transaction.delete(round).where(inArray(round.id, roundIds));
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
      const paymentRows = await this.database
        .select({ id: payment.id })
        .from(payment)
        .innerJoin(
          competitionParticipant,
          eq(payment.competitionParticipantId, competitionParticipant.id),
        )
        .where(inArray(competitionParticipant.competitionId, competitionIds));
      if (paymentRows.length) {
        await this.database.delete(paymentEvent).where(
          inArray(
            paymentEvent.paymentId,
            paymentRows.map(({ id }) => id),
          ),
        );
        await this.database.delete(payment).where(
          inArray(
            payment.id,
            paymentRows.map(({ id }) => id),
          ),
        );
      }
      await this.database
        .delete(paymentObligation)
        .where(inArray(paymentObligation.competitionId, competitionIds));
      await this.database
        .delete(prizeConfiguration)
        .where(inArray(prizeConfiguration.competitionId, competitionIds));
      const resolutions = await this.database
        .select({ id: manualRankingResolution.id })
        .from(manualRankingResolution)
        .where(inArray(manualRankingResolution.competitionId, competitionIds));
      if (resolutions.length) {
        await this.database.delete(manualRankingResolutionEntry).where(
          inArray(
            manualRankingResolutionEntry.resolutionId,
            resolutions.map(({ id }) => id),
          ),
        );
        await this.database
          .delete(manualRankingResolution)
          .where(inArray(manualRankingResolution.competitionId, competitionIds));
      }
      await this.database
        .delete(h2hMatchup)
        .where(inArray(h2hMatchup.competitionId, competitionIds));
      await this.database
        .delete(h2hDrawParticipant)
        .where(inArray(h2hDrawParticipant.competitionId, competitionIds));
      await this.database
        .delete(competitionGroupParticipant)
        .where(inArray(competitionGroupParticipant.competitionId, competitionIds));
      await this.database
        .delete(competitionGroup)
        .where(inArray(competitionGroup.competitionId, competitionIds));
      await this.database
        .delete(h2hPhaseConfiguration)
        .where(inArray(h2hPhaseConfiguration.competitionId, competitionIds));
      const playoffMatchups = await this.database
        .select({ id: playoffMatchup.id })
        .from(playoffMatchup)
        .where(inArray(playoffMatchup.competitionId, competitionIds));
      if (playoffMatchups.length)
        await this.database.delete(playoffMatchupResolutionEvent).where(
          inArray(
            playoffMatchupResolutionEvent.matchupId,
            playoffMatchups.map(({ id }) => id),
          ),
        );
      await this.database
        .delete(playoffMatchup)
        .where(inArray(playoffMatchup.competitionId, competitionIds));
      const playoffRounds = await this.database
        .select({ id: playoffRound.id })
        .from(playoffRound)
        .where(inArray(playoffRound.competitionId, competitionIds));
      if (playoffRounds.length) {
        const playoffQuestions = await this.database
          .select({ id: question.id })
          .from(question)
          .where(
            inArray(
              question.playoffRoundId,
              playoffRounds.map(({ id }) => id),
            ),
          );
        const ids = playoffQuestions.map(({ id }) => id);
        await this.database
          .update(playoffRound)
          .set({ tiebreakerQuestionId: null })
          .where(
            inArray(
              playoffRound.id,
              playoffRounds.map(({ id }) => id),
            ),
          );
        if (ids.length) {
          const answers = await this.database
            .select({ id: answer.id })
            .from(answer)
            .where(inArray(answer.questionId, ids));
          if (answers.length) {
            await this.database.delete(openTextJudgmentCorrectionEvent).where(
              inArray(
                openTextJudgmentCorrectionEvent.answerId,
                answers.map(({ id }) => id),
              ),
            );
            await this.database.delete(openTextJudgment).where(
              inArray(
                openTextJudgment.answerId,
                answers.map(({ id }) => id),
              ),
            );
          }
          const results = await this.database
            .select({ id: officialResult.id })
            .from(officialResult)
            .where(inArray(officialResult.questionId, ids));
          if (results.length)
            await this.database.delete(officialResultCorrectionEvent).where(
              inArray(
                officialResultCorrectionEvent.officialResultId,
                results.map(({ id }) => id),
              ),
            );
          await this.database
            .delete(officialResult)
            .where(inArray(officialResult.questionId, ids));
          await this.database.delete(answer).where(inArray(answer.questionId, ids));
          await this.database
            .delete(questionOption)
            .where(inArray(questionOption.questionId, ids));
          await this.database
            .delete(matchQuestionConfig)
            .where(inArray(matchQuestionConfig.questionId, ids));
          await this.database
            .delete(questionScoring)
            .where(inArray(questionScoring.questionId, ids));
          await this.database.delete(question).where(inArray(question.id, ids));
        }
        await this.database.delete(playoffRound).where(
          inArray(
            playoffRound.id,
            playoffRounds.map(({ id }) => id),
          ),
        );
      }
      await this.database
        .delete(playoffSeed)
        .where(inArray(playoffSeed.competitionId, competitionIds));
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
          const answers = await this.database
            .select({ id: answer.id })
            .from(answer)
            .where(inArray(answer.questionId, questionIds));
          const answerIds = answers.map(({ id }) => id);
          const results = await this.database
            .select({ id: officialResult.id })
            .from(officialResult)
            .where(inArray(officialResult.questionId, questionIds));
          const resultIds = results.map(({ id }) => id);
          if (resultIds.length)
            await this.database
              .delete(officialResultCorrectionEvent)
              .where(inArray(officialResultCorrectionEvent.officialResultId, resultIds));
          if (answerIds.length) {
            await this.database
              .delete(openTextJudgmentCorrectionEvent)
              .where(inArray(openTextJudgmentCorrectionEvent.answerId, answerIds));
            await this.database
              .delete(openTextJudgment)
              .where(inArray(openTextJudgment.answerId, answerIds));
          }
          await this.database
            .delete(officialResult)
            .where(inArray(officialResult.questionId, questionIds));
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
