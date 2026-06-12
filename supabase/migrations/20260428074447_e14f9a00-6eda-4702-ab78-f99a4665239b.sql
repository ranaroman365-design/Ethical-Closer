ALTER TABLE public.self_optimization_settings
  ADD COLUMN IF NOT EXISTS autonomy_config jsonb NOT NULL DEFAULT jsonb_build_object(
    'max_traffic_shift_pct_per_cycle', 20,
    'max_timing_shift_minutes', 5,
    'max_timing_shift_hours', 1,
    'max_timing_shift_days', 1,
    'min_sample_size', 100,
    'min_confidence', 0.85,
    'max_messages_per_24h', 3,
    'max_calls_per_lead', 3,
    'quiet_hours_start', '21:00',
    'quiet_hours_end', '08:00',
    'l6_may_enable_autonomous', false
  ),
  ADD COLUMN IF NOT EXISTS auto_rollback_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_rollback_triggers jsonb NOT NULL DEFAULT jsonb_build_object(
    'conversion_drop_pct', 15,
    'unsubscribe_spike_pct', 10,
    'failed_send_spike_pct', 25,
    'noshow_increase_pct', 10,
    'negative_reply_spike_pct', 15
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'self_optimization_settings_mode_check') THEN
    ALTER TABLE public.self_optimization_settings DROP CONSTRAINT self_optimization_settings_mode_check;
  END IF;
END $$;

ALTER TABLE public.self_optimization_settings
  ADD CONSTRAINT self_optimization_settings_mode_check
  CHECK (mode IN ('passive','assisted','autonomous'));

ALTER TABLE public.self_optimization_proposals
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS auto_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS measurement_window_h integer,
  ADD COLUMN IF NOT EXISTS measurement_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS measurement_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS measured_at timestamptz,
  ADD COLUMN IF NOT EXISTS baseline_metric numeric,
  ADD COLUMN IF NOT EXISTS observed_metric numeric,
  ADD COLUMN IF NOT EXISTS actual_impact_pct numeric,
  ADD COLUMN IF NOT EXISTS verdict text CHECK (verdict IN ('successful','neutral','failed','pending')),
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_by uuid,
  ADD COLUMN IF NOT EXISTS rollback_reason text,
  ADD COLUMN IF NOT EXISTS risk_score integer;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'self_optimization_proposals_status_check') THEN
    ALTER TABLE public.self_optimization_proposals DROP CONSTRAINT self_optimization_proposals_status_check;
  END IF;
END $$;

ALTER TABLE public.self_optimization_proposals
  ADD CONSTRAINT self_optimization_proposals_status_check
  CHECK (status IN ('pending','approved','rejected','applied','expired','auto_applied','rolled_back'));

CREATE TABLE IF NOT EXISTS public.per_funnel_autonomy_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_key text NOT NULL,
  module text NOT NULL,
  mode text NOT NULL DEFAULT 'passive' CHECK (mode IN ('passive','assisted','autonomous')),
  enabled_by uuid,
  enabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_key, module)
);

CREATE INDEX IF NOT EXISTS idx_pfam_funnel ON public.per_funnel_autonomy_modes(funnel_key);

ALTER TABLE public.per_funnel_autonomy_modes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pfam_admin_all" ON public.per_funnel_autonomy_modes;
CREATE POLICY "pfam_admin_all" ON public.per_funnel_autonomy_modes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

DROP POLICY IF EXISTS "pfam_l6_read" ON public.per_funnel_autonomy_modes;
CREATE POLICY "pfam_l6_read" ON public.per_funnel_autonomy_modes
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

DROP POLICY IF EXISTS "pfam_l6_update_own_funnel" ON public.per_funnel_autonomy_modes;
CREATE POLICY "pfam_l6_update_own_funnel" ON public.per_funnel_autonomy_modes
  FOR UPDATE TO authenticated
  USING (public.is_funnel_operator(funnel_key))
  WITH CHECK (public.is_funnel_operator(funnel_key));

CREATE OR REPLACE FUNCTION public.self_opt_rollback_proposal(
  _proposal_id uuid,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.self_optimization_proposals%ROWTYPE;
  _can boolean;
BEGIN
  SELECT * INTO _row FROM public.self_optimization_proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;

  _can := public.has_role(auth.uid(),'admin')
       OR public.has_role(auth.uid(),'owner')
       OR public.has_role(auth.uid(),'ops_admin')
       OR (_row.funnel_key IS NOT NULL AND public.is_funnel_operator(_row.funnel_key));
  IF NOT _can THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _row.status = 'rolled_back' THEN
    RAISE EXCEPTION 'already_rolled_back';
  END IF;

  UPDATE public.self_optimization_proposals
     SET status = 'rolled_back',
         rolled_back_at = now(),
         rolled_back_by = auth.uid(),
         rollback_reason = _reason
   WHERE id = _proposal_id;

  INSERT INTO public.self_optimization_logs(proposal_id, rule_id, event, funnel_key, what_changed, why, actor)
  VALUES (_proposal_id, _row.rule_id, 'rolled_back', _row.funnel_key,
          COALESCE(_row.rationale, 'Proposal rolled back'),
          _reason, auth.uid());

  INSERT INTO public.change_audit_log(changed_by_kind, changed_by, change_type, scope_type, scope_id,
                                       module, previous_state, new_state, reason, reversible, risk_level)
  VALUES (CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'operator' END,
          auth.uid(), 'rollback', 'funnel', _row.funnel_key, 'self_optimization',
          _row.after_state, _row.before_state, _reason, false, 'medium');

  RETURN _proposal_id;
END $$;

GRANT EXECUTE ON FUNCTION public.self_opt_rollback_proposal(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.self_opt_effective_mode(
  _funnel_key text,
  _module text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _global_mode text;
  _per_mode text;
  _enabled boolean;
BEGIN
  SELECT mode, enabled INTO _global_mode, _enabled
    FROM public.self_optimization_settings ORDER BY created_at LIMIT 1;
  IF NOT COALESCE(_enabled, false) THEN RETURN 'passive'; END IF;

  SELECT mode INTO _per_mode
    FROM public.per_funnel_autonomy_modes
    WHERE funnel_key = _funnel_key AND module = _module;

  IF _per_mode IS NULL THEN RETURN _global_mode; END IF;
  IF _global_mode = 'passive' THEN RETURN 'passive'; END IF;
  IF _global_mode = 'assisted' AND _per_mode = 'autonomous' THEN RETURN 'assisted'; END IF;
  RETURN _per_mode;
END $$;

GRANT EXECUTE ON FUNCTION public.self_opt_effective_mode(text, text) TO authenticated;