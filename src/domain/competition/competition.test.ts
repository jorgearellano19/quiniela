import { describe, expect, it } from "vitest";
import {
  COMPETITION_TYPES,
  createCompetition,
  updateCompetitionConfiguration,
} from "./competition";
const now = new Date("2026-08-21T12:00:00.000Z");
describe("Competition", () => {
  it.each(COMPETITION_TYPES)(
    "creates approved type %s as DRAFT in MXN",
    (type) => {
      const value = createCompetition({
        id: "id",
        name: "  La copa  ",
        type,
        actorUserId: "user",
        now,
      });
      expect(value).toMatchObject({
        name: "La copa",
        type,
        status: "DRAFT",
        currency: "MXN",
        rulesNote: null,
        createdByUserId: "user",
        updatedByUserId: "user",
      });
    },
  );
  it("normalizes and edits optional configuration in DRAFT", () => {
    const value = createCompetition({
      id: "id",
      name: "Uno",
      type: "LEAGUE",
      actorUserId: "one",
      rulesNote: " Nota ",
      now,
    });
    const updated = updateCompetitionConfiguration(value, {
      name: "Dos",
      type: "GROUP_PLAYOFFS",
      rulesNote: "",
      actorUserId: "two",
      now: new Date("2026-08-22T00:00:00Z"),
    });
    expect(updated).toMatchObject({
      name: "Dos",
      type: "GROUP_PLAYOFFS",
      rulesNote: null,
      currency: "MXN",
      status: "DRAFT",
      updatedByUserId: "two",
    });
  });
  it("rejects configuration edits after DRAFT", () => {
    const value = {
      ...createCompetition({
        id: "id",
        name: "Uno",
        type: "LEAGUE",
        actorUserId: "one",
        now,
      }),
      status: "STARTED" as const,
    };
    expect(() =>
      updateCompetitionConfiguration(value, {
        name: "Dos",
        type: "LEAGUE",
        actorUserId: "one",
      }),
    ).toThrow("locked");
  });
  it("rejects blank names and oversized notes", () => {
    expect(() =>
      createCompetition({
        id: "id",
        name: " ",
        type: "LEAGUE",
        actorUserId: "user",
      }),
    ).toThrow();
    expect(() =>
      createCompetition({
        id: "id",
        name: "Ok",
        type: "LEAGUE",
        actorUserId: "user",
        rulesNote: "x".repeat(2001),
      }),
    ).toThrow();
  });
});
