import { sql } from "drizzle-orm";
import type { CompletionRepository } from "@/application/prize/use-cases";
import { db } from "@/infrastructure/db/client";
import { createPaymentRepository } from "@/infrastructure/payment/payment-repository";
import { createPlayoffRepository } from "@/infrastructure/playoff/playoff-repository";
import { createStandingsRepository } from "@/infrastructure/standings/standings-repository";

export function createCompletionRepository(database: typeof db): CompletionRepository {
  return {
    async complete(competitionId, userId, now, verify) {
      return database.transaction(async (tx) => {
        const locked = await tx.execute(sql`
          select c.id from competition c
          join competition_participant cp on cp.competition_id = c.id
            and cp.user_id = ${userId} and cp.is_admin = true
          where c.id = ${competitionId} and c.status = 'STARTED'
          for update
        `);
        if (!locked.length) return false;
        await tx.execute(sql`
          select r.id from round r where r.competition_id = ${competitionId}
          for update
        `);
        await tx.execute(sql`
          select pr.id from playoff_round pr where pr.competition_id = ${competitionId}
          for update
        `);
        const txDb = tx as unknown as typeof db;
        if (
          !(await verify({
            paymentRepository: createPaymentRepository(txDb),
            standingsRepository: createStandingsRepository(txDb),
            playoffRepository: createPlayoffRepository(txDb),
          }))
        )
          return false;
        const rows = await tx.execute(sql`
          update competition c
          set status = 'COMPLETED', completed_at = ${now.toISOString()}::timestamptz,
              updated_at = ${now.toISOString()}::timestamptz, updated_by_user_id = ${userId}
          where c.id = ${competitionId}
            and c.status = 'STARTED'
          returning c.id
        `);
        return rows.length === 1;
      });
    },
  };
}

export const completionRepository = createCompletionRepository(db);
