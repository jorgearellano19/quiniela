import { nextCookies } from "better-auth/next-js";
import { db } from "../db/client";
import { createAuth } from "./create-auth";

export const auth = createAuth(db, [nextCookies()]);
