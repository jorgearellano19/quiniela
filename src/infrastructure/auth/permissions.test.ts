import { describe, expect, it } from "vitest";
import { platformOperatorRole, userRole } from "./permissions";

describe("Better Auth platform roles", () => {
  it("grants only the approved custom platform capabilities", () => {
    expect(
      platformOperatorRole.authorize({ platform: ["lookup", "recover"] }).success,
    ).toBe(true);
    expect(platformOperatorRole.authorize({ user: ["delete"] }).success).toBe(false);
    expect(platformOperatorRole.authorize({ user: ["impersonate"] }).success).toBe(false);
    expect(platformOperatorRole.authorize({ user: ["set-password"] }).success).toBe(
      false,
    );
    expect(platformOperatorRole.authorize({ user: ["set-role"] }).success).toBe(false);
    expect(platformOperatorRole.authorize({ user: ["list", "ban"] }).success).toBe(false);
    expect(platformOperatorRole.authorize({ session: ["list", "revoke"] }).success).toBe(
      false,
    );
  });

  it("gives an ordinary user no platform capability", () => {
    expect(userRole.authorize({ platform: ["lookup"] }).success).toBe(false);
  });
});
