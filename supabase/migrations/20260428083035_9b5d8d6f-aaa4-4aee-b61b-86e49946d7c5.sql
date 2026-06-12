
CREATE TABLE public.learning_loop_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  ingestion_enabled boolean NOT NULL DEFAULT true,
  auto_approval_enabled boolean NOT NULL DEFAULT false,
  auto_approval_min_confidence numeric NOT NULL DEFAULT 0.85,
  auto_approval_min_sources integer NOT NULL DEFAULT 5,
  default_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.learning_loop_settings (id) VALUES (true);
ALTER TABLE public.learning_loop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lls_admin_all" ON public.learning_loop_settings
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE TABLE public.learning_data_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id text,
  funnel_key text,
  operator_id uuid,
  level_relevance integer NOT NULL DEFAULT 1 CHECK (level_relevance BETWEEN 1 AND 6),
  category text NOT NULL,
  insight_type text,
  anonymized_content text NOT NULL,
  scrubbed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_reference_id uuid,
  performance_metric numeric,
  confidence_score numeric NOT NULL DEFAULT 0.5,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','published','rejected','archived')),
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  proposed_by uuid,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ldp_funnel ON public.learning_data_pool(funnel_key, approval_status);
CREATE INDEX ldp_status ON public.learning_data_pool(approval_status, level_relevance);
CREATE INDEX ldp_category ON public.learning_data_pool(category, approval_status);
ALTER TABLE public.learning_data_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ldp_admin_all" ON public.learning_data_pool
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE POLICY "ldp_l6_read_own_funnel" ON public.learning_data_pool
  FOR SELECT USING (
    funnel_key IS NOT NULL AND is_funnel_operator(funnel_key)
  );

CREATE POLICY "ldp_l6_propose" ON public.learning_data_pool
  FOR INSERT WITH CHECK (
    funnel_key IS NOT NULL
    AND is_funnel_operator(funnel_key)
    AND approval_status = 'pending'
    AND proposed_by = auth.uid()
  );

CREATE POLICY "ldp_student_read_published" ON public.learning_data_pool
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND approval_status = 'published'
  );

CREATE TABLE public.learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_title text NOT NULL,
  insight_summary text NOT NULL,
  category text NOT NULL,
  funnel_key text,
  recommended_level integer CHECK (recommended_level BETWEEN 1 AND 6),
  source_count integer NOT NULL DEFAULT 0,
  supporting_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_application text,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','published','rejected','archived')),
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  generated_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX li_status ON public.learning_insights(approval_status, recommended_level);
CREATE INDEX li_funnel ON public.learning_insights(funnel_key, approval_status);
ALTER TABLE public.learning_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "li_admin_all" ON public.learning_insights
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );
CREATE POLICY "li_l6_read" ON public.learning_insights
  FOR SELECT USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));
CREATE POLICY "li_student_read_published" ON public.learning_insights
  FOR SELECT USING (auth.uid() IS NOT NULL AND approval_status = 'published');

CREATE TABLE public.training_content_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_application text NOT NULL
    CHECK (target_application IN ('script_library','roleplay_trainer','objection_library','call_review','assessment','playbook')),
  target_level integer NOT NULL CHECK (target_level BETWEEN 1 AND 6),
  content_type text NOT NULL,
  proposed_content text NOT NULL,
  reason text,
  supporting_insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  funnel_key text,
  proposed_by uuid,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','published','rejected','archived')),
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tcu_status ON public.training_content_updates(approval_status, target_level, target_application);
ALTER TABLE public.training_content_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tcu_admin_all" ON public.training_content_updates
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'ops_admin'::app_role)
  );
CREATE POLICY "tcu_l6_propose" ON public.training_content_updates
  FOR INSERT WITH CHECK (
    funnel_key IS NOT NULL
    AND is_funnel_operator(funnel_key)
    AND approval_status = 'pending'
    AND proposed_by = auth.uid()
  );
CREATE POLICY "tcu_l6_read_own" ON public.training_content_updates
  FOR SELECT USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));
CREATE POLICY "tcu_student_read_published" ON public.training_content_updates
  FOR SELECT USING (auth.uid() IS NOT NULL AND approval_status = 'published');

-- Approval RPC: admin/owner/ops_admin only.
CREATE OR REPLACE FUNCTION public.approve_learning_pool_entry(_id uuid, _publish boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT (
    has_role(v_actor, 'admin'::app_role)
    OR has_role(v_actor, 'owner'::app_role)
    OR has_role(v_actor, 'ops_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.learning_data_pool
     SET approval_status = CASE WHEN _publish THEN 'published'::text ELSE 'approved'::text END,
         approved_by = v_actor,
         approved_at = now(),
         published_at = CASE WHEN _publish THEN now() ELSE published_at END,
         updated_at = now()
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'id', _id, 'published', _publish);
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_learning_pool_entry(uuid, boolean) TO authenticated;

-- Reject
CREATE OR REPLACE FUNCTION public.reject_learning_pool_entry(_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT (
    has_role(v_actor, 'admin'::app_role)
    OR has_role(v_actor, 'owner'::app_role)
    OR has_role(v_actor, 'ops_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.learning_data_pool
     SET approval_status = 'rejected',
         approved_by = v_actor,
         approved_at = now(),
         rejection_reason = COALESCE(_reason,'no_reason'),
         updated_at = now()
   WHERE id = _id;

  RETURN jsonb_build_object('ok', true, 'id', _id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_learning_pool_entry(uuid, text) TO authenticated;

-- Student-facing safe view: returns only fully-published, level-appropriate content.
CREATE OR REPLACE FUNCTION public.learning_pool_for_student(_max_level integer DEFAULT 1, _category text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', id,
            'category', category,
            'insight_type', insight_type,
            'level_relevance', level_relevance,
            'anonymized_content', anonymized_content,
            'performance_metric', performance_metric,
            'confidence_score', confidence_score,
            'published_at', published_at
         ) ORDER BY published_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.learning_data_pool
   WHERE approval_status = 'published'
     AND level_relevance <= COALESCE(_max_level, 1)
     AND (_category IS NULL OR category = _category)
   LIMIT 200;
  RETURN jsonb_build_object('items', v_rows, 'generated_at', now());
END;
$$;
GRANT EXECUTE ON FUNCTION public.learning_pool_for_student(integer, text) TO authenticated;
