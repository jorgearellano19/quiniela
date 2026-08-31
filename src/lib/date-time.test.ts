import { describe, expect, it, vi } from "vitest";
import { localDateTimeToUtcIso, toLocalDateTimeInput } from "./date-time";

describe("local date-time inputs", () => {
  it("round-trips a UTC instant through the browser timezone", () => {
    vi.stubEnv("TZ", "America/Mazatlan");
    const instant = "2027-01-01T19:00:00.000Z";
    const local = toLocalDateTimeInput(instant);
    expect(local).toBe("2027-01-01T12:00");
    expect(localDateTimeToUtcIso(local)).toBe(instant);
    vi.unstubAllEnvs();
  });

  it("fails closed for empty or invalid values", () => {
    expect(toLocalDateTimeInput("not-a-date")).toBe("");
    expect(localDateTimeToUtcIso("not-a-date")).toBe("");
  });
});
