ALTER TYPE "public"."ranking_resolution_scope" ADD VALUE 'H2H_PHASE';--> statement-breakpoint
ALTER TYPE "public"."ranking_resolution_scope" ADD VALUE 'GROUP_STANDINGS';--> statement-breakpoint
CREATE TABLE "competition_group" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"position" integer NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"confirmed_by_user_id" text NOT NULL,
	CONSTRAINT "competition_group_position_positive" CHECK ("competition_group"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "competition_group_participant" (
	"group_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "competition_group_participant_group_id_participant_id_pk" PRIMARY KEY("group_id","participant_id"),
	CONSTRAINT "competition_group_participant_position_positive" CHECK ("competition_group_participant"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "h2h_draw_participant" (
	"competition_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "h2h_draw_participant_competition_id_participant_id_pk" PRIMARY KEY("competition_id","participant_id"),
	CONSTRAINT "h2h_draw_position_positive" CHECK ("h2h_draw_participant"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "h2h_matchup" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"round_id" text NOT NULL,
	"group_id" text,
	"participant_a_id" text NOT NULL,
	"participant_b_id" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "h2h_matchup_position_positive" CHECK ("h2h_matchup"."position" > 0),
	CONSTRAINT "h2h_matchup_distinct_participants" CHECK ("h2h_matchup"."participant_b_id" is null or "h2h_matchup"."participant_a_id" <> "h2h_matchup"."participant_b_id")
);
--> statement-breakpoint
CREATE TABLE "h2h_phase_configuration" (
	"competition_id" text PRIMARY KEY NOT NULL,
	"league_round_count" integer,
	"qualifier_count" integer,
	"group_size" integer,
	"advancers_per_group" integer,
	"generated_at" timestamp with time zone,
	"generated_by_user_id" text,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by_user_id" text NOT NULL,
	CONSTRAINT "h2h_phase_configuration_shape" CHECK (("h2h_phase_configuration"."league_round_count" is not null and "h2h_phase_configuration"."qualifier_count" in (2,4,8,16) and "h2h_phase_configuration"."group_size" is null and "h2h_phase_configuration"."advancers_per_group" is null) or ("h2h_phase_configuration"."league_round_count" is null and "h2h_phase_configuration"."qualifier_count" is null and "h2h_phase_configuration"."group_size" in (4,8) and "h2h_phase_configuration"."advancers_per_group" in (1,2))),
	CONSTRAINT "h2h_phase_configuration_rounds_positive" CHECK ("h2h_phase_configuration"."league_round_count" is null or "h2h_phase_configuration"."league_round_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" DROP CONSTRAINT "manual_ranking_resolution_scope_shape";--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "competition_group" ADD CONSTRAINT "competition_group_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_group" ADD CONSTRAINT "competition_group_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_group_id_competition_unique" ON "competition_group" USING btree ("id","competition_id");--> statement-breakpoint
ALTER TABLE "competition_group_participant" ADD CONSTRAINT "competition_group_participant_group_fk" FOREIGN KEY ("group_id","competition_id") REFERENCES "public"."competition_group"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_group_participant" ADD CONSTRAINT "competition_group_participant_member_fk" FOREIGN KEY ("participant_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_draw_participant" ADD CONSTRAINT "h2h_draw_participant_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_draw_participant" ADD CONSTRAINT "h2h_draw_participant_competition_fk" FOREIGN KEY ("participant_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_matchup" ADD CONSTRAINT "h2h_matchup_round_competition_fk" FOREIGN KEY ("round_id","competition_id") REFERENCES "public"."round"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_matchup" ADD CONSTRAINT "h2h_matchup_group_competition_fk" FOREIGN KEY ("group_id","competition_id") REFERENCES "public"."competition_group"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_matchup" ADD CONSTRAINT "h2h_matchup_participant_a_fk" FOREIGN KEY ("participant_a_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_matchup" ADD CONSTRAINT "h2h_matchup_participant_b_fk" FOREIGN KEY ("participant_b_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_phase_configuration" ADD CONSTRAINT "h2h_phase_configuration_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_phase_configuration" ADD CONSTRAINT "h2h_phase_configuration_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "h2h_phase_configuration" ADD CONSTRAINT "h2h_phase_configuration_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_group_competition_position_unique" ON "competition_group" USING btree ("competition_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_group_participant_competition_unique" ON "competition_group_participant" USING btree ("competition_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_group_participant_position_unique" ON "competition_group_participant" USING btree ("group_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "h2h_draw_competition_position_unique" ON "h2h_draw_participant" USING btree ("competition_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "h2h_matchup_round_position_unique" ON "h2h_matchup" USING btree ("round_id","position");--> statement-breakpoint
CREATE INDEX "h2h_matchup_competition_round_idx" ON "h2h_matchup" USING btree ("competition_id","round_id");--> statement-breakpoint
CREATE INDEX "h2h_matchup_group_idx" ON "h2h_matchup" USING btree ("group_id","round_id");--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" ADD CONSTRAINT "manual_ranking_resolution_scope_shape" CHECK (("manual_ranking_resolution"."scope"::text = 'LEAGUE_STANDINGS' and "manual_ranking_resolution"."round_id" is null and "manual_ranking_resolution"."group_id" is null) or ("manual_ranking_resolution"."scope"::text = 'ROUND_WINNER' and "manual_ranking_resolution"."round_id" is not null and "manual_ranking_resolution"."group_id" is null) or ("manual_ranking_resolution"."scope"::text = 'H2H_PHASE' and "manual_ranking_resolution"."round_id" is null and "manual_ranking_resolution"."group_id" is null) or ("manual_ranking_resolution"."scope"::text = 'GROUP_STANDINGS' and "manual_ranking_resolution"."round_id" is null and "manual_ranking_resolution"."group_id" is not null));
