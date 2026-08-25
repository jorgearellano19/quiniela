CREATE TYPE "public"."competition_participant_event_type" AS ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'REMOVED', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."competition_participant_status" AS ENUM('PENDING', 'ACTIVE', 'REJECTED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "competition_participant_event" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"type" "competition_participant_event_type" NOT NULL,
	"previous_status" "competition_participant_status",
	"next_status" "competition_participant_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "invitation_token_hash" text;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "invitation_invalidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competition_participant" ADD COLUMN "status" "competition_participant_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_participant" ADD COLUMN "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competition_participant" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competition_participant" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_participant" ADD COLUMN "updated_by_user_id" text;--> statement-breakpoint
UPDATE "competition_participant"
SET
	"status" = 'ACTIVE',
	"requested_at" = "created_at",
	"approved_at" = "created_at",
	"status_changed_at" = "created_at",
	"updated_by_user_id" = "user_id";--> statement-breakpoint
ALTER TABLE "competition_participant" ALTER COLUMN "updated_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "competition_participant_event" ADD CONSTRAINT "competition_participant_event_membership_id_competition_participant_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."competition_participant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_participant_event" ADD CONSTRAINT "competition_participant_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_participant_event_membership_idx" ON "competition_participant_event" USING btree ("membership_id","created_at");--> statement-breakpoint
ALTER TABLE "competition_participant" ADD CONSTRAINT "competition_participant_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_invitation_token_hash_unique" ON "competition" USING btree ("invitation_token_hash") WHERE "competition"."invitation_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "competition_participant_competition_status_idx" ON "competition_participant" USING btree ("competition_id","status");
