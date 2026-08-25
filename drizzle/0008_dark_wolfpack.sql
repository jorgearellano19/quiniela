CREATE TYPE "public"."question_deadline_mode" AS ENUM('ROUND_START', 'CUSTOM');--> statement-breakpoint
ALTER TABLE "question" DROP CONSTRAINT "question_prompt_valid";--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "prompt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "deadline_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "default_match_exact_score_points" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "default_match_goal_difference_points" integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "default_match_normal_result_points" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "default_closest_value_points" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "default_options_points" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "default_open_text_points" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "default_exact_value_points" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "deadline_mode" "question_deadline_mode" DEFAULT 'CUSTOM' NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "uses_default_scoring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "round" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
UPDATE "round" SET "starts_at" = coalesce((SELECT min("deadline_at") FROM "question" WHERE "question"."round_id" = "round"."id"), now() + interval '1 day');--> statement-breakpoint
ALTER TABLE "round" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
UPDATE "question" SET "prompt" = null WHERE "type" = 'MATCH_SCORE';--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "deadline_mode" SET DEFAULT 'ROUND_START';--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "uses_default_scoring" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_default_scoring_valid" CHECK ("competition"."default_match_exact_score_points" between 1 and 100 and "competition"."default_match_normal_result_points" between 1 and 100 and ("competition"."default_match_goal_difference_points" is null or "competition"."default_match_goal_difference_points" between 1 and 100) and "competition"."default_match_exact_score_points" > coalesce("competition"."default_match_goal_difference_points", "competition"."default_match_normal_result_points") and ("competition"."default_match_goal_difference_points" is null or "competition"."default_match_goal_difference_points" > "competition"."default_match_normal_result_points") and "competition"."default_closest_value_points" between 1 and 100 and "competition"."default_options_points" between 1 and 100 and "competition"."default_open_text_points" between 1 and 100 and "competition"."default_exact_value_points" between 1 and 100);--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_deadline_shape_valid" CHECK (("question"."deadline_mode" = 'ROUND_START' and "question"."deadline_at" is null) or ("question"."deadline_mode" = 'CUSTOM' and "question"."deadline_at" is not null));--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_prompt_valid" CHECK (("question"."type" = 'MATCH_SCORE' and "question"."prompt" is null) or ("question"."type" <> 'MATCH_SCORE' and length(trim("question"."prompt")) between 1 and 500));
