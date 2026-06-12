CREATE TABLE IF NOT EXISTS public.checkout_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_token text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id uuid,
  email text,

  -- Versions accepted
  terms_version text NOT NULL,
  refund_version text NOT NULL,
  privacy_version text NOT NULL,

  -- Individual checkbox states (all must be true to allow payment)
  accepted_terms boolean NOT NULL,
  accepted_refund boolean NOT NULL,
  accepted_waiver boolean NOT NULL,

  -- Audit context
  policy_snapshot jsonb,
  ip_address text,
  user_agent text,
  locale text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_consent_log_token ON public.checkout_consent_log(payment_token);
CREATE INDEX IF NOT EXISTS idx_checkout_consent_log_lead ON public.checkout_consent_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_checkout_consent_log_created ON public.checkout_consent_log(created_at DESC);

ALTER TABLE public.checkout_consent_log ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous checkout visitors) can record their own consent
CREATE POLICY "checkout_consent_log_insert_public"
ON public.checkout_consent_log
FOR INSERT
TO anon, authenticated
WITH CHECK (
  accepted_terms = true
  AND accepted_refund = true
  AND accepted_waiver = true
);

-- Only admins can read consent logs for audit/compliance
CREATE POLICY "checkout_consent_log_select_admin"
ON public.checkout_consent_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Append-only: no updates, no deletes (enforced by absence of policies)