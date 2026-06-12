-- Add provider attribution to calls so external recording webhooks (Twilio CallSid, Zoom UUID) can match.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_call_id TEXT;

-- Unique per-provider id (partial: ignore NULLs so existing rows are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS calls_provider_call_id_uniq
  ON public.calls (provider, provider_call_id)
  WHERE provider IS NOT NULL AND provider_call_id IS NOT NULL;

-- Lookup index used by webhook functions
CREATE INDEX IF NOT EXISTS calls_provider_call_id_lookup
  ON public.calls (provider_call_id)
  WHERE provider_call_id IS NOT NULL;