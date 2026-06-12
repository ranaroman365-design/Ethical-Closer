ALTER TABLE public.checkout_consent_log
  ADD COLUMN IF NOT EXISTS accepted_no_guarantee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_access_duration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_payment_obligation boolean,
  ADD COLUMN IF NOT EXISTS program_key text,
  ADD COLUMN IF NOT EXISTS program_duration_weeks integer;