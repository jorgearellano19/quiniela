import type { Round, RoundStatus } from "@/domain/round/round";

export const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export class ResultLifecycleError extends Error {}

export function effectiveRoundStatus(round: Round, now: Date): RoundStatus {
  return round.status === "FINISHED" &&
    round.finishedAt !== null &&
    now.valueOf() >= round.finishedAt.valueOf() + CORRECTION_WINDOW_MS
    ? "FINALIZED"
    : round.status;
}

export function assertResultMutable(round: Round, deadlineAt: Date, now: Date) {
  if (now.valueOf() < deadlineAt.valueOf())
    throw new ResultLifecycleError("Question is still open.");
  if (!(["ACTIVE", "FINISHED"] as RoundStatus[]).includes(round.status))
    throw new ResultLifecycleError("Round does not accept Results.");
  if (effectiveRoundStatus(round, now) === "FINALIZED")
    throw new ResultLifecycleError("Official Result is immutable.");
}

export function finishRound(
  round: Round,
  allQuestionsComplete: boolean,
  actorUserId: string,
  now: Date,
): Round {
  if (!allQuestionsComplete || round.status === "FINISHED") return round;
  if (round.status !== "ACTIVE")
    throw new ResultLifecycleError("Round cannot finish from its current state.");
  return {
    ...round,
    status: "FINISHED",
    finishedAt: now,
    updatedAt: now,
    updatedByUserId: actorUserId,
  };
}
