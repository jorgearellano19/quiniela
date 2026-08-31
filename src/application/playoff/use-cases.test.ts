import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ResultRepository } from "@/application/scoring/use-cases";
import type { H2HRepository } from "@/application/h2h/use-cases";
import type { StandingsRepository } from "@/application/standings/use-cases";
import {
  generatePlayoffBracket,
  getPlayoffRoundResults,
  officialSeedDecision,
  type PlayoffRepository,
} from "./use-cases";

function repository() {
  return {
    getCompetitionForAdmin: vi.fn().mockResolvedValue({
      id: randomUUID(),
      type: "LEAGUE_PLAYOFFS",
      status: "STARTED",
      scoringDefaults: {},
    }),
    snapshotBracket: vi.fn().mockResolvedValue(true),
  } as unknown as PlayoffRepository;
}

describe("playoff use cases", () => {
  const h2h = {} as H2HRepository;
  const standings = {} as StandingsRepository;
  const participantA = randomUUID();
  const participantB = randomUUID();
  const participantC = randomUUID();
  const tables = (readiness: "PROVISIONAL" | "PENDING_RESOLUTION" | "OFFICIAL") => [
    {
      groupId: null,
      groupLabel: null,
      sourceFingerprint: "a".repeat(64),
      readiness,
      decisionGroups: [],
      requiredTieGroups: [],
      rows: [
        {
          participantId: participantA,
          participantName: "A",
          position: 1,
          h2hPoints: 6,
          predictionScore: 10,
          exactScorePoints: 3,
          played: 2,
          wins: 2,
          unresolved: false,
          qualification: "OFICIAL" as const,
        },
        {
          participantId: participantB,
          participantName: "B",
          position: 2,
          h2hPoints: 3,
          predictionScore: 8,
          exactScorePoints: 2,
          played: 2,
          wins: 1,
          unresolved: false,
          qualification: "OFICIAL" as const,
        },
        {
          participantId: participantC,
          participantName: "C",
          position: 3,
          h2hPoints: 0,
          predictionScore: 8,
          exactScorePoints: 2,
          played: 2,
          wins: 0,
          unresolved: false,
          qualification: "NO_CLASIFICA" as const,
        },
      ],
    },
  ];

  it("derives official seeds and permits reordering only inside an equal rank", () => {
    expect(officialSeedDecision(tables("PROVISIONAL"))).toBeNull();
    expect(officialSeedDecision(tables("OFFICIAL"))?.orderedParticipantIds).toEqual([
      participantA,
      participantB,
    ]);
    expect(
      officialSeedDecision(tables("OFFICIAL"), [participantB, participantA]),
    ).toBeNull();
    expect(
      officialSeedDecision(tables("OFFICIAL"), [participantA, participantC]),
    ).toBeNull();

    const tied = tables("OFFICIAL");
    tied[0]!.rows[0]!.predictionScore = 8;
    tied[0]!.rows[0]!.exactScorePoints = 2;
    expect(
      officialSeedDecision(tied, [participantB, participantA])?.orderedParticipantIds,
    ).toEqual([participantB, participantA]);
  });

  it("rejects anonymous bracket generation", async () => {
    const repo = repository();
    const competitionId = randomUUID();
    await expect(
      generatePlayoffBracket(repo, h2h, standings, null, {
        competitionId,
        playoffRoundId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects qualification that changes during the atomic snapshot", async () => {
    const repo = repository();
    repo.snapshotBracket = vi.fn().mockResolvedValue(false);
    await expect(
      generatePlayoffBracket(
        repo,
        h2h,
        standings,
        { userId: randomUUID() },
        {
          competitionId: randomUUID(),
          playoffRoundId: randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.snapshotBracket).toHaveBeenCalledOnce();
  });

  it("passes a valid official power-of-two field to the atomic snapshot", async () => {
    const repo = repository();
    const competitionId = randomUUID();
    repo.getCompetitionForAdmin = vi.fn().mockResolvedValue({
      id: competitionId,
      type: "LEAGUE_PLAYOFFS",
      status: "STARTED",
      scoringDefaults: {},
    });
    const participants = Array.from({ length: 4 }, () => randomUUID());
    await generatePlayoffBracket(
      repo,
      h2h,
      standings,
      { userId: randomUUID() },
      {
        competitionId,
        playoffRoundId: randomUUID(),
        seedOrder: participants,
      },
    );
    expect(repo.snapshotBracket).toHaveBeenCalledOnce();
  });

  it("returns authoritative matchup decisions through the Application DTO", async () => {
    const competitionId = randomUUID();
    const playoffRoundId = randomUUID();
    const participantAId = randomUUID();
    const participantBId = randomUUID();
    const now = new Date("2026-08-30T12:00:00Z");
    const round = {
      id: playoffRoundId,
      competitionId,
      sequence: 1,
      name: "Final",
      startsAt: new Date("2026-08-28T12:00:00Z"),
      status: "FINISHED" as const,
      unansweredPenalty: -1 as const,
      publishedAt: new Date("2026-08-27T12:00:00Z"),
      finishedAt: new Date("2026-08-30T11:00:00Z"),
      finalizedAt: null,
      createdByUserId: "admin",
      updatedByUserId: "admin",
      createdAt: now,
      updatedAt: now,
    };
    const resultRepository = {
      getRound: vi.fn(async () => ({
        round,
        questions: [],
        participants: [
          { id: participantAId, userId: "a", name: "Semilla uno" },
          { id: participantBId, userId: "b", name: "Semilla dos" },
        ],
        answers: [],
        results: [],
        judgments: [],
        actorParticipantId: participantAId,
        actorIsAdmin: true,
        restrictedParticipantIds: new Set<string>(),
      })),
    } as unknown as ResultRepository;
    const playoffRepository = {
      getOverview: vi.fn(async () => ({
        competition: {
          id: competitionId,
          name: "Copa",
          type: "LEAGUE_PLAYOFFS" as const,
          status: "STARTED" as const,
        },
        actorIsAdmin: true,
        currentParticipantId: participantAId,
        seeds: [
          { participantId: participantAId, name: "Semilla uno", seed: 1 },
          { participantId: participantBId, name: "Semilla dos", seed: 2 },
        ],
        rounds: [
          {
            id: playoffRoundId,
            sequence: 1,
            name: "Final",
            startsAt: round.startsAt.toISOString(),
            status: "FINISHED" as const,
            advancementConfirmed: false,
            advancementMode: "BEST_SEED" as const,
            tiebreakerQuestionId: null,
            questionCount: 0,
            matchups: [
              {
                id: randomUUID(),
                position: 1,
                participantAId,
                participantAName: "Semilla uno",
                participantASeed: 1,
                participantBId,
                participantBName: "Semilla dos",
                participantBSeed: 2,
                winnerParticipantId: null,
                winnerDecidedBy: null,
              },
            ],
          },
        ],
        champion: null,
      })),
    } as unknown as PlayoffRepository;

    const result = await getPlayoffRoundResults(
      playoffRepository,
      resultRepository,
      { userId: "admin" },
      competitionId,
      playoffRoundId,
      now,
    );
    expect(result?.decisions[0]?.decision).toEqual({
      state: "WINNER",
      participantId: participantAId,
      decidedBy: "SEED",
    });
  });
});
