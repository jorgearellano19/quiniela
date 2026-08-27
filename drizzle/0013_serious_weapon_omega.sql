CREATE TYPE "public"."payment_event_action" AS ENUM('RECORDED', 'CORRECTED');--> statement-breakpoint
CREATE TYPE "public"."prize_type" AS ENUM('ROUND_WINNER', 'LEAGUE_WINNER', 'LEAGUE_PHASE_WINNER', 'PLAYOFF_CHAMPION');--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_participant_id" text NOT NULL,
	"amount" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("payment"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"action" "payment_event_action" NOT NULL,
	"before_amount" integer,
	"before_paid_at" timestamp with time zone,
	"after_amount" integer NOT NULL,
	"after_paid_at" timestamp with time zone NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_event_shape_valid" CHECK (("payment_event"."action" = 'RECORDED' and "payment_event"."before_amount" is null and "payment_event"."before_paid_at" is null) or ("payment_event"."action" = 'CORRECTED' and "payment_event"."before_amount" > 0 and "payment_event"."before_paid_at" is not null and ("payment_event"."before_amount" <> "payment_event"."after_amount" or "payment_event"."before_paid_at" <> "payment_event"."after_paid_at"))),
	CONSTRAINT "payment_event_after_amount_positive" CHECK ("payment_event"."after_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_obligation" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"competition_participant_id" text NOT NULL,
	"round_id" text NOT NULL,
	"amount" integer NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_obligation_amount_positive" CHECK ("payment_obligation"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "prize_configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"type" "prize_type" NOT NULL,
	"amount" integer NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "prize_configuration_amount_positive" CHECK ("prize_configuration"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "payments_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "round_fee_amount" integer;--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "maximum_debt" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_participant_id_competition_unique" ON "competition_participant" USING btree ("id","competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_id_competition_unique" ON "round" USING btree ("id","competition_id");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_competition_participant_id_competition_participant_id_fk" FOREIGN KEY ("competition_participant_id") REFERENCES "public"."competition_participant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_obligation" ADD CONSTRAINT "payment_obligation_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_obligation" ADD CONSTRAINT "payment_obligation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_obligation" ADD CONSTRAINT "payment_obligation_participant_competition_fk" FOREIGN KEY ("competition_participant_id","competition_id") REFERENCES "public"."competition_participant"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_obligation" ADD CONSTRAINT "payment_obligation_round_competition_fk" FOREIGN KEY ("round_id","competition_id") REFERENCES "public"."round"("id","competition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_configuration" ADD CONSTRAINT "prize_configuration_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_configuration" ADD CONSTRAINT "prize_configuration_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_participant_paid_at_idx" ON "payment" USING btree ("competition_participant_id","paid_at");--> statement-breakpoint
CREATE INDEX "payment_event_payment_time_idx" ON "payment_event" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_obligation_participant_round_unique" ON "payment_obligation" USING btree ("competition_participant_id","round_id");--> statement-breakpoint
CREATE INDEX "payment_obligation_competition_idx" ON "payment_obligation" USING btree ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prize_configuration_competition_type_unique" ON "prize_configuration" USING btree ("competition_id","type");--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_payment_configuration_valid" CHECK (("competition"."payments_enabled" and "competition"."round_fee_amount" > 0 and ("competition"."maximum_debt" is null or "competition"."maximum_debt" >= 0)) or (not "competition"."payments_enabled" and "competition"."round_fee_amount" is null and "competition"."maximum_debt" is null));
