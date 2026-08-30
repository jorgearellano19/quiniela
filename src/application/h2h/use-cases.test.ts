import { describe, expect, it } from "vitest";
import type { Answer } from "@/domain/answer/answer";
import type { Question, Round } from "@/domain/round/round";
import type {
  StandingsAggregate,
  StandingsRepository,
} from "@/application/standings/use-cases";
import {
  getH2HMatchups,
  getH2HStandings,
  getMyH2HMatchup,
  resolveH2HTie,
  type H2HRepository,
  type H2HStructure,
} from "./use-cases";

const competitionId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const adminId = "00000000-0000-4000-8000-000000000003";
const participantA = "00000000-0000-4000-8000-000000000004";
const participantB = "00000000-0000-4000-8000-000000000005";
const questionId = "00000000-0000-4000-8000-000000000006";
const now = new Date("2026-08-28T12:00:00Z");

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: roundId,
    competitionId,
    sequence: 1,
    name: "Jornada 1",
    startsAt: now,
    status: "ACTIVE",
    unansweredPenalty: -1,
    publishedAt: now,
    finishedAt: null,
    finalizedAt: null,
    createdByUserId: adminId,
    updatedByUserId: adminId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function structure(): H2HStructure {
  return {
    competition: { id: competitionId, type: "LEAGUE_PLAYOFFS", status: "STARTED" },
    actorIsAdmin: true,
    participants: [
      { id: participantA, name: "Ana" },
      { id: participantB, name: "Beto" },
    ],
    rounds: [{ id: roundId, sequence: 1, status: "ACTIVE" }],
    configuration: { type: "LEAGUE_PLAYOFFS", roundCount: 1, qualifierCount: 2 },
    generated: true,
    currentParticipantId: participantB,
    drawOrder: [participantA, participantB],
    groups: [],
    matchups: [
      {
        id: "00000000-0000-4000-8000-000000000007",
        roundId,
        groupId: null,
        participantAId: participantA,
        participantBId: participantB,
        position: 1,
      },
    ],
  };
}

function repositories(input: {
  questions?: readonly Question[];
  answers?: readonly Answer[];
}) {
  const h2h: H2HRepository = {
    async get() {
      return structure();
    },
    async configure() {
      return true;
    },
    async generate() {
      return structure();
    },
  };
  const aggregate: StandingsAggregate = {
    competition: {
      id: competitionId,
      name: "Copa",
      type: "LEAGUE_PLAYOFFS",
      status: "STARTED",
      completedAt: null,
    },
    participants: [
      { id: participantA, name: "Ana", email: "ana@example.test" },
      { id: participantB, name: "Beto", email: "beto@example.test" },
    ],
    rounds: [
      {
        round: round(),
        questions: input.questions ?? [],
        answers: input.answers ?? [],
        results: [],
        judgments: [],
      },
    ],
    resolutions: [],
    actorIsAdmin: true,
    restrictedParticipantIds: new Set(),
    h2hMatchups: [],
    requiredRegularRoundCount: null,
  };
  const standings: StandingsRepository = {
    async getCompetition() {
      return aggregate;
    },
    async resolve() {
      return aggregate;
    },
  };
  return { h2h, standings, aggregate };
}

describe("H2H application queries", () => {
  it("orients the participant and rival scores for participant B", async () => {
    const { h2h, standings } = repositories({});
    const matchup = await getMyH2HMatchup(
      { competitionId },
      { userId: participantB, passwordChangeRequired: false },
      h2h,
      standings,
      now,
    );
    expect(matchup?.participant.id).toBe(participantB);
    expect(matchup?.rival?.id).toBe(participantA);
  });

  it("keeps an unanswered OPEN_TEXT question POR_JUGAR before its deadline", async () => {
    const question: Question = {
      id: questionId,
      roundId,
      sequence: 1,
      prompt: "Comentario",
      deadlineMode: "CUSTOM",
      deadlineAt: new Date("2026-08-28T13:00:00Z"),
      usesDefaultScoring: false,
      createdByUserId: adminId,
      updatedByUserId: adminId,
      createdAt: now,
      updatedAt: now,
      type: "OPEN_TEXT",
      points: 1,
    };
    const { h2h, standings } = repositories({ questions: [question] });
    const [matchup] = await getH2HMatchups(
      { competitionId },
      { userId: adminId, passwordChangeRequired: false },
      h2h,
      standings,
      now,
    );
    expect(matchup?.state).toBe("POR_JUGAR");
  });

  it("produces the same source fingerprint for differently ordered facts", async () => {
    const answers: Answer[] = [
      {
        id: "00000000-0000-4000-8000-000000000010",
        questionId,
        participantId: participantA,
        value: { type: "OPEN_TEXT", value: "A" },
        submittedAt: now,
        updatedAt: now,
      },
      {
        id: "00000000-0000-4000-8000-000000000011",
        questionId,
        participantId: participantB,
        value: { type: "OPEN_TEXT", value: "B" },
        submittedAt: now,
        updatedAt: now,
      },
    ];
    const first = repositories({ answers });
    const second = repositories({ answers: [...answers].reverse() });
    const actor = { userId: adminId, passwordChangeRequired: false } as const;
    const [firstTable] = await getH2HStandings(
      { competitionId },
      actor,
      first.h2h,
      first.standings,
      now,
    );
    const [secondTable] = await getH2HStandings(
      { competitionId },
      actor,
      second.h2h,
      second.standings,
      now,
    );
    expect(secondTable?.sourceFingerprint).toBe(firstTable?.sourceFingerprint);
  });

  it("allows only an Admin to persist an exact finalized tie permutation", async () => {
    const finalRound = round({
      status: "FINISHED",
      finishedAt: new Date("2026-08-26T12:00:00Z"),
    });
    const finalStructure: H2HStructure = {
      ...structure(),
      rounds: [{ id: roundId, sequence: 1, status: "FINALIZED" }],
    };
    const aggregate: StandingsAggregate = {
      ...repositories({}).aggregate,
      rounds: [
        {
          round: finalRound,
          questions: [],
          answers: [],
          results: [],
          judgments: [],
        },
      ],
    };
    const h2h: H2HRepository = {
      async get() {
        return finalStructure;
      },
      async configure() {
        return true;
      },
      async generate() {
        return finalStructure;
      },
    };
    let persistedScope: string | null = null;
    let persistedParticipantIds: readonly string[] = [];
    const standings: StandingsRepository = {
      async getCompetition() {
        return aggregate;
      },
      async resolve(_competitionId, _userId, _now, operation) {
        const write = operation(aggregate);
        persistedScope = write.scope;
        persistedParticipantIds = write.participantIds;
        return aggregate;
      },
    };
    const input = {
      competitionId,
      participantIds: [participantB, participantA],
    };
    await expect(
      resolveH2HTie(
        input,
        { userId: adminId, passwordChangeRequired: false },
        h2h,
        standings,
        now,
      ),
    ).resolves.toEqual({ success: true });
    expect(persistedScope).toBe("H2H_PHASE");
    expect(persistedParticipantIds).toEqual([participantB, participantA]);

    const participantStandings: StandingsRepository = {
      ...standings,
      async getCompetition() {
        return { ...aggregate, actorIsAdmin: false };
      },
      async resolve(_competitionId, _userId, _now, operation) {
        operation({ ...aggregate, actorIsAdmin: false });
        return aggregate;
      },
    };
    await expect(
      resolveH2HTie(
        input,
        { userId: participantB, passwordChangeRequired: false },
        { ...h2h, get: async () => ({ ...finalStructure, actorIsAdmin: false }) },
        participantStandings,
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
