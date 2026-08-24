import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCompetitionRepository } from "./competition-repository";
import * as schema from "@/infrastructure/db/schema";
import type { Competition } from "@/domain/competition/competition";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "TEST_DATABASE_URL is required. Run pnpm db:setup before integration tests.",
  );
const client = postgres(url, { prepare: false });
const database = drizzle(client, { schema });
const repository = createCompetitionRepository(database as never);
const userOne = "m2-user-one";
const userTwo = "m2-user-two";
function value(id = randomUUID()): Competition {
  const now = new Date();
  return {
    id,
    name: "Copa M2",
    type: "LEAGUE",
    status: "DRAFT",
    currency: "MXN",
    rulesNote: null,
    createdByUserId: userOne,
    updatedByUserId: userOne,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Competition persistence", () => {
  beforeEach(async () => {
    await client`delete from competition_participant`;
    await client`delete from competition`;
    await client`delete from "user" where id in (${userOne}, ${userTwo})`;
    await client`insert into "user" (id, name, email) values (${userOne}, 'Uno', 'm2-one@example.com'), (${userTwo}, 'Dos', 'm2-two@example.com')`;
  });
  afterAll(async () => {
    await client`delete from competition_participant`;
    await client`delete from competition`;
    await client`delete from "user" where id in (${userOne}, ${userTwo})`;
    await client.end();
  });
  it("atomically creates a DRAFT MXN Competition and creator Admin membership", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID());
    const [row] =
      await client`select c.status, c.currency, cp.is_admin from competition c join competition_participant cp on cp.competition_id = c.id where c.id = ${competition.id}`;
    expect(row).toMatchObject({
      status: "DRAFT",
      currency: "MXN",
      is_admin: true,
    });
  });
  it("enforces unique membership, restrictive foreign keys, and fixed currency", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID());
    await expect(
      client`insert into competition_participant (id, competition_id, user_id) values (${randomUUID()}, ${competition.id}, ${userOne})`,
    ).rejects.toThrow();
    await expect(
      client`delete from "user" where id = ${userOne}`,
    ).rejects.toThrow();
    await expect(
      client`update competition set currency = 'USD' where id = ${competition.id}`,
    ).rejects.toThrow();
  });
  it("rolls back the Competition when creator membership insertion fails", async () => {
    const first = value();
    const membershipId = randomUUID();
    await repository.createWithAdmin(first, membershipId);
    const second = value();
    await expect(
      repository.createWithAdmin(second, membershipId),
    ).rejects.toThrow();
    const rows =
      await client`select id from competition where id = ${second.id}`;
    expect(rows).toHaveLength(0);
  });
  it("scopes list/detail to membership and conditionally updates DRAFT with attribution", async () => {
    const competition = value();
    await repository.createWithAdmin(competition, randomUUID());
    expect(await repository.listForUser(userTwo)).toEqual([]);
    expect(await repository.findForUser(competition.id, userTwo)).toBeNull();
    const updated = {
      ...competition,
      name: "Actualizada",
      updatedByUserId: userOne,
      updatedAt: new Date(),
    };
    expect(await repository.updateDraft(updated, userOne)).toBe(true);
    const [row] =
      await client`select name, updated_by_user_id from competition where id = ${competition.id}`;
    expect(row).toMatchObject({
      name: "Actualizada",
      updated_by_user_id: userOne,
    });
    await client`update competition set status = 'STARTED' where id = ${competition.id}`;
    expect(
      await repository.updateDraft({ ...updated, name: "No" }, userOne),
    ).toBe(false);
  });
});
