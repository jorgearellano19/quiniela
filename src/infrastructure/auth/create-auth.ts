import { randomUUID } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getServerEnvironment } from "@/lib/env/server";
import { signUpCredentialSchema } from "@/lib/validation/auth";
import * as schema from "../db/schema";
import { platformAccess, platformRoles } from "./permissions";

type AuthDatabase = PostgresJsDatabase<typeof schema>;

export function createAuth(
  database: AuthDatabase,
  plugins: BetterAuthOptions["plugins"] = [],
  rateLimitEnabled?: boolean,
) {
  const environment = getServerEnvironment();

  return betterAuth({
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
        ...additionalFields,
        id,
      }),
    },
    user: {
      additionalFields: {
        passwordChangeRequired: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
        temporaryPasswordIssuedAt: {
          type: "date",
          required: false,
          input: false,
        },
        temporaryPasswordExpiresAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },
    rateLimit: {
      enabled: rateLimitEnabled ?? environment.NODE_ENV === "production",
      storage: "database",
      modelName: "rateLimit",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 600, max: 3 },
        "/change-password": { window: 900, max: 5 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    databaseHooks: {
      account: {
        update: {
          after: async (updatedAccount, context) => {
            if (
              context?.path !== "/change-password" ||
              updatedAccount.providerId !== "credential"
            ) {
              return;
            }
            await database.transaction(async (tx) => {
              await tx
                .update(schema.user)
                .set({
                  passwordChangeRequired: false,
                  temporaryPasswordIssuedAt: null,
                  temporaryPasswordExpiresAt: null,
                  updatedAt: new Date(),
                })
                .where(eq(schema.user.id, updatedAccount.userId));
              await tx.insert(schema.authSecurityEvent).values({
                id: randomUUID(),
                actorUserId: updatedAccount.userId,
                targetUserId: updatedAccount.userId,
                action: "PASSWORD_CHANGED",
              });
            });
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === "/sign-in/email") {
          const email =
            typeof context.body?.email === "string"
              ? context.body.email.trim().toLowerCase()
              : "";
          const [existingUser] = await database
            .select({
              banned: schema.user.banned,
              passwordChangeRequired: schema.user.passwordChangeRequired,
              expiresAt: schema.user.temporaryPasswordExpiresAt,
            })
            .from(schema.user)
            .where(eq(schema.user.email, email))
            .limit(1);
          if (
            existingUser?.banned ||
            (existingUser?.passwordChangeRequired &&
              (!existingUser.expiresAt || existingUser.expiresAt.getTime() <= Date.now()))
          ) {
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid email or password.",
            });
          }
          return;
        }

        if (context.path !== "/sign-up/email") return;

        const result = signUpCredentialSchema.safeParse(context.body);
        if (!result.success) {
          throw new APIError("BAD_REQUEST", {
            message: "Invalid sign-up input.",
          });
        }

        return {
          context: {
            ...context,
            body: { ...context.body, ...result.data },
          },
        };
      }),
    },
    plugins: [
      admin({
        ac: platformAccess,
        roles: platformRoles,
        defaultRole: "user",
        bannedUserMessage: "Invalid email or password.",
      }),
      ...plugins,
    ],
  });
}
