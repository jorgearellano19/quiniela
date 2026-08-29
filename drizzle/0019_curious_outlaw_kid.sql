CREATE TABLE "playoff_matchup_resolution_event" (
	"id" text PRIMARY KEY NOT NULL,
	"matchup_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"action" text NOT NULL,
	"before_winner_participant_id" text,
	"after_winner_participant_id" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playoff_matchup_resolution_event_action_valid" CHECK ("playoff_matchup_resolution_event"."action" in ('RESOLVED','CORRECTED')),
	CONSTRAINT "playoff_matchup_resolution_event_source_valid" CHECK (length("playoff_matchup_resolution_event"."source_fingerprint") = 64)
);
--> statement-breakpoint
ALTER TABLE "playoff_matchup_resolution_event" ADD CONSTRAINT "playoff_matchup_resolution_event_matchup_id_playoff_matchup_id_fk" FOREIGN KEY ("matchup_id") REFERENCES "public"."playoff_matchup"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matchup_resolution_event" ADD CONSTRAINT "playoff_matchup_resolution_event_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_matchup_resolution_event" ADD CONSTRAINT "playoff_matchup_resolution_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playoff_matchup_resolution_event_matchup_idx" ON "playoff_matchup_resolution_event" USING btree ("matchup_id","created_at");