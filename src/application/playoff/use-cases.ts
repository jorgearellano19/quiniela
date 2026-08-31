import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CompetitionActor } from "@/application/competition/boundary";
import { requireCompetitionActor } from "@/application/competition/boundary";
import {
  createQuestion as createSharedQuestion,
  removeQuestion as removeSharedQuestion,
  updateQuestion as updateSharedQuestion,
  type RoundAggregate,
  type RoundRepository,
} from "@/application/round/use-cases";
import { generatePlayoffPairings, validatePlayoffSeeds } from "@/domain/playoff/playoff";
import { resolvePlayoffWinner } from "@/domain/playoff/playoff";
import { createRound, updateRound, type Round } from "@/domain/round/round";
import { effectiveRoundStatus } from "@/domain/scoring/lifecycle";
import {
  getRoundResults,
  reviewRoundResults,
  type ResultRepository,
} from "@/application/scoring/use-cases";
import type { CompetitionType } from "@/domain/competition/competition";
import { ApplicationError } from "@/lib/errors/application-error";
import { sha256Json } from "@/application/shared/fingerprint";
import { getH2HStandings, type H2HRepository } from "@/application/h2h/use-cases";
import type { StandingsRepository } from "@/application/standings/use-cases";

export type PlayoffRoundValue = Readonly<{
  round: Round;
  advancementMode: "BEST_SEED" | "TIEBREAKER_QUESTION";
  tiebreakerQuestionId: string | null;
}>;

export type PlayoffMatchupValue = Readonly<{
  id: string;
  playoffRoundId: string;
  position: number;
  participantAId: string;
  participantBId: string;
  winnerParticipantId: string | null;
  winnerDecidedBy: "SCORE" | "SEED" | "TIEBREAKER" | "MANUAL" | null;
}>;

export type PlayoffOverview = Readonly<{
  competition: Readonly<{
    id: string;
    name: string;
    type: Exclude<CompetitionType, "LEAGUE">;
    status: "DRAFT" | "STARTED" | "COMPLETED";
  }>;
  actorIsAdmin: boolean;
  currentParticipantId: string | null;
  seeds: readonly Readonly<{ participantId: string; name: string; seed: number }>[];
  rounds: readonly Readonly<{
    id: string;
    sequence: number;
    name: string;
    startsAt: string;
    status: Round["status"];
    advancementConfirmed: boolean;
    advancementMode: "BEST_SEED" | "TIEBREAKER_QUESTION";
    tiebreakerQuestionId: string | null;
    questionCount: number;
    matchups: readonly Readonly<{
      id: string;
      position: number;
      participantAId: string;
      participantAName: string;
      participantASeed: number;
      participantBId: string;
      participantBName: string;
      participantBSeed: number;
      winnerParticipantId: string | null;
      winnerDecidedBy: string | null;
    }>[];
  }>[];
  champion: Readonly<{ participantId: string; name: string }> | null;
}>;

export interface PlayoffRepository {
  getCompetitionForAdmin: RoundRepository["getCompetitionForAdmin"];
  getOverview(
    competitionId: string,
    userId: string,
    now: Date,
  ): Promise<PlayoffOverview | null>;
  createRound(value: PlayoffRoundValue, userId: string): Promise<boolean>;
  updateRound(value: PlayoffRoundValue, userId: string): Promise<boolean>;
  getRound(
    roundId: string,
    userId: string,
  ): Promise<(RoundAggregate & PlayoffRoundValue) | null>;
  publish(
    competitionId: string,
    roundId: string,
    userId: string,
    now: Date,
  ): Promise<boolean>;
  snapshotBracket(
    input: {
      competitionId: string;
      playoffRoundId: string;
      userId: string;
      now: Date;
    },
    verify: (sources: {
      h2hRepository: H2HRepository;
      standingsRepository: StandingsRepository;
    }) => Promise<{
      orderedParticipantIds: readonly string[];
      sourceFingerprint: string;
    } | null>,
  ): Promise<boolean>;
  persistAdvancement(input: {
    competitionId: string;
    playoffRoundId: string;
    winners: readonly Readonly<{
      matchupId: string;
      participantId: string;
      decidedBy: "SCORE" | "SEED" | "TIEBREAKER" | "MANUAL";
    }>[];
    sourceFingerprint: string;
    userId: string;
    now: Date;
  }): Promise<boolean>;
  persistManualWinner(input: {
    competitionId: string;
    playoffRoundId: string;
    matchupId: string;
    participantId: string;
    sourceFingerprint: string;
    userId: string;
    now: Date;
  }): Promise<boolean>;
  roundRepository: Pick<
    RoundRepository,
    "getCompetitionForAdmin" | "mutateQuestion" | "reorderQuestions"
  >;
}

const id = z.uuid();
const roundInput = z.object({
  competitionId: id,
  playoffRoundId: id.optional(),
  sequence: z.coerce.number().int().positive(),
  name: z.string(),
  startsAt: z.coerce.date(),
  unansweredPenalty: z.coerce
    .number()
    .int()
    .refine((value) => value === -1 || value === 0),
  advancementMode: z.enum(["BEST_SEED", "TIEBREAKER_QUESTION"]),
  tiebreakerQuestionId: id.nullable().optional(),
});

function invalid(message = "Revisa la configuración de playoffs."): never {
  throw new ApplicationError("INVALID_INPUT", message);
}

async function admin(
  repository: PlayoffRepository,
  actorValue: CompetitionActor,
  competitionId: string,
) {
  const actor = requireCompetitionActor(actorValue);
  const competition = await repository.getCompetitionForAdmin(
    competitionId,
    actor.userId,
  );
  if (!competition || competition.type === "LEAGUE")
    throw new ApplicationError(
      "UNAUTHORIZED",
      "No fue posible administrar los playoffs.",
    );
  return { actor, competition };
}

export async function getPlayoffOverview(
  repository: PlayoffRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (!id.safeParse(competitionId).success) invalid();
  return repository.getOverview(competitionId, actor.userId, now);
}

export async function getPlayoffRoundResults(
  playoffRepository: PlayoffRepository,
  resultRepository: ResultRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  playoffRoundId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (!id.safeParse(competitionId).success || !id.safeParse(playoffRoundId).success)
    return null;
  const [results, overview] = await Promise.all([
    getRoundResults(resultRepository, actor, competitionId, playoffRoundId, now),
    getPlayoffOverview(playoffRepository, actor, competitionId, now),
  ]);
  if (!results || !overview) return null;
  const round = overview.rounds.find((item) => item.id === playoffRoundId);
  if (!round) return null;
  const totals = new Map(results.participants.map((item) => [item.id, item.total]));
  const tiebreaker = results.questions.find(
    (item) => item.id === round.tiebreakerQuestionId,
  );
  const decisions = round.matchups.map((matchup) => ({
    matchup,
    decision: resolvePlayoffWinner({
      participantAId: matchup.participantAId,
      participantASeed: matchup.participantASeed,
      participantAScore: totals.get(matchup.participantAId) ?? 0,
      participantATiebreakerPoints:
        tiebreaker?.entries.find((item) => item.participantId === matchup.participantAId)
          ?.score?.points ?? 0,
      participantBId: matchup.participantBId,
      participantBSeed: matchup.participantBSeed,
      participantBScore: totals.get(matchup.participantBId) ?? 0,
      participantBTiebreakerPoints:
        tiebreaker?.entries.find((item) => item.participantId === matchup.participantBId)
          ?.score?.points ?? 0,
      mode: round.advancementMode,
      manualWinnerId:
        matchup.winnerDecidedBy === "MANUAL" ? matchup.winnerParticipantId : null,
    }),
  }));
  return { results, round, decisions } as const;
}

export async function configurePlayoffRound(
  repository: PlayoffRepository,
  actorValue: CompetitionActor,
  input: unknown,
) {
  const parsed = roundInput.safeParse(input);
  if (!parsed.success) invalid();
  const { actor, competition } = await admin(
    repository,
    actorValue,
    parsed.data.competitionId,
  );
  if (competition.status !== "STARTED") invalid();
  const current = parsed.data.playoffRoundId
    ? await repository.getRound(parsed.data.playoffRoundId, actor.userId)
    : null;
  if (parsed.data.playoffRoundId && !current)
    throw new ApplicationError("UNAUTHORIZED", "No fue posible administrar la ronda.");
  if (
    current &&
    (current.round.competitionId !== parsed.data.competitionId ||
      current.round.sequence !== parsed.data.sequence)
  )
    invalid();
  const round = current
    ? updateRound(current.round, {
        sequence: parsed.data.sequence,
        name: parsed.data.name,
        startsAt: parsed.data.startsAt,
        unansweredPenalty: parsed.data.unansweredPenalty as -1 | 0,
        actorUserId: actor.userId,
      })
    : createRound({
        id: randomUUID(),
        competitionId: competition.id,
        sequence: parsed.data.sequence,
        name: parsed.data.name,
        startsAt: parsed.data.startsAt,
        unansweredPenalty: parsed.data.unansweredPenalty as -1 | 0,
        actorUserId: actor.userId,
      });
  const value: PlayoffRoundValue = {
    round,
    advancementMode: parsed.data.advancementMode,
    tiebreakerQuestionId: parsed.data.tiebreakerQuestionId ?? null,
  };
  const saved = current
    ? await repository.updateRound(value, actor.userId)
    : await repository.createRound(value, actor.userId);
  if (!saved) invalid();
  return round.id;
}

export async function generatePlayoffBracket(
  repository: PlayoffRepository,
  h2hRepository: H2HRepository,
  standingsRepository: StandingsRepository,
  actorValue: CompetitionActor,
  input: {
    competitionId: string;
    playoffRoundId: string;
    seedOrder?: readonly string[];
  },
  now = new Date(),
) {
  const parsed = z
    .object({
      competitionId: id,
      playoffRoundId: id,
      seedOrder: z.array(id).optional(),
    })
    .safeParse(input);
  if (!parsed.success) invalid();
  const { actor, competition } = await admin(
    repository,
    actorValue,
    parsed.data.competitionId,
  );
  if (competition.status !== "STARTED") invalid();
  const saved = await repository.snapshotBracket(
    {
      competitionId: parsed.data.competitionId,
      playoffRoundId: parsed.data.playoffRoundId,
      userId: actor.userId,
      now,
    },
    async (sources) => {
      const tables = await getH2HStandings(
        { competitionId: parsed.data.competitionId },
        actor,
        sources.h2hRepository,
        sources.standingsRepository,
        now,
      );
      const decision = officialSeedDecision(tables, parsed.data.seedOrder);
      if (!decision) return null;
      validatePlayoffSeeds(
        decision.orderedParticipantIds.map((participantId, index) => ({
          participantId,
          seed: index + 1,
        })),
      );
      return decision;
    },
  );
  if (!saved) invalid("No fue posible generar el cuadro con esta clasificación.");
}

type H2HStandingsTables = Awaited<ReturnType<typeof getH2HStandings>>;

export function officialSeedDecision(
  tables: H2HStandingsTables,
  seedOrder?: readonly string[],
) {
  if (!tables.length || tables.some((table) => table.readiness !== "OFFICIAL"))
    return null;
  const qualifiers = tables.flatMap((table) =>
    table.rows.filter((row) => row.qualification === "OFICIAL"),
  );
  const natural = [...qualifiers].sort(
    (left, right) =>
      right.predictionScore - left.predictionScore ||
      right.exactScorePoints - left.exactScorePoints,
  );
  const ordered = seedOrder?.length
    ? seedOrder.map((participantId) =>
        natural.find((row) => row.participantId === participantId),
      )
    : natural;
  const resolved = ordered.filter(
    (row): row is (typeof natural)[number] => row !== undefined,
  );
  if (
    resolved.length !== natural.length ||
    new Set(resolved.map((row) => row.participantId)).size !== natural.length
  )
    return null;
  for (let index = 1; index < resolved.length; index += 1) {
    const previous = resolved[index - 1]!;
    const item = resolved[index]!;
    if (
      previous.predictionScore < item.predictionScore ||
      (previous.predictionScore === item.predictionScore &&
        previous.exactScorePoints < item.exactScorePoints)
    )
      return null;
  }
  return {
    orderedParticipantIds: resolved.map((row) => row.participantId),
    sourceFingerprint: fingerprint(tables.map((table) => table.sourceFingerprint).sort()),
  };
}

export async function publishPlayoffRound(
  repository: PlayoffRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  playoffRoundId: string,
  now = new Date(),
) {
  const { actor, competition } = await admin(repository, actorValue, competitionId);
  if (competition.status !== "STARTED" || !id.safeParse(playoffRoundId).success)
    invalid();
  if (!(await repository.publish(competitionId, playoffRoundId, actor.userId, now)))
    invalid("La ronda todavía no está lista para publicarse.");
}

function fingerprint(value: unknown) {
  return sha256Json(value);
}

export async function resolvePlayoffTie(
  repository: PlayoffRepository,
  resultRepository: ResultRepository,
  actorValue: CompetitionActor,
  input: unknown,
  now = new Date(),
) {
  const parsed = z
    .object({ competitionId: id, playoffRoundId: id, matchupId: id, participantId: id })
    .safeParse(input);
  if (!parsed.success) invalid();
  const { actor } = await admin(repository, actorValue, parsed.data.competitionId);
  const [round, aggregate] = await Promise.all([
    repository.getRound(parsed.data.playoffRoundId, actor.userId),
    resultRepository.getRound(
      parsed.data.competitionId,
      parsed.data.playoffRoundId,
      actor.userId,
    ),
  ]);
  if (
    !round ||
    !aggregate ||
    !["FINISHED", "FINALIZED"].includes(effectiveRoundStatus(round.round, now))
  )
    invalid("La ronda todavía no tiene resultados completos.");
  const review = reviewRoundResults(aggregate, now);
  const overview = await repository.getOverview(
    parsed.data.competitionId,
    actor.userId,
    now,
  );
  const matchup = overview?.rounds
    .find((item) => item.id === parsed.data.playoffRoundId)
    ?.matchups.find((item) => item.id === parsed.data.matchupId);
  if (
    !matchup ||
    ![matchup.participantAId, matchup.participantBId].includes(parsed.data.participantId)
  )
    invalid();
  const totals = new Map(review.participants.map((item) => [item.id, item.total]));
  const tiebreaker = review.questions.find(
    (item) => item.id === round.tiebreakerQuestionId,
  );
  const aTie =
    tiebreaker?.entries.find((item) => item.participantId === matchup.participantAId)
      ?.score?.points ?? 0;
  const bTie =
    tiebreaker?.entries.find((item) => item.participantId === matchup.participantBId)
      ?.score?.points ?? 0;
  const automatic = resolvePlayoffWinner({
    participantAId: matchup.participantAId,
    participantASeed: matchup.participantASeed,
    participantAScore: totals.get(matchup.participantAId) ?? 0,
    participantATiebreakerPoints: aTie,
    participantBId: matchup.participantBId,
    participantBSeed: matchup.participantBSeed,
    participantBScore: totals.get(matchup.participantBId) ?? 0,
    participantBTiebreakerPoints: bTie,
    mode: round.advancementMode,
  });
  if (automatic.state !== "UNRESOLVED")
    invalid("Este cruce ya se resuelve con las reglas publicadas.");
  const sourceFingerprint = fingerprint({ round: review, matchupId: matchup.id });
  if (
    !(await repository.persistManualWinner({
      ...parsed.data,
      sourceFingerprint,
      userId: actor.userId,
      now,
    }))
  )
    invalid();
}

export async function resolvePlayoffMatchup(
  repository: PlayoffRepository,
  resultRepository: ResultRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  playoffRoundId: string,
  now = new Date(),
) {
  const { actor } = await admin(repository, actorValue, competitionId);
  const [round, aggregate, overview] = await Promise.all([
    repository.getRound(playoffRoundId, actor.userId),
    resultRepository.getRound(competitionId, playoffRoundId, actor.userId),
    repository.getOverview(competitionId, actor.userId, now),
  ]);
  if (!round || !aggregate || effectiveRoundStatus(round.round, now) !== "FINALIZED")
    invalid("Espera a que termine la ventana de corrección.");
  const review = reviewRoundResults(aggregate, now);
  const matchups =
    overview?.rounds.find((item) => item.id === playoffRoundId)?.matchups ?? [];
  const totals = new Map(review.participants.map((item) => [item.id, item.total]));
  const tiebreaker = review.questions.find(
    (item) => item.id === round.tiebreakerQuestionId,
  );
  const sourceFingerprint = fingerprint({
    round: review,
    matchups: matchups.map((item) => item.id),
  });
  const winners = matchups.map((matchup) => {
    if (matchup.winnerParticipantId && matchup.winnerDecidedBy === "MANUAL")
      return {
        matchupId: matchup.id,
        participantId: matchup.winnerParticipantId,
        decidedBy: "MANUAL" as const,
      };
    const winner = resolvePlayoffWinner({
      participantAId: matchup.participantAId,
      participantASeed: matchup.participantASeed,
      participantAScore: totals.get(matchup.participantAId) ?? 0,
      participantATiebreakerPoints:
        tiebreaker?.entries.find((item) => item.participantId === matchup.participantAId)
          ?.score?.points ?? 0,
      participantBId: matchup.participantBId,
      participantBSeed: matchup.participantBSeed,
      participantBScore: totals.get(matchup.participantBId) ?? 0,
      participantBTiebreakerPoints:
        tiebreaker?.entries.find((item) => item.participantId === matchup.participantBId)
          ?.score?.points ?? 0,
      mode: round.advancementMode,
    });
    if (winner.state === "UNRESOLVED")
      invalid("Resuelve todos los empates antes de avanzar.");
    return {
      matchupId: matchup.id,
      participantId: winner.participantId,
      decidedBy: winner.decidedBy,
    };
  });
  if (
    !(await repository.persistAdvancement({
      competitionId,
      playoffRoundId,
      winners,
      sourceFingerprint,
      userId: actor.userId,
      now,
    }))
  )
    invalid("Configura la siguiente ronda antes de avanzar.");
}

export const createPlayoffQuestion = (
  repository: PlayoffRepository,
  actor: CompetitionActor,
  input: unknown,
) => createSharedQuestion(repository.roundRepository as RoundRepository, actor, input);
export const updatePlayoffQuestion = (
  repository: PlayoffRepository,
  actor: CompetitionActor,
  questionId: string,
  input: unknown,
) =>
  updateSharedQuestion(
    repository.roundRepository as RoundRepository,
    actor,
    questionId,
    input,
  );
export const removePlayoffQuestion = (
  repository: PlayoffRepository,
  actor: CompetitionActor,
  competitionId: string,
  playoffRoundId: string,
  questionId: string,
) =>
  removeSharedQuestion(
    repository.roundRepository as RoundRepository,
    actor,
    competitionId,
    playoffRoundId,
    questionId,
  );

export function pairingPreview(orderedParticipantIds: readonly string[]) {
  return generatePlayoffPairings(
    orderedParticipantIds.map((participantId, index) => ({
      participantId,
      seed: index + 1,
    })),
  );
}
