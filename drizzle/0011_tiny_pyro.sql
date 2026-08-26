CREATE TABLE "official_result" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"numeric_value" numeric(18, 6),
	"option_id" text,
	"recorded_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "official_result_value_shape_valid" CHECK ((
        ("official_result"."home_score" is not null and "official_result"."away_score" is not null and "official_result"."numeric_value" is null and "official_result"."option_id" is null) or
        ("official_result"."home_score" is null and "official_result"."away_score" is null and "official_result"."numeric_value" is not null and "official_result"."option_id" is null) or
        ("official_result"."home_score" is null and "official_result"."away_score" is null and "official_result"."numeric_value" is null and "official_result"."option_id" is not null)
      )),
	CONSTRAINT "official_result_match_score_valid" CHECK ("official_result"."home_score" is null or ("official_result"."home_score" between 0 and 999 and "official_result"."away_score" between 0 and 999))
);
--> statement-breakpoint
CREATE TABLE "official_result_correction_event" (
	"id" text PRIMARY KEY NOT NULL,
	"official_result_id" text NOT NULL,
	"question_id" text NOT NULL,
	"before_home_score" integer,
	"before_away_score" integer,
	"before_numeric_value" numeric(18, 6),
	"before_option_id" text,
	"after_home_score" integer,
	"after_away_score" integer,
	"after_numeric_value" numeric(18, 6),
	"after_option_id" text,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_text_judgment" (
	"answer_id" text PRIMARY KEY NOT NULL,
	"is_correct" boolean NOT NULL,
	"judged_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"judged_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_text_judgment_correction_event" (
	"id" text PRIMARY KEY NOT NULL,
	"answer_id" text NOT NULL,
	"before_is_correct" boolean NOT NULL,
	"after_is_correct" boolean NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "open_text_judgment_correction_changed" CHECK ("open_text_judgment_correction_event"."before_is_correct" <> "open_text_judgment_correction_event"."after_is_correct")
);
--> statement-breakpoint
ALTER TABLE "official_result" ADD CONSTRAINT "official_result_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result" ADD CONSTRAINT "official_result_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result" ADD CONSTRAINT "official_result_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result" ADD CONSTRAINT "official_result_option_question_fk" FOREIGN KEY ("option_id","question_id") REFERENCES "public"."question_option"("id","question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result_correction_event" ADD CONSTRAINT "official_result_correction_event_official_result_id_official_result_id_fk" FOREIGN KEY ("official_result_id") REFERENCES "public"."official_result"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result_correction_event" ADD CONSTRAINT "official_result_correction_event_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result_correction_event" ADD CONSTRAINT "official_result_correction_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result_correction_event" ADD CONSTRAINT "official_result_correction_before_option_fk" FOREIGN KEY ("before_option_id","question_id") REFERENCES "public"."question_option"("id","question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_result_correction_event" ADD CONSTRAINT "official_result_correction_after_option_fk" FOREIGN KEY ("after_option_id","question_id") REFERENCES "public"."question_option"("id","question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_text_judgment" ADD CONSTRAINT "open_text_judgment_answer_id_answer_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_text_judgment" ADD CONSTRAINT "open_text_judgment_judged_by_user_id_user_id_fk" FOREIGN KEY ("judged_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_text_judgment" ADD CONSTRAINT "open_text_judgment_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_text_judgment_correction_event" ADD CONSTRAINT "open_text_judgment_correction_event_answer_id_answer_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_text_judgment_correction_event" ADD CONSTRAINT "open_text_judgment_correction_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "official_result_question_unique" ON "official_result" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "official_result_correction_resource_time_idx" ON "official_result_correction_event" USING btree ("official_result_id","created_at");--> statement-breakpoint
CREATE INDEX "open_text_judgment_correction_resource_time_idx" ON "open_text_judgment_correction_event" USING btree ("answer_id","created_at");