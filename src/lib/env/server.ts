import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL URL",
    ),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});
export type ServerEnvironment = z.infer<typeof schema>;
let cached: ServerEnvironment | undefined;
export function getServerEnvironment(): ServerEnvironment {
  cached ??= schema.parse(process.env);
  return cached;
}
