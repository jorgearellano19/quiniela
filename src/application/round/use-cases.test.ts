import { describe, expect, it } from "vitest";
import { ApplicationError } from "@/lib/errors/application-error";
import {
  DEFAULT_COMPETITION_SCORING,
  type Question,
  type Round,
} from "@/domain/round/round";
import {
  createQuestion,
  createRound,
  getRoundEditor,
  listRounds,
  publishRound,
  removeQuestion,
  updateQuestion,
  updateRound,
  type RoundRepository,
} from "./use-cases";
const competitionId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const actor = { userId: "admin", passwordChangeRequired: false } as const;
class FakeRepository implements RoundRepository {
  competition: Awaited<ReturnType<RoundRepository["getCompetitionForAdmin"]>> = {
    id: competitionId,
    type: "LEAGUE",
    status: "DRAFT",
    scoringDefaults: DEFAULT_COMPETITION_SCORING,
  };
  value: Round | null = null;
  questions: Question[] = [];
  async getCompetitionForAdmin() {
    return this.competition;
  }
  async create(value: Round) {
    this.value = value;
    return true;
  }
  async list() {
    return this.value
      ? [{ round: this.value, questionCount: this.questions.length }]
      : [];
  }
  async getEditor() {
    return this.value
      ? {
          round: this.value,
          competitionType: this.competition!.type,
          competitionStatus: this.competition!.status,
          scoringDefaults: this.competition!.scoringDefaults,
          questions: this.questions,
        }
      : null;
  }
  async updateDraft(value: Round) {
    this.value = value;
    return true;
  }
  async mutateQuestion(
    _roundId: string,
    _userId: string,
    operation: Parameters<RoundRepository["mutateQuestion"]>[2],
  ) {
    if (!this.value) return null;
    const result = operation(this.value, this.questions);
    if (result.kind === "remove") {
      this.questions = this.questions.filter(
        (question) => question.id !== result.questionId,
      );
      return null;
    }
    this.questions = [
      ...this.questions.filter((question) => question.id !== result.value.id),
      result.value,
    ];
    return result.value;
  }
  async publish(_roundId: string, _userId: string, now: Date) {
    if (!this.value) return null;
    const { publishRound: domainPublish } = await import("@/domain/round/round");
    this.value = domainPublish(this.value, this.questions, now);
    return {
      round: this.value,
      competitionType: this.competition!.type,
      competitionStatus: this.competition!.status,
      scoringDefaults: this.competition!.scoringDefaults,
      questions: this.questions,
    };
  }
  async updateScoringDefaults() {
    return true;
  }
  async reorderRounds() {
    return true;
  }
  async reorderQuestions() {
    return true;
  }
  async deleteDraft() {
    return true;
  }
}
describe("Round use cases", () => {
  function draft(repository: FakeRepository) {
    repository.value = {
      id: roundId,
      competitionId,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      status: "DRAFT",
      unansweredPenalty: -1,
      publishedAt: null,
      finishedAt: null,
      finalizedAt: null,
      createdByUserId: "internal-creator-id",
      updatedByUserId: "internal-updater-id",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  it("rejects anonymous and participant-only actors", async () => {
    const repository = new FakeRepository();
    repository.competition = null;
    await expect(
      createRound(repository, null, {
        competitionId,
        sequence: 1,
        name: "Uno",
        startsAt: new Date(Date.now() + 60_000),
        unansweredPenalty: -1,
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      createRound(repository, actor, {
        competitionId,
        sequence: 1,
        name: "Uno",
        unansweredPenalty: -1,
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
  it("allows drafting before start but rejects mutations after completion", async () => {
    const repository = new FakeRepository();
    await createRound(repository, actor, {
      competitionId,
      sequence: 1,
      name: "Uno",
      startsAt: new Date(Date.now() + 60_000),
      unansweredPenalty: -1,
    });
    expect(repository.value?.status).toBe("DRAFT");
    repository.competition = { ...repository.competition!, status: "COMPLETED" };
    await expect(
      createRound(repository, actor, {
        competitionId,
        sequence: 2,
        name: "Dos",
        startsAt: new Date(Date.now() + 60_000),
        unansweredPenalty: -1,
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
  it("rejects rival closest-value scoring for LEAGUE", async () => {
    const repository = new FakeRepository();
    draft(repository);
    await expect(
      createQuestion(repository, actor, {
        competitionId,
        roundId,
        type: "CLOSEST_VALUE",
        sequence: 1,
        prompt: "Valor",
        deadlineMode: "CUSTOM",
        deadlineAt: new Date(Date.now() + 10_000),
        usesDefaultScoring: false,
        points: 1,
        againstRival: true,
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });
  it("requires STARTED to publish and returns ACTIVE idempotently", async () => {
    const repository = new FakeRepository();
    draft(repository);
    repository.questions = [
      {
        id: "q",
        roundId,
        sequence: 1,
        prompt: "Texto",
        deadlineMode: "CUSTOM",
        deadlineAt: new Date(Date.now() + 60_000),
        usesDefaultScoring: false,
        type: "OPEN_TEXT",
        points: 1,
        createdByUserId: "admin",
        updatedByUserId: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    await expect(
      publishRound(repository, actor, competitionId, roundId),
    ).rejects.toBeInstanceOf(ApplicationError);
    repository.competition = { ...repository.competition!, status: "STARTED" };
    const first = await publishRound(repository, actor, competitionId, roundId);
    const second = await publishRound(repository, actor, competitionId, roundId);
    expect(first.status).toBe("ACTIVE");
    expect(second.publishedAt).toEqual(first.publishedAt);
  });
  it("enforces Admin authorization for every query and mutation", async () => {
    const repository = new FakeRepository();
    draft(repository);
    repository.questions = [
      {
        id: "question-id",
        roundId,
        sequence: 1,
        prompt: "Texto",
        deadlineMode: "CUSTOM",
        deadlineAt: new Date(Date.now() + 60_000),
        usesDefaultScoring: false,
        type: "OPEN_TEXT",
        points: 1,
        createdByUserId: "admin",
        updatedByUserId: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    repository.competition = null;
    const questionInput = {
      competitionId,
      roundId,
      type: "OPEN_TEXT",
      sequence: 1,
      prompt: "Texto",
      deadlineMode: "CUSTOM",
      deadlineAt: new Date(Date.now() + 60_000),
      usesDefaultScoring: false,
      points: 1,
    };
    const operations = [
      () => listRounds(repository, actor, competitionId),
      () => getRoundEditor(repository, actor, competitionId, roundId),
      () =>
        updateRound(repository, actor, {
          competitionId,
          roundId,
          sequence: 1,
          name: "Uno",
          startsAt: new Date(Date.now() + 60_000),
          unansweredPenalty: -1,
        }),
      () => createQuestion(repository, actor, questionInput),
      () => updateQuestion(repository, actor, "question-id", questionInput),
      () => removeQuestion(repository, actor, competitionId, roundId, "question-id"),
      () => publishRound(repository, actor, competitionId, roundId),
    ];
    for (const operation of operations)
      await expect(operation()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("returns explicit editor DTOs without persistence audit identifiers", async () => {
    const repository = new FakeRepository();
    draft(repository);
    repository.questions = [
      {
        id: "question-id",
        roundId,
        sequence: 1,
        prompt: "Texto",
        deadlineMode: "CUSTOM",
        deadlineAt: new Date(Date.now() + 60_000),
        usesDefaultScoring: false,
        type: "OPEN_TEXT",
        points: 1,
        createdByUserId: "internal-creator-id",
        updatedByUserId: "internal-updater-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = await getRoundEditor(repository, actor, competitionId, roundId);
    expect(result).not.toHaveProperty("createdByUserId");
    expect(result?.questions[0]).toEqual({
      id: "question-id",
      sequence: 1,
      prompt: "Texto",
      deadlineAt: expect.any(String),
      deadlineMode: "CUSTOM",
      usesDefaultScoring: false,
      type: "OPEN_TEXT",
      points: 1,
    });
  });
});
