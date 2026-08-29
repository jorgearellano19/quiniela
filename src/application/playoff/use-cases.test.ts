import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { generatePlayoffBracket, type PlayoffRepository } from "./use-cases";

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
  it("rejects anonymous bracket generation", async () => {
    const repo = repository();
    const competitionId = randomUUID();
    await expect(
      generatePlayoffBracket(repo, null, {
        competitionId,
        playoffRoundId: randomUUID(),
        readiness: "OFFICIAL",
        orderedParticipantIds: [randomUUID(), randomUUID()],
        sourceFingerprint: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects provisional qualification before persistence", async () => {
    const repo = repository();
    await expect(
      generatePlayoffBracket(
        repo,
        { userId: randomUUID() },
        {
          competitionId: randomUUID(),
          playoffRoundId: randomUUID(),
          readiness: "PROVISIONAL",
          orderedParticipantIds: [randomUUID(), randomUUID()],
          sourceFingerprint: "a".repeat(64),
        },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.snapshotBracket).not.toHaveBeenCalled();
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
      { userId: randomUUID() },
      {
        competitionId,
        playoffRoundId: randomUUID(),
        readiness: "OFFICIAL",
        orderedParticipantIds: participants,
        sourceFingerprint: "b".repeat(64),
      },
    );
    expect(repo.snapshotBracket).toHaveBeenCalledOnce();
  });
});
