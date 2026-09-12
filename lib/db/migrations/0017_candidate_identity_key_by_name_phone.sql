-- CONSTRAINT/INDEX MIGRATION, not purely additive: this replaces the
-- existing UNIQUE INDEX "candidate_providers_normalized_phone_uidx" on
-- normalized_phone alone. A shared phone number is not sufficient evidence
-- that two differently-named businesses are the same legal/operating entity
-- (e.g. two distinct trading names sharing one office phone line), so the
-- identity key becomes (normalized_business_name, normalized_phone) --
-- normalized (lowercased, punctuation/whitespace-stripped), not raw
-- business_name, so casing/punctuation differences on a future re-import
-- ("Solus Plumbing" vs "solus  plumbing") can't create a duplicate identity.
--
-- Whole migration runs in one transaction: if index creation fails for any
-- reason, the DROP INDEX above it in this same transaction is rolled back
-- too, so Production is never left without a uniqueness guarantee on
-- candidate_providers. At the time this was written, candidate_providers
-- has 0 rows, so the backfill/NOT NULL steps below are no-ops in practice --
-- they're still written correctly for a non-empty table.
BEGIN;

ALTER TABLE "candidate_providers" ADD COLUMN IF NOT EXISTS "normalized_business_name" text;

UPDATE "candidate_providers"
SET "normalized_business_name" = lower(regexp_replace("business_name", '[^a-zA-Z0-9]', '', 'g'))
WHERE "normalized_business_name" IS NULL;

ALTER TABLE "candidate_providers" ALTER COLUMN "normalized_business_name" SET NOT NULL;

DROP INDEX IF EXISTS "candidate_providers_normalized_phone_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_providers_name_phone_uidx" ON "candidate_providers" ("normalized_business_name", "normalized_phone");
CREATE INDEX IF NOT EXISTS "candidate_providers_normalized_phone_idx" ON "candidate_providers" ("normalized_phone");

COMMIT;
