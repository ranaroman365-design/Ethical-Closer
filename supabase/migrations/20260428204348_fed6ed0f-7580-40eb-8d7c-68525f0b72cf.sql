
-- ============================================================
-- Layer 49: Experimentation OS — self-learning loop (no auto-rollout)
-- ============================================================

-- 1) experiment_learnings -------------------------------------
CREATE TABLE IF NOT EXISTS public.experiment_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  test_key text NOT NULL,
  decision_id uuid REFERENCES public.experiment_decisions(id) ON DELETE SET NULL,
  winning_variant_key text,
  losing_variant_keys text[] NOT NULL DEFAULT '{}',
  learning_summary text NOT NULL,
  primary_metric text NOT NULL,
  primary_metric_lift_pct numeric,
  secondary_metric_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_level text NOT NULL DEFAULT 'directional_signal',
  recommended_next_test text,
  is_negative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS experiment_learnings_test_key_idx ON public.experiment_learnings(test_key);
CREATE INDEX IF NOT EXISTS experiment_learnings_created_at_idx ON public.experiment_learnings(created_at DESC);

ALTER TABLE public.experiment_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learnings_l6_select" ON public.experiment_learnings
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "learnings_l6_insert" ON public.experiment_learnings
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

-- 2) experiment_iteration_queue --------------------------------
CREATE TABLE IF NOT EXISTS public.experiment_iteration_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  parent_test_key text NOT NULL,
  proposed_test_key text NOT NULL,
  proposed_hypothesis text NOT NULL,
  proposed_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text NOT NULL,
  expected_primary_kpi text,
  status text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  launched_at timestamptz,
  CONSTRAINT iter_queue_status_check CHECK (status IN ('proposed','approved','rejected','built','launched'))
);
CREATE INDEX IF NOT EXISTS iter_queue_parent_idx ON public.experiment_iteration_queue(parent_test_key);
CREATE INDEX IF NOT EXISTS iter_queue_status_idx ON public.experiment_iteration_queue(status, created_at DESC);

ALTER TABLE public.experiment_iteration_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iter_queue_l6_select" ON public.experiment_iteration_queue
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "iter_queue_l6_insert" ON public.experiment_iteration_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "iter_queue_l6_update" ON public.experiment_iteration_queue
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

-- 3) landing_page_snapshots ------------------------------------
CREATE TABLE IF NOT EXISTS public.landing_page_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path text NOT NULL DEFAULT '/apply',
  snapshot_type text NOT NULL,
  related_experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  related_test_key text,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT snapshot_type_check CHECK (snapshot_type IN ('experiment_start','winner_declared','iteration_launched','manual'))
);
CREATE INDEX IF NOT EXISTS snapshots_path_idx ON public.landing_page_snapshots(page_path, created_at DESC);

ALTER TABLE public.landing_page_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_l6_select" ON public.landing_page_snapshots
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "snapshots_l6_insert" ON public.landing_page_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

-- 4) Trigger: auto-create learning when decision is logged -----
CREATE OR REPLACE FUNCTION public.fn_auto_create_learning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary text;
  v_negative boolean := false;
  v_next text;
  v_losers text[] := '{}';
BEGIN
  IF NEW.decision IN ('keep_running','extend') THEN
    RETURN NEW;
  END IF;

  -- Collect losing variants from snapshot if present
  IF NEW.metrics_snapshot ? 'variants' THEN
    SELECT COALESCE(array_agg(v->>'variant_key'), '{}')
      INTO v_losers
      FROM jsonb_array_elements(NEW.metrics_snapshot->'variants') v
     WHERE v->>'variant_key' IS DISTINCT FROM NEW.winning_variant_key;
  END IF;

  IF NEW.decision = 'declare_winner' THEN
    v_summary := format('Winner: %s on %s (lift %s%%). Sample: %s.',
      COALESCE(NEW.winning_variant_key,'?'), NEW.primary_kpi,
      COALESCE(round(NEW.lift_pct,1)::text,'n/a'),
      COALESCE(NEW.sample_size_total::text,'?'));
    v_next := format('Iterate on %s pattern — sharpen the winning element and retest against new challenger.', COALESCE(NEW.winning_variant_key,'winner'));
  ELSIF NEW.decision IN ('abandon','rollback') THEN
    v_negative := true;
    v_summary := format('Negative learning on %s: %s. Reason: %s.', NEW.test_key, NEW.decision, NEW.reason);
    v_next := 'Avoid this variant pattern. Test orthogonal hypothesis next.';
  ELSE
    v_summary := format('Decision %s logged on %s.', NEW.decision, NEW.test_key);
  END IF;

  INSERT INTO public.experiment_learnings (
    experiment_id, test_key, decision_id, winning_variant_key, losing_variant_keys,
    learning_summary, primary_metric, primary_metric_lift_pct,
    secondary_metric_notes, confidence_level, recommended_next_test,
    is_negative, created_by
  ) VALUES (
    NEW.experiment_id, NEW.test_key, NEW.id, NEW.winning_variant_key, v_losers,
    v_summary, NEW.primary_kpi, NEW.lift_pct,
    COALESCE(NEW.metrics_snapshot,'{}'::jsonb),
    CASE
      WHEN COALESCE(NEW.sample_size_total,0) >= 600 THEN 'strong_signal'
      WHEN COALESCE(NEW.sample_size_total,0) >= 200 THEN 'directional_signal'
      ELSE 'insufficient_data'
    END,
    v_next, v_negative, NEW.decided_by
  );

  -- Auto-queue next iteration only on declare_winner
  IF NEW.decision = 'declare_winner' AND NEW.winning_variant_key IS NOT NULL THEN
    INSERT INTO public.experiment_iteration_queue (
      parent_experiment_id, parent_test_key, proposed_test_key,
      proposed_hypothesis, proposed_variants, rationale,
      expected_primary_kpi, status, created_by
    ) VALUES (
      NEW.experiment_id, NEW.test_key,
      NEW.test_key || '_v2',
      format('Sharpen the %s pattern that won %s. Test a stronger version against a divergent challenger.', NEW.winning_variant_key, NEW.test_key),
      jsonb_build_array(
        jsonb_build_object('variant_key','control','description', format('Previous winner: %s', NEW.winning_variant_key),'is_control',true),
        jsonb_build_object('variant_key','sharper','description','Sharper / more specific version of winning pattern'),
        jsonb_build_object('variant_key','divergent','description','Orthogonal challenger to test alternative angle')
      ),
      format('Auto-proposed from winning decision on %s. Lift was %s%%.', NEW.test_key, COALESCE(round(NEW.lift_pct,1)::text,'n/a')),
      NEW.primary_kpi, 'proposed', NEW.decided_by
    );

    -- Snapshot at winner_declared
    INSERT INTO public.landing_page_snapshots (
      page_path, snapshot_type, related_experiment_id, related_test_key,
      snapshot_json, created_by
    ) VALUES (
      '/apply', 'winner_declared', NEW.experiment_id, NEW.test_key,
      jsonb_build_object(
        'decision_id', NEW.id,
        'winning_variant_key', NEW.winning_variant_key,
        'lift_pct', NEW.lift_pct,
        'sample_size_total', NEW.sample_size_total,
        'metrics_snapshot', NEW.metrics_snapshot,
        'reason', NEW.reason
      ),
      NEW.decided_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_learning ON public.experiment_decisions;
CREATE TRIGGER trg_auto_create_learning
AFTER INSERT ON public.experiment_decisions
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_create_learning();
