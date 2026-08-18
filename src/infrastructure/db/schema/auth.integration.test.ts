import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
const client = testDatabaseUrl
  ? postgres(testDatabaseUrl, { prepare: false })
  : undefined;
describeWithDatabase("authentication migration", () => {
  afterAll(async () => {
    await client?.end();
  });
  it("creates only the Better Auth foundation tables", async () => {
    const result = await client!.unsafe<{ table_name: string }[]>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(result.map(({ table_name }) => table_name)).toEqual(
      expect.arrayContaining(["account", "session", "user", "verification"]),
    );
  });
});
