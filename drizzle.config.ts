import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.TEST_DATABASE_URL ??
      "postgresql://migration:only@localhost/quiniela",
  },
  strict: true,
  verbose: true,
});
