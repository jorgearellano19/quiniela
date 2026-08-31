import { nextCookies } from "better-auth/next-js";
import { db } from "../db/client";
import { createAuth } from "./create-auth";

export const auth = createAuth(
  db,
  [nextCookies()],
  process.env.E2E_RATE_LIMIT_ENABLED === "true" ? true : undefined,
);
