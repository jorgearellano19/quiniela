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
  it("rejects insecure public auth origins in production", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/quiniela");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-unique-production-secret-with-32-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://quiniela.example.com");
    vi.stubEnv("NODE_ENV", "production");
    const { getServerEnvironment } = await import("./server");
    expect(() => getServerEnvironment()).toThrow(/HTTPS/);
  });
  it("rejects documented development secrets in production", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/quiniela");
    vi.stubEnv("BETTER_AUTH_SECRET", "local-development-secret-change-me");
    vi.stubEnv("BETTER_AUTH_URL", "https://quiniela.example.com");
    vi.stubEnv("NODE_ENV", "production");
    const { getServerEnvironment } = await import("./server");
    expect(() => getServerEnvironment()).toThrow(/unique/);
  });
  it("allows the documented secret only for a loopback production build", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/quiniela");
    vi.stubEnv("BETTER_AUTH_SECRET", "local-development-secret-change-me");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    const { getServerEnvironment } = await import("./server");
    expect(getServerEnvironment().BETTER_AUTH_URL).toBe("http://localhost:3000");
  });
});
