ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'awaiting_customer_confirmation' BEFORE 'accepted';

ALTER TABLE "jobs" ADD COLUMN "pricing_rule_code" text;
ALTER TABLE "jobs" ADD COLUMN "pricing_version" text;
ALTER TABLE "jobs" ADD COLUMN "expected_price_kind" text;
ALTER TABLE "jobs" ADD COLUMN "expected_price_min_cents" integer;
ALTER TABLE "jobs" ADD COLUMN "expected_price_max_cents" integer;
ALTER TABLE "jobs" ADD COLUMN "expected_price_label" text;
ALTER TABLE "jobs" ADD COLUMN "expected_price_scope" text;

ALTER TABLE "dispatch_offers" ADD COLUMN "confirmed_price_kind" text;
ALTER TABLE "dispatch_offers" ADD COLUMN "confirmed_price_cents" integer;
ALTER TABLE "dispatch_offers" ADD COLUMN "customer_confirmed_at" timestamp with time zone;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_expected_price_kind_check"
  CHECK ("expected_price_kind" IS NULL OR "expected_price_kind" IN ('total', 'diagnostic'));
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_expected_price_range_check"
  CHECK (
    ("expected_price_min_cents" IS NULL AND "expected_price_max_cents" IS NULL)
    OR (
      "expected_price_min_cents" > 0
      AND "expected_price_max_cents" >= "expected_price_min_cents"
    )
  );
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_confirmed_price_kind_check"
  CHECK ("confirmed_price_kind" IS NULL OR "confirmed_price_kind" IN ('total', 'diagnostic'));
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_confirmed_price_check"
  CHECK ("confirmed_price_cents" IS NULL OR "confirmed_price_cents" > 0);
