import { afterEach, describe, expect, it, vi } from "vitest";

describe("server environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("rejects a non-PostgreSQL database URL", async () => {
    vi.stubEnv("DATABASE_URL", "https://example.com/database");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-secret-that-is-at-least-32-characters");
    const { getServerEnvironment } = await import("./server");
    expect(() => getServerEnvironment()).toThrow();
  });
  it("parses valid server-only configuration", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/quiniela");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-secret-that-is-at-least-32-characters");
    const { getServerEnvironment } = await import("./server");
    expect(getServerEnvironment().DATABASE_URL).toContain("postgresql://");
  });
});
