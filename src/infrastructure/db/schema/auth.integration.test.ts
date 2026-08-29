import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required. Copy `.env.example` to `.env.local`, run `pnpm db:setup`, and then run `pnpm test:integration:local`.",
  );
}

const client = postgres(testDatabaseUrl, { prepare: false });

describe("authentication migration", () => {
  afterAll(async () => {
    await client.end();
  });

  it("creates the approved Better Auth and security tables", async () => {
    const result = await client.unsafe<{ table_name: string }[]>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(result.map(({ table_name }) => table_name)).toEqual([
      "account",
      "answer",
      "auth_security_event",
      "competition",
      "competition_group",
      "competition_group_participant",
      "competition_participant",
      "competition_participant_event",
      "h2h_draw_participant",
      "h2h_matchup",
      "h2h_phase_configuration",
      "manual_ranking_resolution",
      "manual_ranking_resolution_entry",
      "match_question_config",
      "official_result",
      "official_result_correction_event",
      "open_text_judgment",
      "open_text_judgment_correction_event",
      "payment",
      "payment_event",
      "payment_obligation",
      "prize_configuration",
      "question",
      "question_option",
      "question_scoring",
      "rate_limit",
      "round",
      "session",
      "user",
      "verification",
    ]);
  });
});
