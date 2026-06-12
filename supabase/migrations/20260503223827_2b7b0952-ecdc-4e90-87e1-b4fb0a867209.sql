-- Drop bad tables (created referencing wrong partner_profiles)
DROP TABLE IF EXISTS direct_contacts CASCADE;
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS job_offers CASCADE;

-- Add min_tier to tc_job_offers if missing
ALTER TABLE tc_job_offers ADD COLUMN IF NOT EXISTS min_tier TEXT DEFAULT 'bronze'
  CHECK (min_tier IN ('bronze','silver','gold','platinum','black'));