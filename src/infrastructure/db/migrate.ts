import { migrate } from "drizzle-orm/postgres-js/migrator";

if (process.argv.includes("--test")) {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required to migrate the test database.",
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;
}

const { db, sql } = await import("./client");

try {
  await migrate(db, { migrationsFolder: "drizzle" });
} finally {
  await sql.end();
}
