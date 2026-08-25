import { describe, expect, it } from "vitest";
import {
  canApproveAtCount,
  MembershipDomainError,
  requestMembership,
  transitionMembership,
  validateCompetitionStart,
} from "./membership";

describe("membership transitions", () => {
  it.each([null, "REJECTED", "REMOVED"] as const)("allows %s to request", (status) =>
    expect(requestMembership(status)).toEqual({
      next: "PENDING",
      changed: true,
    }),
  );
  it("makes a repeated pending request idempotent", () =>
    expect(requestMembership("PENDING")).toEqual({
      next: "PENDING",
      changed: false,
    }));
  it("rejects an active duplicate request", () =>
    expect(() => requestMembership("ACTIVE")).toThrow(MembershipDomainError));
  it.each([
    ["PENDING", "APPROVE", "ACTIVE"],
    ["PENDING", "REJECT", "REJECTED"],
    ["ACTIVE", "REMOVE", "REMOVED"],
    ["ACTIVE", "LEAVE", "REMOVED"],
  ] as const)("transitions %s through %s", (from, action, to) =>
    expect(transitionMembership(from, action, "DRAFT")).toBe(to),
  );
  it("locks every change after start", () =>
    expect(() => transitionMembership("ACTIVE", "LEAVE", "STARTED")).toThrow());
  it.each([
    ["ACTIVE", "APPROVE"],
    ["ACTIVE", "REJECT"],
    ["PENDING", "REMOVE"],
    ["PENDING", "LEAVE"],
    ["REJECTED", "APPROVE"],
    ["REJECTED", "REMOVE"],
    ["REMOVED", "APPROVE"],
    ["REMOVED", "LEAVE"],
  ] as const)("rejects %s through %s", (status, action) =>
    expect(() => transitionMembership(status, action, "DRAFT")).toThrow(
      MembershipDomainError,
    ),
  );
});

describe("membership counts", () => {
  it("enforces approval maxima", () => {
    expect(canApproveAtCount("LEAGUE", 100)).toBe(true);
    expect(canApproveAtCount("LEAGUE_PLAYOFFS", 30)).toBe(false);
    expect(canApproveAtCount("GROUP_PLAYOFFS", 64)).toBe(false);
  });
  it.each([
    ["LEAGUE", 1],
    ["LEAGUE_PLAYOFFS", 2],
    ["LEAGUE_PLAYOFFS", 30],
    ["GROUP_PLAYOFFS", 8],
    ["GROUP_PLAYOFFS", 16],
    ["GROUP_PLAYOFFS", 32],
    ["GROUP_PLAYOFFS", 64],
  ] as const)("starts %s with %i active", (type, activeCount) =>
    expect(() =>
      validateCompetitionStart({
        type,
        status: "DRAFT",
        activeCount,
        pendingCount: 0,
      }),
    ).not.toThrow(),
  );
  it.each([
    ["LEAGUE", 0],
    ["LEAGUE_PLAYOFFS", 1],
    ["LEAGUE_PLAYOFFS", 31],
    ["GROUP_PLAYOFFS", 7],
    ["GROUP_PLAYOFFS", 9],
  ] as const)("rejects %s with %i active", (type, activeCount) =>
    expect(() =>
      validateCompetitionStart({
        type,
        status: "DRAFT",
        activeCount,
        pendingCount: 0,
      }),
    ).toThrow(),
  );
  it("rejects pending requests", () =>
    expect(() =>
      validateCompetitionStart({
        type: "LEAGUE",
        status: "DRAFT",
        activeCount: 1,
        pendingCount: 1,
      }),
    ).toThrow());
});
