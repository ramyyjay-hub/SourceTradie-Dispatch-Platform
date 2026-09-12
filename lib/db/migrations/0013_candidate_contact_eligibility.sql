ALTER TABLE "candidate_providers" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "candidate_providers" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamptz;
ALTER TABLE "candidate_providers" ADD COLUMN IF NOT EXISTS "contact_eligibility" text NOT NULL DEFAULT 'manual_only';

CREATE INDEX IF NOT EXISTS "candidate_providers_contact_eligibility_idx" ON "candidate_providers" ("contact_eligibility");
