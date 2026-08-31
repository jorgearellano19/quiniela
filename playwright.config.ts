import { defineConfig, devices } from "@playwright/test";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required. Use `pnpm test:e2e:local` or configure the isolated CI database.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      testIgnore: "accessibility.spec.ts",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "accessibility-chromium",
      testMatch: "accessibility.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "e2e-only-secret-that-is-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      E2E_RATE_LIMIT_ENABLED: "true",
    },
  },
});
