WITH "duplicate_round_names" AS (
	SELECT "id", row_number() OVER (PARTITION BY "competition_id", lower(trim("name")) ORDER BY "created_at", "id") AS "position"
	FROM "round"
)
UPDATE "round"
SET "name" = left(trim("round"."name"), 81) || ' · ' || "round"."id"
FROM "duplicate_round_names"
WHERE "round"."id" = "duplicate_round_names"."id" AND "duplicate_round_names"."position" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "round_competition_name_unique" ON "round" USING btree ("competition_id",lower(trim("name")));
