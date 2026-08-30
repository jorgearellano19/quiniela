ALTER TYPE "public"."ranking_resolution_scope" ADD VALUE 'LEAGUE_PHASE_PRIZE' BEFORE 'H2H_PHASE';--> statement-breakpoint
ALTER TABLE "competition" RENAME COLUMN "payments_enabled" TO "financial_features_enabled";--> statement-breakpoint
ALTER TABLE "competition" DROP CONSTRAINT "competition_payment_configuration_valid";--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" DROP CONSTRAINT "manual_ranking_resolution_scope_shape";--> statement-breakpoint
ALTER TABLE "competition" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "competition" c
SET "financial_features_enabled" = true
WHERE EXISTS (
  SELECT 1 FROM "prize_configuration" p WHERE p."competition_id" = c."id"
);--> statement-breakpoint
ALTER TABLE "competition" ADD CONSTRAINT "competition_financial_configuration_valid" CHECK (("competition"."financial_features_enabled" and ("competition"."round_fee_amount" is null or "competition"."round_fee_amount" > 0) and ("competition"."maximum_debt" is null or ("competition"."round_fee_amount" is not null and "competition"."maximum_debt" >= 0))) or (not "competition"."financial_features_enabled" and "competition"."round_fee_amount" is null and "competition"."maximum_debt" is null));--> statement-breakpoint
ALTER TABLE "manual_ranking_resolution" ADD CONSTRAINT "manual_ranking_resolution_scope_shape" CHECK (("manual_ranking_resolution"."scope"::text in ('LEAGUE_STANDINGS', 'LEAGUE_PHASE_PRIZE') and "manual_ranking_resolution"."round_id" is null and "manual_ranking_resolution"."group_id" is null) or ("manual_ranking_resolution"."scope"::text = 'ROUND_WINNER' and "manual_ranking_resolution"."round_id" is not null and "manual_ranking_resolution"."group_id" is null) or ("manual_ranking_resolution"."scope"::text = 'H2H_PHASE' and "manual_ranking_resolution"."round_id" is null and "manual_ranking_resolution"."group_id" is null) or ("manual_ranking_resolution"."scope"::text = 'GROUP_STANDINGS' and "manual_ranking_resolution"."round_id" is null and "manual_ranking_resolution"."group_id" is not null));
