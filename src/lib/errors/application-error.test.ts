import { describe, expect, it } from "vitest";
import { ApplicationError, toSafeError } from "./application-error";
describe("toSafeError", () => {
  it("preserves stable application errors", () => {
    expect(
      toSafeError(new ApplicationError("INVALID_INPUT", "Invalid request.")),
    ).toEqual({ code: "INVALID_INPUT", message: "Invalid request." });
  });
  it("hides unknown internal details", () => {
    expect(toSafeError(new Error("database password leaked"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
  });
});
