CREATE TYPE "public"."ranking_resolution_action" AS ENUM('CREATED', 'CORRECTED');--> statement-breakpoint
CREATE TYPE "public"."ranking_resolution_scope" AS ENUM('LEAGUE_STANDINGS', 'ROUND_WINNER');--> statement-breakpoint
CREATE TABLE "manual_ranking_resolution" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"scope" "ranking_resolution_scope" NOT NULL,
	"round_id" text,
	"source_fingerprint" text NOT NULL,
	"tie_fingerprint" text NOT NULL,
	"revision" integer NOT NULL,
	"supersedes_resolution_id" text,
	"action" "ranking_resolution_action" NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "manual_ranking_resolution_scope_shape" CHECK (("manual_ranking_resolution"."scope" = 'LEAGUE_STANDINGS' and "manual_ranking_resolution"."round_id" is null) or ("manual_ranking_resolution"."scope" = 'ROUND_WINNER' and "manual_ranking_resolution"."round_id" is not null)),
	CONSTRAINT "manual_ranking_resolution_revision_positive" CHECK ("manual_ranking_resolution"."revision" > 0),
	CONSTRAINT "manual_ranking_resolution_fingerprints_valid" CHECK (length("manual_ranking_resolution"."source_fingerprint") = 64 and length("manual_ranking_resolution"."tie_fingerprint") = 64),
	CONSTRAINT "manual_ranking_resolution_action_valid" CHECK (("manual_ranking_resolution"."action" = 'CREATED' and "manual_ranking_resolution"."revision" = 1 and "manual_ranking_resolution"."supersedes_resolution_id" is null) or ("manual_ranking_resolution"."action" = 'CORRECTED' and "manual_ranking_resolution"."revision" > 1 and "manual_ranking_resolution"."supersedes_resolution_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "manual_ranking_resolution_entry" (
	"resolution_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "manual_ranking_resolution_entry_resolution_id_participant_id_pk" PRIMARY KEY("resolution_id","participant_id"),
	CONSTRAINT "manual_ranking_resolution_entry_position_positive" CHECK ("manual_ranking_resolution_entry"."position" > 0)
);
--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" ADD CONSTRAINT "manual_ranking_resolution_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" ADD CONSTRAINT "manual_ranking_resolution_round_id_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."round"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" ADD CONSTRAINT "manual_ranking_resolution_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" ADD CONSTRAINT "manual_ranking_resolution_supersedes_fk" FOREIGN KEY ("supersedes_resolution_id") REFERENCES "public"."manual_ranking_resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution_entry" ADD CONSTRAINT "manual_ranking_resolution_entry_resolution_id_manual_ranking_resolution_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."manual_ranking_resolution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution_entry" ADD CONSTRAINT "manual_ranking_resolution_entry_participant_id_competition_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."competition_participant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_ranking_resolution_supersedes_unique" ON "manual_ranking_resolution" USING btree ("supersedes_resolution_id") WHERE "manual_ranking_resolution"."supersedes_resolution_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_ranking_resolution_league_revision_unique" ON "manual_ranking_resolution" USING btree ("competition_id","scope","source_fingerprint","tie_fingerprint","revision") WHERE "manual_ranking_resolution"."round_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_ranking_resolution_round_revision_unique" ON "manual_ranking_resolution" USING btree ("round_id","scope","source_fingerprint","tie_fingerprint","revision") WHERE "manual_ranking_resolution"."round_id" is not null;--> statement-breakpoint
CREATE INDEX "manual_ranking_resolution_scope_idx" ON "manual_ranking_resolution" USING btree ("competition_id","scope","round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_ranking_resolution_entry_position_unique" ON "manual_ranking_resolution_entry" USING btree ("resolution_id","position");