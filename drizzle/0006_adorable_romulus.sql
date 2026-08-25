CREATE TYPE "public"."question_type" AS ENUM('MATCH_SCORE', 'CLOSEST_VALUE', 'OPTIONS', 'OPEN_TEXT', 'EXACT_VALUE');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('DRAFT', 'PUBLISHED', 'ACTIVE', 'FINISHED', 'FINALIZED');--> statement-breakpoint
CREATE TABLE "match_question_config" (
	"question_id" text PRIMARY KEY NOT NULL,
	"home_label" text NOT NULL,
	"away_label" text NOT NULL,
	CONSTRAINT "match_question_labels_valid" CHECK (length(trim("match_question_config"."home_label")) between 1 and 120 and length(trim("match_question_config"."away_label")) between 1 and 120 and lower(trim("match_question_config"."home_label")) <> lower(trim("match_question_config"."away_label")))
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" text NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_sequence_positive" CHECK ("question"."sequence" > 0),
	CONSTRAINT "question_prompt_valid" CHECK (length(trim("question"."prompt")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "question_option" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "question_option_sequence_positive" CHECK ("question_option"."sequence" > 0),
	CONSTRAINT "question_option_label_valid" CHECK (length(trim("question_option"."label")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "question_scoring" (
	"question_id" text PRIMARY KEY NOT NULL,
	"points" integer,
	"exact_score_points" integer,
	"goal_difference_points" integer,
	"normal_result_points" integer,
	"against_rival" boolean,
	CONSTRAINT "question_scoring_points_range" CHECK (("question_scoring"."points" is null or "question_scoring"."points" between 1 and 100) and ("question_scoring"."exact_score_points" is null or "question_scoring"."exact_score_points" between 1 and 100) and ("question_scoring"."goal_difference_points" is null or "question_scoring"."goal_difference_points" between 1 and 100) and ("question_scoring"."normal_result_points" is null or "question_scoring"."normal_result_points" between 1 and 100))
);
--> statement-breakpoint
CREATE TABLE "round" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"status" "round_status" DEFAULT 'DRAFT' NOT NULL,
	"unanswered_penalty" integer DEFAULT -1 NOT NULL,
	"published_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_sequence_positive" CHECK ("round"."sequence" > 0),
	CONSTRAINT "round_name_valid" CHECK (length(trim("round"."name")) between 1 and 120),
	CONSTRAINT "round_unanswered_penalty_valid" CHECK ("round"."unanswered_penalty" in (-1, 0))
);
--> statement-breakpoint
ALTER TABLE "match_question_config" ADD CONSTRAINT "match_question_config_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_option" ADD CONSTRAINT "question_option_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_scoring" ADD CONSTRAINT "question_scoring_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round" ADD CONSTRAINT "round_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_round_sequence_unique" ON "question" USING btree ("round_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "question_option_question_sequence_unique" ON "question_option" USING btree ("question_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "question_option_question_label_unique" ON "question_option" USING btree ("question_id",lower(trim("label")));--> statement-breakpoint
CREATE UNIQUE INDEX "round_competition_sequence_unique" ON "round" USING btree ("competition_id","sequence");--> statement-breakpoint
CREATE INDEX "round_competition_status_idx" ON "round" USING btree ("competition_id","status");