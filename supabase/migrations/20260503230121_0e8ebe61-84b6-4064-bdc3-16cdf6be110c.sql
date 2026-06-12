
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_attempt_count integer NOT NULL DEFAULT 0;
