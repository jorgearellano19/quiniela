CREATE TYPE "public"."competition_status" AS ENUM('DRAFT', 'STARTED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."competition_type" AS ENUM('LEAGUE', 'LEAGUE_PLAYOFFS', 'GROUP_PLAYOFFS');--> statement-breakpoint
CREATE TABLE "competition" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "competition_type" NOT NULL,
	"status" "competition_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"rules_note" text,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"user_id" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_participant" ADD CONSTRAINT "competition_participant_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_participant" ADD CONSTRAINT "competition_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_creator_idx" ON "competition" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_participant_competition_user_unique" ON "competition_participant" USING btree ("competition_id","user_id");--> statement-breakpoint
CREATE INDEX "competition_participant_user_idx" ON "competition_participant" USING btree ("user_id");