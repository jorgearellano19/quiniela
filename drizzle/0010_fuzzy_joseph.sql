CREATE TABLE "answer" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"numeric_value" numeric(18, 6),
	"option_id" text,
	"text_value" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "answer_value_shape_valid" CHECK ((
        ("answer"."home_score" is not null and "answer"."away_score" is not null and "answer"."numeric_value" is null and "answer"."option_id" is null and "answer"."text_value" is null) or
        ("answer"."home_score" is null and "answer"."away_score" is null and "answer"."numeric_value" is not null and "answer"."option_id" is null and "answer"."text_value" is null) or
        ("answer"."home_score" is null and "answer"."away_score" is null and "answer"."numeric_value" is null and "answer"."option_id" is not null and "answer"."text_value" is null) or
        ("answer"."home_score" is null and "answer"."away_score" is null and "answer"."numeric_value" is null and "answer"."option_id" is null and "answer"."text_value" is not null)
      )),
	CONSTRAINT "answer_match_score_valid" CHECK ("answer"."home_score" is null or ("answer"."home_score" between 0 and 999 and "answer"."away_score" between 0 and 999)),
	CONSTRAINT "answer_text_value_valid" CHECK ("answer"."text_value" is null or length(trim("answer"."text_value")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_participant_id_competition_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."competition_participant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_option_id_question_unique" ON "question_option" USING btree ("id","question_id");--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_option_question_fk" FOREIGN KEY ("option_id","question_id") REFERENCES "public"."question_option"("id","question_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_question_participant_unique" ON "answer" USING btree ("question_id","participant_id");--> statement-breakpoint
CREATE INDEX "answer_participant_submitted_idx" ON "answer" USING btree ("participant_id","submitted_at");
