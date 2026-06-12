
CREATE TABLE public.sales_brain_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  default_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  pre_call_enabled boolean NOT NULL DEFAULT true,
  post_call_enabled boolean NOT NULL DEFAULT true,
  min_messages_for_profile integer NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.sales_brain_settings (id) VALUES (true);
ALTER TABLE public.sales_brain_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sb_settings_admin_all" ON public.sales_brain_settings
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE TABLE public.lead_sales_profiles (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_key text,
  dominant_personality text,
  dominant_state text,
  responsiveness text,
  urgency text,
  intent_level text,
  conversion_probability numeric,
  risk_tier text,
  objections_raised jsonb NOT NULL DEFAULT '[]'::jsonb,
  conversation_message_count integer NOT NULL DEFAULT 0,
  summary_profile text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_model text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_sales_profiles_funnel ON public.lead_sales_profiles(funnel_key);
CREATE INDEX lead_sales_profiles_prob ON public.lead_sales_profiles(conversion_probability DESC);
ALTER TABLE public.lead_sales_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lsp_read" ON public.lead_sales_profiles
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
    OR (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key))
  );
CREATE POLICY "lsp_admin_write" ON public.lead_sales_profiles
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE TABLE public.pre_call_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_key text,
  personality text,
  state text,
  likely_objections jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_approach text,
  best_opening_line text,
  key_leverage_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  avoid jsonb NOT NULL DEFAULT '[]'::jsonb,
  close_probability numeric,
  confidence numeric,
  generated_model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_by uuid
);
CREATE INDEX pre_call_insights_lead ON public.pre_call_insights(lead_id, generated_at DESC);
ALTER TABLE public.pre_call_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pci_read" ON public.pre_call_insights
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
    OR (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key))
  );
CREATE POLICY "pci_admin_write" ON public.pre_call_insights
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE TABLE public.post_call_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  funnel_key text,
  outcome text,
  objections jsonb NOT NULL DEFAULT '[]'::jsonb,
  sentiment text,
  what_worked jsonb NOT NULL DEFAULT '[]'::jsonb,
  what_failed jsonb NOT NULL DEFAULT '[]'::jsonb,
  improvement_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  pre_call_match_score numeric,
  generated_model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pca_lead ON public.post_call_analyses(lead_id, generated_at DESC);
CREATE INDEX pca_funnel ON public.post_call_analyses(funnel_key, generated_at DESC);
ALTER TABLE public.post_call_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pca_read" ON public.post_call_analyses
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
    OR (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key))
  );
CREATE POLICY "pca_admin_write" ON public.post_call_analyses
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE TABLE public.objection_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_key text,
  personality text,
  objection_type text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  recommended_response text,
  UNIQUE (funnel_key, personality, objection_type)
);
CREATE INDEX objection_intelligence_funnel ON public.objection_intelligence(funnel_key, count DESC);
ALTER TABLE public.objection_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oi_read" ON public.objection_intelligence
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
    OR (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key))
  );
CREATE POLICY "oi_admin_write" ON public.objection_intelligence
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.sales_brain_lead_view(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_latest_insight jsonb;
  v_recent_analyses jsonb;
  v_funnel text;
BEGIN
  SELECT to_jsonb(lsp.*) INTO v_profile
  FROM public.lead_sales_profiles lsp
  WHERE lsp.lead_id = _lead_id;

  v_funnel := COALESCE((v_profile->>'funnel_key'), (SELECT source_funnel FROM public.leads WHERE id = _lead_id));

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
    OR (v_funnel IS NOT NULL AND is_funnel_operator(v_funnel))
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT to_jsonb(pci.*) INTO v_latest_insight
  FROM public.pre_call_insights pci
  WHERE pci.lead_id = _lead_id
  ORDER BY pci.generated_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(pca.*) ORDER BY pca.generated_at DESC), '[]'::jsonb)
    INTO v_recent_analyses
  FROM (
    SELECT * FROM public.post_call_analyses
    WHERE lead_id = _lead_id
    ORDER BY generated_at DESC
    LIMIT 5
  ) pca;

  RETURN jsonb_build_object(
    'profile', COALESCE(v_profile, 'null'::jsonb),
    'latest_insight', COALESCE(v_latest_insight, 'null'::jsonb),
    'recent_analyses', v_recent_analyses,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sales_brain_lead_view(uuid) TO authenticated;
