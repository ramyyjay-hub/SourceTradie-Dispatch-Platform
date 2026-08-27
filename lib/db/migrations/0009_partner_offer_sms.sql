ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS mobile_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS job_offer_sms_consent_at timestamptz;
