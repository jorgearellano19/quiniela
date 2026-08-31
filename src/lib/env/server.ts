import { z } from "zod";

const developmentSecrets = new Set([
  "local-development-secret-change-me",
  "ci-only-secret-that-is-at-least-32-characters",
  "e2e-only-secret-that-is-at-least-32-characters",
]);

const schema = z
  .object({
    DATABASE_URL: z
      .url()
      .refine(
        (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
        "DATABASE_URL must be a PostgreSQL URL",
      ),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") return;
    const authUrl = new URL(value.BETTER_AUTH_URL);
    const localOrigin = ["localhost", "127.0.0.1", "::1"].includes(authUrl.hostname);
    if (authUrl.protocol !== "https:" && !localOrigin) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL must use HTTPS in production",
      });
    }
    if (!localOrigin && developmentSecrets.has(value.BETTER_AUTH_SECRET)) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "BETTER_AUTH_SECRET must be unique in production",
      });
    }
  });
export type ServerEnvironment = z.infer<typeof schema>;
let cached: ServerEnvironment | undefined;
export function getServerEnvironment(): ServerEnvironment {
  cached ??= schema.parse(process.env);
  return cached;
}
