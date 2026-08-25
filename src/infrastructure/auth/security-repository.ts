import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, count, desc, eq, gte, sql as drizzleSql } from "drizzle-orm";
import type {
  AuthSecurityRepository,
  SecurityUser,
} from "@/application/auth-security/use-cases";
import { ApplicationError } from "@/lib/errors/application-error";
import { db } from "../db/client";
import { account, authSecurityEvent, session, user } from "../db/schema";
import { isPlatformOperator } from "./permissions";

async function lockEligibleTarget(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  targetId: string,
) {
  const [target] = await tx
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, targetId))
    .limit(1)
    .for("update");
  if (!target) {
    throw new ApplicationError("INVALID_INPUT", "La cuenta no existe.");
  }
  if (isPlatformOperator(target.role)) {
    throw new ApplicationError(
      "UNAUTHORIZED",
      "Revoca primero el acceso de operador desde la CLI.",
    );
  }
}

export function createAuthSecurityRepository(
  database: typeof db,
): AuthSecurityRepository {
  return {
    async findByEmail(email): Promise<SecurityUser | null> {
      const [row] = await database
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          banned: user.banned,
          banReason: user.banReason,
          passwordChangeRequired: user.passwordChangeRequired,
          temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
          activeSessionCount: count(session.id),
        })
        .from(user)
        .leftJoin(session, eq(session.userId, user.id))
        .where(eq(user.email, email))
        .groupBy(user.id)
        .limit(1);
      if (!row) return null;
      const events = await database
        .select({
          action: authSecurityEvent.action,
          reason: authSecurityEvent.reason,
          verificationMethod: authSecurityEvent.verificationMethod,
          createdAt: authSecurityEvent.createdAt,
        })
        .from(authSecurityEvent)
        .where(eq(authSecurityEvent.targetUserId, row.id))
        .orderBy(desc(authSecurityEvent.createdAt))
        .limit(20);
      return { ...row, events };
    },

    async suspend(actorId, targetId, reason) {
      await database.transaction(async (tx) => {
        await lockEligibleTarget(tx, targetId);
        await tx
          .update(user)
          .set({
            banned: true,
            banReason: reason,
            banExpires: null,
            updatedAt: new Date(),
          })
          .where(eq(user.id, targetId));
        await tx.delete(session).where(eq(session.userId, targetId));
        await tx.insert(authSecurityEvent).values({
          id: randomUUID(),
          actorUserId: actorId,
          targetUserId: targetId,
          action: "ACCOUNT_SUSPENDED",
          reason,
        });
      });
    },

    async restore(actorId, targetId, reason) {
      await database.transaction(async (tx) => {
        await lockEligibleTarget(tx, targetId);
        await tx
          .update(user)
          .set({
            banned: false,
            banReason: null,
            banExpires: null,
            updatedAt: new Date(),
          })
          .where(eq(user.id, targetId));
        await tx.insert(authSecurityEvent).values({
          id: randomUUID(),
          actorUserId: actorId,
          targetUserId: targetId,
          action: "ACCOUNT_RESTORED",
          reason,
        });
      });
    },

    async revokeSessions(actorId, targetId, reason) {
      await database.transaction(async (tx) => {
        await lockEligibleTarget(tx, targetId);
        await tx.delete(session).where(eq(session.userId, targetId));
        await tx.insert(authSecurityEvent).values({
          id: randomUUID(),
          actorUserId: actorId,
          targetUserId: targetId,
          action: "SESSIONS_REVOKED",
          reason,
        });
      });
    },

    async issueTemporaryPassword(input) {
      const temporaryPassword = randomBytes(15).toString("base64url");
      const passwordHash = await hashPassword(temporaryPassword);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      await database.transaction(async (tx) => {
        await tx.execute(
          drizzleSql`select pg_advisory_xact_lock(hashtext(${`auth-recovery-actor:${input.actorId}`}))`,
        );
        await lockEligibleTarget(tx, input.targetId);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const [{ targetCount = 0 } = {}] = await tx
          .select({ targetCount: count() })
          .from(authSecurityEvent)
          .where(
            and(
              eq(authSecurityEvent.action, "TEMPORARY_PASSWORD_ISSUED"),
              eq(authSecurityEvent.targetUserId, input.targetId),
              gte(authSecurityEvent.createdAt, oneHourAgo),
            ),
          );
        const [{ actorCount = 0 } = {}] = await tx
          .select({ actorCount: count() })
          .from(authSecurityEvent)
          .where(
            and(
              eq(authSecurityEvent.action, "TEMPORARY_PASSWORD_ISSUED"),
              eq(authSecurityEvent.actorUserId, input.actorId),
              gte(authSecurityEvent.createdAt, oneHourAgo),
            ),
          );
        if (targetCount >= 3 || actorCount >= 20) {
          throw new ApplicationError(
            "TOO_MANY_REQUESTS",
            "Demasiadas solicitudes. Inténtalo más tarde.",
          );
        }
        const changed = await tx
          .update(account)
          .set({ password: passwordHash, updatedAt: now })
          .where(
            and(eq(account.userId, input.targetId), eq(account.providerId, "credential")),
          )
          .returning({ id: account.id });
        if (!changed.length) {
          throw new ApplicationError("INVALID_INPUT", "La cuenta no usa contraseña.");
        }
        await tx
          .update(user)
          .set({
            passwordChangeRequired: true,
            temporaryPasswordIssuedAt: now,
            temporaryPasswordExpiresAt: expiresAt,
            updatedAt: now,
          })
          .where(eq(user.id, input.targetId));
        await tx.delete(session).where(eq(session.userId, input.targetId));
        await tx.insert(authSecurityEvent).values({
          id: randomUUID(),
          actorUserId: input.actorId,
          targetUserId: input.targetId,
          action: "TEMPORARY_PASSWORD_ISSUED",
          reason: input.reason,
          verificationMethod: input.verificationMethod,
        });
      });
      return { temporaryPassword, expiresAt };
    },
  };
}

export const authSecurityRepository = createAuthSecurityRepository(db);
