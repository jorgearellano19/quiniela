import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";
try {
  await migrate(db, { migrationsFolder: "drizzle" });
} finally {
  await sql.end();
}
