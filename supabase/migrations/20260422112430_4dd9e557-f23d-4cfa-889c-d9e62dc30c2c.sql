
-- Retargeting state on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quiz_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retargeting_state JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_leads_quiz_completed_no_booking
  ON public.leads (quiz_completed_at) WHERE has_booking = false AND quiz_completed_at IS NOT NULL;

-- Upsell offers table
CREATE TABLE IF NOT EXISTS public.upsell_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  offer_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, offer_key)
);

CREATE INDEX IF NOT EXISTS idx_upsell_offers_user_active
  ON public.upsell_offers (user_id, expires_at) WHERE claimed = false;

ALTER TABLE public.upsell_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own upsell offers" ON public.upsell_offers;
CREATE POLICY "Users view own upsell offers"
  ON public.upsell_offers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own upsell claim" ON public.upsell_offers;
CREATE POLICY "Users update own upsell claim"
  ON public.upsell_offers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
