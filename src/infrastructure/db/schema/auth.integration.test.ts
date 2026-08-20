import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required. Copy `.env.example` to `.env.local`, run `pnpm db:setup`, and then run `pnpm test:integration:local`.",
  );
}

const client = postgres(testDatabaseUrl, { prepare: false });

describe("authentication migration", () => {
  afterAll(async () => {
    await client.end();
  });

  it("creates only the Better Auth foundation tables", async () => {
    const result = await client.unsafe<{ table_name: string }[]>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(result.map(({ table_name }) => table_name)).toEqual([
      "account",
      "session",
      "user",
      "verification",
    ]);
  });
});
