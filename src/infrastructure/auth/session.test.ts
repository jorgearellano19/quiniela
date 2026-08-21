import { describe, expect, it } from "vitest";
import { isTemporarySessionUsable } from "./session-policy";

const session = {
  session: {},
  user: {
    passwordChangeRequired: true,
    temporaryPasswordExpiresAt: new Date("2030-01-01T00:15:00Z"),
  },
};

describe("temporary-password session authority", () => {
  it("allows replacement before expiry", () => {
    expect(
      isTemporarySessionUsable(session.user, new Date("2030-01-01T00:14:59Z")),
    ).toBe(true);
  });

  it("rejects the session at the expiry boundary", () => {
    expect(
      isTemporarySessionUsable(session.user, new Date("2030-01-01T00:15:00Z")),
    ).toBe(false);
  });

  it("fails closed when required recovery expiry is missing or invalid", () => {
    expect(
      isTemporarySessionUsable({ passwordChangeRequired: true }, new Date()),
    ).toBe(false);
    expect(
      isTemporarySessionUsable(
        {
          passwordChangeRequired: true,
          temporaryPasswordExpiresAt: "not-a-date",
        },
        new Date(),
      ),
    ).toBe(false);
  });
});
