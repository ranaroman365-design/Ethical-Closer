-- Public B2B partner inbound leads (companies asking for setter/closer pilots)
CREATE TABLE public.partner_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  website TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  industry TEXT,
  monthly_leads INTEGER,
  monthly_booked_calls INTEGER,
  avg_offer_price NUMERIC,
  current_close_rate NUMERIC,
  need TEXT,
  preferred_model TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'partnerunternehmen_landingpage',
  status TEXT NOT NULL DEFAULT 'new',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  admin_notes TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_leads_email ON public.partner_leads (lower(email));
CREATE INDEX idx_partner_leads_created_at ON public.partner_leads (created_at DESC);
CREATE INDEX idx_partner_leads_status ON public.partner_leads (status);

ALTER TABLE public.partner_leads ENABLE ROW LEVEL SECURITY;

-- Public can submit (anonymous form)
CREATE POLICY "Anyone can submit a partner lead"
ON public.partner_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can view
CREATE POLICY "Admins can view all partner leads"
ON public.partner_leads
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update
CREATE POLICY "Admins can update partner leads"
ON public.partner_leads
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete
CREATE POLICY "Admins can delete partner leads"
ON public.partner_leads
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER trg_partner_leads_updated_at
BEFORE UPDATE ON public.partner_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();