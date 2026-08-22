ALTER TABLE "dispatch_offers"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_offers_one_active_per_job_uidx"
ON "dispatch_offers" ("job_id")
WHERE "state" IN ('pending', 'accepted');
