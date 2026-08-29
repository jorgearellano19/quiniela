CREATE TYPE "public"."playoff_advancement_mode" AS ENUM('BEST_SEED', 'TIEBREAKER_QUESTION');--> statement-breakpoint
CREATE TABLE "playoff_matchup" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"playoff_round_id" text NOT NULL,
	"position" integer NOT NULL,
	"participant_a_id" text NOT NULL,
	"participant_b_id" text NOT NULL,
	"winner_participant_id" text,
	"winner_decided_by" text,
	"source_fingerprint" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playoff_matchup_position_positive" CHECK ("playoff_matchup"."position" > 0),
	CONSTRAINT "playoff_matchup_distinct_participants" CHECK ("playoff_matchup"."participant_a_id" <> "playoff_matchup"."participant_b_id"),
	CONSTRAINT "playoff_matchup_winner_valid" CHECK ("playoff_matchup"."winner_participant_id" is null or "playoff_matchup"."winner_participant_id" in ("playoff_matchup"."participant_a_id", "playoff_matchup"."participant_b_id")),
	CONSTRAINT "playoff_matchup_resolution_shape" CHECK (("playoff_matchup"."winner_participant_id" is null and "playoff_matchup"."winner_decided_by" is null and "playoff_matchup"."source_fingerprint" is null and "playoff_matchup"."resolved_at" is null) or ("playoff_matchup"."winner_participant_id" is not null and "playoff_matchup"."winner_decided_by" in ('SCORE','SEED','TIEBREAKER','MANUAL') and length("playoff_matchup"."source_fingerprint") = 64 and "playoff_matchup"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "playoff_round" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" "round_status" DEFAULT 'DRAFT' NOT NULL,
	"unanswered_penalty" integer DEFAULT -1 NOT NULL,
	"advancement_mode" "playoff_advancement_mode" NOT NULL,
	"tiebreaker_question_id" text,
	"published_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playoff_round_sequence_positive" CHECK ("playoff_round"."sequence" > 0),
	CONSTRAINT "playoff_round_name_valid" CHECK (length(trim("playoff_round"."name")) between 1 and 120),
	CONSTRAINT "playoff_round_unanswered_penalty_valid" CHECK ("playoff_round"."unanswered_penalty" in (-1, 0))
);
--> statement-breakpoint
CREATE TABLE "playoff_seed" (
	"competition_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"seed" integer NOT NULL,
	"source_fingerprint" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playoff_seed_position_positive" CHECK ("playoff_seed"."seed" > 0),
	CONSTRAINT "playoff_seed_source_fingerprint_valid" CHECK (length("playoff_seed"."source_fingerprint") = 64)
);
--> statement-breakpoint
DROP INDEX "question_round_sequence_unique";--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "round_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "playoff_round_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_round_id_competition_unique" ON "playoff_round" USING btree ("id","competition_id");--> statement-breakpoint
ALTER TABLE "playoff_matchup" ADD CONSTRAINT "playoff_matchup_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matchup" ADD CONSTRAINT "playoff_matchup_round_competition_fk" FOREIGN KEY ("playoff_round_id","competition_id") REFERENCES "public"."playoff_round"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matchup" ADD CONSTRAINT "playoff_matchup_participant_a_fk" FOREIGN KEY ("participant_a_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matchup" ADD CONSTRAINT "playoff_matchup_participant_b_fk" FOREIGN KEY ("participant_b_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matchup" ADD CONSTRAINT "playoff_matchup_winner_fk" FOREIGN KEY ("winner_participant_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_round" ADD CONSTRAINT "playoff_round_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_round" ADD CONSTRAINT "playoff_round_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_round" ADD CONSTRAINT "playoff_round_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_seed" ADD CONSTRAINT "playoff_seed_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_seed" ADD CONSTRAINT "playoff_seed_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_seed" ADD CONSTRAINT "playoff_seed_participant_competition_fk" FOREIGN KEY ("participant_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_matchup_round_position_unique" ON "playoff_matchup" USING btree ("playoff_round_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_round_competition_sequence_unique" ON "playoff_round" USING btree ("competition_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_round_competition_name_unique" ON "playoff_round" USING btree ("competition_id",lower(trim("name")));--> statement-breakpoint
CREATE INDEX "playoff_round_competition_status_idx" ON "playoff_round" USING btree ("competition_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_seed_competition_participant_unique" ON "playoff_seed" USING btree ("competition_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_seed_competition_position_unique" ON "playoff_seed" USING btree ("competition_id","seed");--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_playoff_round_id_playoff_round_id_fk" FOREIGN KEY ("playoff_round_id") REFERENCES "public"."playoff_round"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_playoff_round_sequence_unique" ON "question" USING btree ("playoff_round_id","sequence") WHERE "question"."playoff_round_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "question_id_playoff_round_unique" ON "question" USING btree ("id","playoff_round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_round_sequence_unique" ON "question" USING btree ("round_id","sequence") WHERE "question"."round_id" is not null;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_exactly_one_parent" CHECK (num_nonnulls("question"."round_id", "question"."playoff_round_id") = 1);
