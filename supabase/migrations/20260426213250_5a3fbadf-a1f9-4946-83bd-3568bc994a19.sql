-- Reference cases: buyer-ready one-pagers generated from pilot data.
-- Persisted so the verification_hash is auditor-reproducible.
CREATE TABLE public.reference_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Client identity
  client_name TEXT NOT NULL,
  client_industry TEXT,
  client_company_size TEXT,

  -- Pilot window
  pilot_window_start DATE NOT NULL,
  pilot_window_end DATE NOT NULL,
  CONSTRAINT pilot_window_valid CHECK (pilot_window_end >= pilot_window_start),

  -- Buyer-facing summary
  outcome_headline TEXT NOT NULL,

  -- Funnel metrics (the truth being claimed)
  metric_leads_in INTEGER NOT NULL DEFAULT 0,
  metric_calls_booked INTEGER NOT NULL DEFAULT 0,
  metric_calls_held INTEGER NOT NULL DEFAULT 0,
  metric_deals_closed INTEGER NOT NULL DEFAULT 0,
  metric_revenue_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
  metric_close_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Proof
  proof_type TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (proof_type IN ('named_testimonial','anonymized_audit','internal_only')),
  testimonial_quote TEXT,
  testimonial_author TEXT,
  testimonial_role TEXT,
  testimonial_anonymized BOOLEAN NOT NULL DEFAULT false,

  -- Reproducibility
  verification_hash TEXT NOT NULL,

  -- Optional links to source data
  source_partner_profile_id UUID REFERENCES public.partner_profiles(id) ON DELETE SET NULL,
  source_partner_lead_id UUID REFERENCES public.partner_leads(id) ON DELETE SET NULL,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  pdf_generated_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reference_cases_status ON public.reference_cases(status);
CREATE INDEX idx_reference_cases_created_at ON public.reference_cases(created_at DESC);

ALTER TABLE public.reference_cases ENABLE ROW LEVEL SECURITY;

-- Admins only — view
CREATE POLICY "Admins can view reference cases"
ON public.reference_cases FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins only — insert
CREATE POLICY "Admins can create reference cases"
ON public.reference_cases FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins only — update
CREATE POLICY "Admins can update reference cases"
ON public.reference_cases FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins only — delete
CREATE POLICY "Admins can delete reference cases"
ON public.reference_cases FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger (reuse generic helper if present, otherwise inline)
CREATE OR REPLACE FUNCTION public.tg_reference_cases_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reference_cases_set_updated_at
BEFORE UPDATE ON public.reference_cases
FOR EACH ROW EXECUTE FUNCTION public.tg_reference_cases_set_updated_at();