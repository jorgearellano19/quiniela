import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnvironment } from "@/lib/env/server";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  quinielaSql?: ReturnType<typeof postgres>;
};
const environment = getServerEnvironment();
const sql =
  globalDatabase.quinielaSql ??
  postgres(environment.DATABASE_URL, { prepare: false });
if (environment.NODE_ENV !== "production") globalDatabase.quinielaSql = sql;
export const db = drizzle(sql, { schema });
export { sql };
