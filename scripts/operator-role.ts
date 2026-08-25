import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { getServerEnvironment } from "../src/lib/env/server";
import { authSecurityEvent, user } from "../src/infrastructure/db/schema";

const operation = process.argv[2];
const args = new Map<string, string>();
for (let index = 3; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) args.set(key.slice(2), value);
}

const email = args.get("email")?.trim().toLowerCase();
const actor = args.get("actor")?.trim();
const reason = args.get("reason")?.trim();
if (!email || !actor || !reason || !["grant", "revoke"].includes(operation ?? "")) {
  throw new Error(
    "Usage: pnpm operator:<grant|revoke> --email <email> --actor <label> --reason <reason>",
  );
}

const connection = postgres(getServerEnvironment().DATABASE_URL, {
  prepare: false,
});
const database = drizzle(connection);
try {
  const [target] = await database
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!target) throw new Error("No user exists with that exact email.");
  const nextRole = operation === "grant" ? "platform_operator" : "user";
  if (target.role !== nextRole) {
    await database.transaction(async (tx) => {
      await tx
        .update(user)
        .set({ role: nextRole, updatedAt: new Date() })
        .where(eq(user.id, target.id));
      await tx.insert(authSecurityEvent).values({
        id: randomUUID(),
        actorLabel: actor,
        targetUserId: target.id,
        action: operation === "grant" ? "OPERATOR_GRANTED" : "OPERATOR_REVOKED",
        reason,
      });
    });
  }
  process.stdout.write(
    `${operation === "grant" ? "Granted" : "Revoked"} platform operator for ${email}.\n`,
  );
} finally {
  await connection.end();
}
