
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_recovery_state JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_leads_payment_at_risk
  ON public.leads (updated_at)
  WHERE payment_status = 'at_risk';
