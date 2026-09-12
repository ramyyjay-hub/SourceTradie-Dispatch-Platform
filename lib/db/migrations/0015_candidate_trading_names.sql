ALTER TABLE "candidate_providers" ADD COLUMN IF NOT EXISTS "trading_names" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "candidate_provider_trades" ADD COLUMN IF NOT EXISTS "trading_name" text;
