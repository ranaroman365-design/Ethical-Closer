
-- V11: TENANT BRANDING
CREATE TABLE public.tenant_branding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  accent_color TEXT DEFAULT '#f59e0b',
  custom_domain TEXT,
  custom_product_name TEXT,
  custom_footer_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view branding"
  ON public.tenant_branding FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = tenant_branding.tenant_id)
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Tenant owner can manage branding"
  ON public.tenant_branding FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_branding.tenant_id AND t.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_branding.tenant_id AND t.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'owner')
  );

-- V11: TENANT REVENUE
CREATE TABLE public.tenant_revenue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  platform_cut_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  platform_cut NUMERIC(12,2) NOT NULL DEFAULT 0,
  partner_cut NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  total_closed INTEGER DEFAULT 0,
  show_rate NUMERIC(5,2) DEFAULT 0,
  close_rate NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant/platform owner can view revenue"
  ON public.tenant_revenue FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_revenue.tenant_id AND t.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Platform owner can manage revenue"
  ON public.tenant_revenue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- V12: GDPR CONSENT
CREATE TABLE public.user_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL,
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT NOT NULL DEFAULT '1.0',
  legal_basis TEXT NOT NULL DEFAULT 'consent',
  ip_address TEXT,
  user_agent TEXT,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own consents"
  ON public.user_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users create own consents"
  ON public.user_consents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- V12: LEGAL AGREEMENTS
CREATE TABLE public.legal_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  tenant_id UUID REFERENCES public.tenants(id),
  agreement_type TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.legal_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own agreements"
  ON public.legal_agreements FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users create own agreements"
  ON public.legal_agreements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- V12: DATA RETENTION
CREATE TABLE public.data_retention_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_category TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 365,
  action_on_expiry TEXT NOT NULL DEFAULT 'anonymize',
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view retention policies"
  ON public.data_retention_policies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owner manages retention policies"
  ON public.data_retention_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

INSERT INTO public.data_retention_policies (data_category, retention_days, action_on_expiry, description) VALUES
  ('leads', 730, 'anonymize', 'Lead-Daten nach 24 Monaten anonymisieren'),
  ('event_logs', 365, 'delete', 'Event-Logs nach 12 Monaten löschen'),
  ('audit_logs', 1825, 'archive', 'Audit-Logs 5 Jahre aufbewahren'),
  ('user_consents', 3650, 'archive', 'Consent-Records 10 Jahre aufbewahren'),
  ('calls', 365, 'anonymize', 'Call-Daten nach 12 Monaten anonymisieren');
