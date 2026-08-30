CREATE TYPE "public"."prize_configuration_event_action" AS ENUM('UPSERTED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "prize_configuration_event" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"type" "prize_type" NOT NULL,
	"action" "prize_configuration_event_action" NOT NULL,
	"before_amount" integer,
	"after_amount" integer,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "prize_configuration_event_shape" CHECK (("prize_configuration_event"."action" = 'UPSERTED' and "prize_configuration_event"."after_amount" > 0) or ("prize_configuration_event"."action" = 'REMOVED' and "prize_configuration_event"."before_amount" > 0 and "prize_configuration_event"."after_amount" is null))
);
--> statement-breakpoint
ALTER TABLE "prize_configuration_event" ADD CONSTRAINT "prize_configuration_event_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_configuration_event" ADD CONSTRAINT "prize_configuration_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prize_configuration_event_competition_time_idx" ON "prize_configuration_event" USING btree ("competition_id","created_at");