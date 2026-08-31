import { z } from "zod";
import type { CompetitionActor } from "@/application/competition/boundary";
import { requireCompetitionActor } from "@/application/competition/boundary";
import type { PaymentRepository } from "@/application/payment/use-cases";
import type { PlayoffRepository } from "@/application/playoff/use-cases";
import { getPlayoffOverview } from "@/application/playoff/use-cases";
import type { StandingsRepository } from "@/application/standings/use-cases";
import {
  leaguePhasePrizeWinnerFromAggregate,
  leagueWinnerFromAggregate,
  roundWinnerFromAggregate,
} from "@/application/standings/use-cases";
import { effectiveRoundStatus } from "@/domain/scoring/lifecycle";
import { isCompletePlayoffBracket } from "@/domain/playoff/playoff";
import type { PrizeConfiguration, PrizeWinnerResult } from "@/domain/payment/payment";
import { ApplicationError } from "@/lib/errors/application-error";

export type PrizeSummary = Readonly<{
  configuration: PrizeConfiguration;
  roundId?: string;
  roundName?: string;
  winner: PrizeWinnerResult;
  tiedParticipants?: readonly Readonly<{
    id: string;
    name: string;
    adminLabel: string | null;
  }>[];
}>;

export type CompletionReadiness = Readonly<{
  ready: boolean;
  blockers: readonly string[];
}>;

export type FinalCompetitionResults = Readonly<{
  competition: Readonly<{
    id: string;
    name: string;
    type: "LEAGUE" | "LEAGUE_PLAYOFFS" | "GROUP_PLAYOFFS";
    status: "DRAFT" | "STARTED" | "COMPLETED";
    currency: "MXN";
    financialFeaturesEnabled: boolean;
    completedAt: Date | null;
  }>;
  canManage: boolean;
  finalWinner: PrizeWinnerResult;
  prizes: readonly PrizeSummary[];
  completion: CompletionReadiness;
}>;

export interface CompletionRepository {
  complete(
    competitionId: string,
    userId: string,
    now: Date,
    verify: (sources: {
      paymentRepository: PaymentRepository;
      standingsRepository: StandingsRepository;
      playoffRepository: PlayoffRepository;
    }) => Promise<boolean>,
  ): Promise<boolean>;
}

function blockerForWinner(winner: PrizeWinnerResult) {
  return winner.state === "notReady"
    ? "El resultado final todavía no está listo."
    : winner.state === "unresolved"
      ? "El resultado final requiere un desempate administrativo."
      : null;
}

export async function getFinalCompetitionResults(
  paymentRepository: PaymentRepository,
  standingsRepository: StandingsRepository,
  playoffRepository: PlayoffRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  now = new Date(),
): Promise<FinalCompetitionResults | null> {
  const actor = requireCompetitionActor(actorValue);
  if (!z.uuid().safeParse(competitionId).success) return null;
  const aggregate = await standingsRepository.getCompetition(competitionId, actor.userId);
  if (!aggregate) return null;
  const financial = await paymentRepository.getPrizes(competitionId, actor.userId);
  if (!financial) return null;

  const regularRoundsFinal =
    aggregate.rounds.length > 0 &&
    (aggregate.requiredRegularRoundCount === null ||
      aggregate.rounds.length === aggregate.requiredRegularRoundCount) &&
    aggregate.rounds.every(
      (item) => effectiveRoundStatus(item.round, now) === "FINALIZED",
    );
  const playoff =
    aggregate.competition.type === "LEAGUE"
      ? null
      : await getPlayoffOverview(playoffRepository, actor, competitionId, now);
  const finalWinner: PrizeWinnerResult =
    aggregate.competition.type === "LEAGUE"
      ? leagueWinnerFromAggregate(aggregate, now)
      : playoff?.champion
        ? {
            state: "resolved",
            winner: {
              id: playoff.champion.participantId,
              name: playoff.champion.name,
            },
          }
        : { state: "notReady" };

  const prizes: PrizeSummary[] = [];
  for (const configuration of financial.prizes) {
    if (configuration.type === "ROUND_WINNER") {
      for (const item of aggregate.rounds) {
        const detail = roundWinnerFromAggregate(aggregate, item.round.id, now);
        if (detail)
          prizes.push({
            configuration,
            roundId: item.round.id,
            roundName: item.round.name,
            winner: detail.outcome,
          });
      }
    } else if (configuration.type === "LEAGUE_WINNER") {
      prizes.push({ configuration, winner: finalWinner });
    } else if (configuration.type === "PLAYOFF_CHAMPION") {
      prizes.push({ configuration, winner: finalWinner });
    } else {
      prizes.push({
        configuration,
        winner: leaguePhasePrizeWinnerFromAggregate(aggregate, now) ?? {
          state: "notReady",
        },
      });
    }
  }

  const blockers: string[] = [];
  if (aggregate.competition.status === "DRAFT")
    blockers.push("La quiniela todavía no ha iniciado.");
  if (!regularRoundsFinal)
    blockers.push("Todas las jornadas regulares deben estar finalizadas.");
  if (
    playoff &&
    ((playoff.competition.type === "GROUP_PLAYOFFS" && playoff.seeds.length < 4) ||
      !isCompletePlayoffBracket({
        seeds: playoff.seeds.map((seed) => ({
          participantId: seed.participantId,
          seed: seed.seed,
        })),
        rounds: playoff.rounds.map((round) => ({
          sequence: round.sequence,
          finalized: round.status === "FINALIZED",
          advancementConfirmed: round.advancementConfirmed,
          matchups: round.matchups.map((matchup) => ({
            participantAId: matchup.participantAId,
            participantBId: matchup.participantBId,
            winnerParticipantId: matchup.winnerParticipantId,
          })),
        })),
      }))
  )
    blockers.push("La eliminatoria debe estar completa y confirmada.");
  const finalBlocker = blockerForWinner(finalWinner);
  if (finalBlocker) blockers.push(finalBlocker);
  if (prizes.some((prize) => prize.winner.state !== "resolved"))
    blockers.push("Todos los premios configurados deben tener ganador resuelto.");

  return {
    competition: {
      ...aggregate.competition,
      currency: financial.currency,
      financialFeaturesEnabled: financial.financialFeaturesEnabled,
    },
    canManage: aggregate.actorIsAdmin,
    finalWinner,
    prizes: prizes.map((prize) => ({
      ...prize,
      ...(prize.winner.state === "unresolved"
        ? {
            tiedParticipants: prize.winner.tiedParticipantIds.map((id) => {
              const person = aggregate.participants.find((item) => item.id === id);
              return {
                id,
                name: person?.name ?? "Participante",
                adminLabel: aggregate.actorIsAdmin ? (person?.email ?? null) : null,
              };
            }),
          }
        : {}),
    })),
    completion: { ready: blockers.length === 0, blockers: [...new Set(blockers)] },
  };
}

export async function completeCompetition(
  repository: CompletionRepository,
  paymentRepository: PaymentRepository,
  standingsRepository: StandingsRepository,
  playoffRepository: PlayoffRepository,
  actorValue: CompetitionActor,
  competitionId: string,
  now = new Date(),
) {
  const actor = requireCompetitionActor(actorValue);
  if (
    !(await repository.complete(competitionId, actor.userId, now, async (sources) => {
      const results = await getFinalCompetitionResults(
        sources.paymentRepository,
        sources.standingsRepository,
        sources.playoffRepository,
        actor,
        competitionId,
        now,
      );
      if (!results?.canManage)
        throw new ApplicationError(
          "UNAUTHORIZED",
          "No fue posible completar la quiniela.",
        );
      if (!results.completion.ready)
        throw new ApplicationError(
          "INVALID_INPUT",
          "La quiniela todavía tiene resultados pendientes.",
        );
      return true;
    }))
  )
    throw new ApplicationError("INVALID_INPUT", "La quiniela ya no se puede completar.");
  return { success: true } as const;
}
