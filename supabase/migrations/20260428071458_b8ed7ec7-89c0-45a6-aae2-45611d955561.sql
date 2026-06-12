-- ============================================================
-- Layer 33 — Operator Control Engine + Layer 26 — Lead Lifecycle
-- Additive only. No existing tables modified.
-- ============================================================

-- Helper: is the current user assigned to this funnel?
CREATE OR REPLACE FUNCTION public.is_funnel_operator(_funnel_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operator_funnel_assignments
    WHERE operator_id = auth.uid() AND funnel_key = _funnel_key
  );
$$;

-- ------------------------------------------------------------
-- 1. Per-funnel feature flags
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.per_funnel_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_key text NOT NULL UNIQUE,
  smart_attendance_enabled boolean NOT NULL DEFAULT false,
  ai_setter_enabled boolean NOT NULL DEFAULT false,
  lead_lifecycle_enabled boolean NOT NULL DEFAULT false,
  level_messaging_enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.per_funnel_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY pfff_admin_all ON public.per_funnel_feature_flags
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY pfff_operator_read ON public.per_funnel_feature_flags
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

CREATE POLICY pfff_operator_update ON public.per_funnel_feature_flags
  FOR UPDATE TO authenticated
  USING (public.is_funnel_operator(funnel_key))
  WITH CHECK (public.is_funnel_operator(funnel_key));

-- ------------------------------------------------------------
-- 2. Next Best Action queue
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_next_best_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  funnel_key text NOT NULL,
  owner_user_id uuid,
  action text NOT NULL CHECK (action IN
    ('send_message','send_booking_link','call_ai_setter','assign_human','wait','escalate')),
  reason text NOT NULL,
  sequence_id uuid,
  confidence numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  run_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','skipped','expired','executed')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lnba_funnel_status ON public.lead_next_best_action(funnel_key, status, run_at);
CREATE INDEX IF NOT EXISTS idx_lnba_lead ON public.lead_next_best_action(lead_id);
ALTER TABLE public.lead_next_best_action ENABLE ROW LEVEL SECURITY;

CREATE POLICY lnba_admin_all ON public.lead_next_best_action
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY lnba_operator_read ON public.lead_next_best_action
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

CREATE POLICY lnba_operator_update ON public.lead_next_best_action
  FOR UPDATE TO authenticated
  USING (public.is_funnel_operator(funnel_key))
  WITH CHECK (public.is_funnel_operator(funnel_key));

-- ------------------------------------------------------------
-- 3. Sequence locks (collision prevention)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_sequence_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  funnel_key text NOT NULL,
  sequence_kind text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  released_at timestamptz,
  UNIQUE (lead_id, sequence_kind)
);
CREATE INDEX IF NOT EXISTS idx_lsl_active ON public.lead_sequence_locks(lead_id) WHERE released_at IS NULL;
ALTER TABLE public.lead_sequence_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY lsl_admin_all ON public.lead_sequence_locks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY lsl_operator_read ON public.lead_sequence_locks
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

-- ------------------------------------------------------------
-- 4. Operator escalations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operator_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_key text NOT NULL,
  lead_id uuid,
  kind text NOT NULL CHECK (kind IN
    ('unknown_reply','delivery_failed','high_value_unbooked','repeated_no_show',
     'ai_uncertainty','consent_missing','capacity_overload')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  detail text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oe_funnel_status ON public.operator_escalations(funnel_key, status, created_at DESC);
ALTER TABLE public.operator_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY oe_admin_all ON public.operator_escalations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY oe_operator_read ON public.operator_escalations
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

CREATE POLICY oe_operator_ack ON public.operator_escalations
  FOR UPDATE TO authenticated
  USING (public.is_funnel_operator(funnel_key))
  WITH CHECK (public.is_funnel_operator(funnel_key));

-- ------------------------------------------------------------
-- 5. Lifecycle touchpoint jobs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lifecycle_touchpoint_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  funnel_key text NOT NULL,
  step_id text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  channel text NOT NULL,
  template_key text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','skipped','failed','cancelled')),
  skipped_reason text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, step_id)
);
CREATE INDEX IF NOT EXISTS idx_ltj_due ON public.lifecycle_touchpoint_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ltj_funnel ON public.lifecycle_touchpoint_jobs(funnel_key, status);
ALTER TABLE public.lifecycle_touchpoint_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ltj_admin_all ON public.lifecycle_touchpoint_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY ltj_operator_read ON public.lifecycle_touchpoint_jobs
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

-- ------------------------------------------------------------
-- 6. Operator control audit log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operator_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  funnel_key text,
  action_kind text NOT NULL,    -- 'flag_toggle' | 'nba_approve' | 'nba_skip' | 'escalation_ack' | 'shutdown'
  target_table text,
  target_id uuid,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oca_actor ON public.operator_control_audit(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oca_funnel ON public.operator_control_audit(funnel_key, created_at DESC);
ALTER TABLE public.operator_control_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY oca_admin_read ON public.operator_control_audit
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY oca_self_read ON public.operator_control_audit
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid());

CREATE POLICY oca_self_insert ON public.operator_control_audit
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ------------------------------------------------------------
-- 7. Read-only cockpit RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operator_control_view(_funnel_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin');
  v_funnels text[];
  v_result jsonb;
BEGIN
  IF v_is_admin THEN
    IF _funnel_key IS NOT NULL THEN
      v_funnels := ARRAY[_funnel_key];
    ELSE
      SELECT ARRAY_AGG(DISTINCT funnel_key) INTO v_funnels FROM public.per_funnel_feature_flags;
    END IF;
  ELSE
    SELECT ARRAY_AGG(funnel_key) INTO v_funnels
    FROM public.operator_funnel_assignments
    WHERE operator_id = auth.uid();
    IF _funnel_key IS NOT NULL AND NOT (_funnel_key = ANY(COALESCE(v_funnels,'{}'))) THEN
      RAISE EXCEPTION 'Forbidden: not assigned to funnel %', _funnel_key USING ERRCODE = '42501';
    END IF;
    IF _funnel_key IS NOT NULL THEN
      v_funnels := ARRAY[_funnel_key];
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'funnels', COALESCE(v_funnels, '{}'),
    'flags', COALESCE((
      SELECT jsonb_agg(to_jsonb(f))
      FROM public.per_funnel_feature_flags f
      WHERE f.funnel_key = ANY(COALESCE(v_funnels,'{}'))
    ), '[]'::jsonb),
    'next_actions', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY n.run_at)
      FROM (
        SELECT * FROM public.lead_next_best_action
        WHERE funnel_key = ANY(COALESCE(v_funnels,'{}'))
          AND status = 'pending'
        ORDER BY run_at ASC
        LIMIT 50
      ) n
    ), '[]'::jsonb),
    'escalations', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC)
      FROM (
        SELECT * FROM public.operator_escalations
        WHERE funnel_key = ANY(COALESCE(v_funnels,'{}'))
          AND status = 'open'
        ORDER BY created_at DESC
        LIMIT 50
      ) e
    ), '[]'::jsonb),
    'active_locks_count', (
      SELECT COUNT(*) FROM public.lead_sequence_locks
      WHERE funnel_key = ANY(COALESCE(v_funnels,'{}'))
        AND released_at IS NULL
    ),
    'is_admin', v_is_admin,
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.operator_control_view(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_funnel_operator(text) TO authenticated;