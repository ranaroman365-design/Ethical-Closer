
-- Add WhatsApp response tracking fields to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_ping_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_ping_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_unresponsive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_engaged boolean NOT NULL DEFAULT false;

-- Add index for filtering unresponsive/confirmed leads
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_status 
  ON public.leads (whatsapp_confirmed, whatsapp_unresponsive) 
  WHERE whatsapp_ping_sent = true;
