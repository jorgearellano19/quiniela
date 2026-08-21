import "server-only";

import { headers } from "next/headers";
import { auth } from "./auth";
import { isTemporarySessionUsable } from "./session-policy";

export type ServerSession = typeof auth.$Infer.Session;

export async function getServerSession(): Promise<ServerSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session && isTemporarySessionUsable(session.user) ? session : null;
}
