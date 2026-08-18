import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getServerEnvironment } from "@/lib/env/server";
import { db } from "../db/client";
import * as schema from "../db/schema";

const environment = getServerEnvironment();
export const auth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
});
