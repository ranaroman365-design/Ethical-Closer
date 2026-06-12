
-- Add phone quality fields to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_raw text,
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS phone_valid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_quality_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS phone_quality_reason text;
