import { drizzle } from "drizzle-orm/postgres-js";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createAuth } from "./create-auth";
import { createAuthSecurityRepository } from "./security-repository";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required. Copy `.env.example` to `.env.local`, run `pnpm db:setup`, and then run `pnpm test:integration:local`.",
  );
}

const sql = postgres(testDatabaseUrl, { prepare: false });
const testDatabase = drizzle(sql, { schema });
const testAuth = createAuth(testDatabase);
const limitedAuth = createAuth(testDatabase, [], true);
const securityRepository = createAuthSecurityRepository(testDatabase);
const baseUrl = "http://localhost:3000/api/auth";
const password = "password-seguro";

function authRequest(path: string, init?: RequestInit) {
  return testAuth.handler(
    new Request(`${baseUrl}${path}`, {
      ...init,
      headers: {
        origin: "http://localhost:3000",
        ...init?.headers,
      },
    }),
  );
}

function limitedRequest(path: string, body: object) {
  return limitedAuth.handler(
    new Request(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "x-real-ip": "203.0.113.20",
      },
      body: JSON.stringify(body),
    }),
  );
}

function jsonRequest(path: string, body: object, cookie?: string) {
  return authRequest(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie");
  if (!value)
    throw new Error("Expected Better Auth to issue a session cookie.");
  return value.split(";", 1)[0] ?? "";
}

async function signUp(email = "persona@ejemplo.com", name = "Persona Usuaria") {
  return jsonRequest("/sign-up/email", {
    name,
    email,
    password,
  });
}

async function signIn(
  email = "persona@ejemplo.com",
  suppliedPassword = password,
) {
  return jsonRequest("/sign-in/email", {
    email,
    password: suppliedPassword,
    rememberMe: true,
  });
}

describe("Better Auth email and password flow", () => {
  beforeEach(async () => {
    await sql`truncate table ${sql("auth_security_event")}, ${sql("rate_limit")}, ${sql("verification")}, ${sql("session")}, ${sql("account")}, ${sql("user")} cascade`;
  });

  afterAll(async () => {
    await sql.end();
  });

  it("signs up and retrieves the server-side session across requests", async () => {
    const signUpResponse = await signUp(
      "  PERSONA@EJEMPLO.COM ",
      "  Persona Usuaria  ",
    );
    expect(signUpResponse.status).toBe(200);
    expect(signUpResponse.headers.get("set-cookie")).toBeNull();

    const signInResponse = await signIn();
    expect(signInResponse.status).toBe(200);
    const cookie = sessionCookie(signInResponse);

    const sessionResponse = await authRequest("/get-session", {
      headers: { cookie },
    });
    expect(sessionResponse.status).toBe(200);
    const session = await sessionResponse.json();

    expect(session.user).toMatchObject({
      email: "persona@ejemplo.com",
      name: "Persona Usuaria",
      role: "user",
    });
    expect(session.user).not.toHaveProperty("capabilities");
  });

  it("rejects invalid and duplicate sign-up requests without internal details", async () => {
    const invalidResponse = await jsonRequest("/sign-up/email", {
      name: " ",
      email: "persona@ejemplo.com",
      password,
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.text()).toContain("Invalid sign-up input");

    const firstResponse = await signUp();
    expect(firstResponse.status).toBe(200);
    const duplicateResponse = await signUp();
    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.headers.get("set-cookie")).toBeNull();
    const duplicateBody = await duplicateResponse.text();
    expect(duplicateBody).not.toContain("postgresql://");
    expect(duplicateBody).not.toContain("stack");
    expect(duplicateBody).not.toContain(password);
  });

  it("signs in with valid credentials and rejects invalid credentials", async () => {
    expect((await signUp()).status).toBe(200);

    const invalidResponse = await signIn(
      "persona@ejemplo.com",
      "password-incorrecto",
    );
    expect(invalidResponse.ok).toBe(false);
    expect(await invalidResponse.text()).not.toContain("stack");

    const response = await signIn();
    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toContain("session_token");
  });

  it("invalidates the session on sign-out", async () => {
    expect((await signUp()).status).toBe(200);
    const cookie = sessionCookie(await signIn());

    const signOutResponse = await jsonRequest("/sign-out", {}, cookie);
    expect(signOutResponse.status).toBe(200);

    const sessionResponse = await authRequest("/get-session", {
      headers: { cookie },
    });
    expect(await sessionResponse.json()).toBeNull();
  });

  it("keeps global platform identity free of Competition authority", async () => {
    const columns = await sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'user'
    `;
    const names = columns.map(({ column_name }) => column_name);

    expect(names).toContain("role");
    expect(names).not.toContain("capabilities");
    expect(names).not.toContain("competition_id");
  });

  it("persistently rate limits credential requests", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await limitedRequest("/sign-in/email", {
        email: "nobody@example.com",
        password,
      });
      expect(response.status).not.toBe(429);
    }
    const blocked = await limitedRequest("/sign-in/email", {
      email: "nobody@example.com",
      password,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("x-retry-after")).toBeTruthy();
  });

  it("keeps suspended and expired-temporary account errors generic", async () => {
    expect((await signUp()).status).toBe(200);
    await sql`update ${sql("user")} set banned = true, ban_reason = 'internal reason' where email = 'persona@ejemplo.com'`;
    const suspended = await signIn();
    expect(suspended.status).toBe(401);
    expect(await suspended.text()).not.toContain("internal reason");

    await sql`update ${sql("user")} set banned = false, password_change_required = true, temporary_password_expires_at = now() - interval '1 minute' where email = 'persona@ejemplo.com'`;
    const expired = await signIn();
    expect(expired.status).toBe(401);
    expect(await expired.text()).not.toContain("expired");
  });

  it("limits a temporary-password session and clears recovery state after replacement", async () => {
    expect((await signUp()).status).toBe(200);
    const temporaryPassword = "temporal-segura-123";
    const temporaryHash = await hashPassword(temporaryPassword);
    await sql`update ${sql("account")} set password = ${temporaryHash} where user_id = (select id from ${sql("user")} where email = 'persona@ejemplo.com')`;
    await sql`update ${sql("user")} set password_change_required = true, temporary_password_issued_at = now(), temporary_password_expires_at = now() + interval '15 minutes' where email = 'persona@ejemplo.com'`;

    const cookie = sessionCookie(
      await signIn("persona@ejemplo.com", temporaryPassword),
    );
    const changed = await jsonRequest(
      "/change-password",
      {
        currentPassword: temporaryPassword,
        newPassword: "permanente-segura-456",
        revokeOtherSessions: true,
      },
      cookie,
    );
    expect(changed.status).toBe(200);
    const [security] = await sql<
      { password_change_required: boolean; event_count: number }[]
    >`select u.password_change_required,
        (select count(*)::int from ${sql("auth_security_event")} e where e.target_user_id = u.id and e.action = 'PASSWORD_CHANGED') event_count
      from ${sql("user")} u where u.email = 'persona@ejemplo.com'`;
    expect(security).toEqual({
      password_change_required: false,
      event_count: 1,
    });
  });

  it("issues an audited temporary credential transactionally and protects operators", async () => {
    expect((await signUp("operator@example.com", "Operator")).status).toBe(200);
    expect((await signUp("target@example.com", "Target")).status).toBe(200);
    const [operator] = await sql<{ id: string }[]>`
      update ${sql("user")} set role = 'platform_operator'
      where email = 'operator@example.com' returning id
    `;
    const [target] = await sql<{ id: string }[]>`
      select id from ${sql("user")} where email = 'target@example.com'
    `;
    if (!operator || !target) throw new Error("Expected test users.");

    const targetCookie = sessionCookie(
      await signIn("target@example.com", password),
    );
    expect(targetCookie).toContain("session_token");
    const issued = await securityRepository.issueTemporaryPassword({
      actorId: operator.id,
      targetId: target.id,
      reason: "Verified in person",
      verificationMethod: "IN_PERSON",
    });

    const [result] = await sql<
      {
        password: string;
        password_change_required: boolean;
        session_count: number;
        event_count: number;
      }[]
    >`
      select a.password, u.password_change_required,
        (select count(*)::int from ${sql("session")} s where s.user_id = u.id) session_count,
        (select count(*)::int from ${sql("auth_security_event")} e where e.target_user_id = u.id and e.action = 'TEMPORARY_PASSWORD_ISSUED') event_count
      from ${sql("user")} u
      join ${sql("account")} a on a.user_id = u.id and a.provider_id = 'credential'
      where u.id = ${target.id}
    `;
    expect(result?.password_change_required).toBe(true);
    expect(result?.session_count).toBe(0);
    expect(result?.event_count).toBe(1);
    expect(
      await verifyPassword({
        hash: result?.password ?? "",
        password: issued.temporaryPassword,
      }),
    ).toBe(true);

    await expect(
      securityRepository.suspend(operator.id, operator.id, "must be rejected"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
