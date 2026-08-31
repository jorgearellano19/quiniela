import { describe, expect, it } from "vitest";
import { questionInput, validateQuestionInput } from "./question-input";

describe("shared question action input", () => {
  it("maps and validates the typed shape used by regular and playoff questions", () => {
    const data = new FormData();
    data.set("type", "MATCH_SCORE");
    data.set("sequence", "1");
    data.set("deadlineMode", "CUSTOM");
    data.set("deadlineAt", "2027-01-01T19:00:00.000Z");
    data.set("homeLabel", "México");
    data.set("awayLabel", "Canadá");
    data.set("exactScorePoints", "3");
    data.set("goalDifferenceEnabled", "on");
    data.set("goalDifferencePoints", "2");
    data.set("normalResultPoints", "1");
    const value = questionInput(crypto.randomUUID(), crypto.randomUUID(), data);
    expect(validateQuestionInput(value)).toBeNull();
    expect(value).toMatchObject({
      type: "MATCH_SCORE",
      exactScorePoints: "3",
      goalDifferencePoints: "2",
      normalResultPoints: "1",
    });
  });

  it("returns field errors for invalid options and scoring", () => {
    const data = new FormData();
    data.set("type", "OPTIONS");
    data.set("sequence", "0");
    data.set("deadlineMode", "CUSTOM");
    data.set("deadlineAt", "invalid");
    data.set("points", "0");
    data.set("options", "Duplicada\nduplicada");
    const error = validateQuestionInput(
      questionInput(crypto.randomUUID(), crypto.randomUUID(), data),
    );
    expect(error?.fieldErrors).toMatchObject({
      sequence: expect.any(String),
      prompt: expect.any(String),
      deadlineAt: expect.any(String),
      points: expect.any(String),
      options: expect.any(String),
    });
  });
});
