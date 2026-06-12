CREATE TABLE IF NOT EXISTS public.auto_fix_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_key text,
  scope_label text,
  stage_key text NOT NULL CHECK (stage_key IN (
    'traffic','landing','engagement','booking','setter','showing','closer','offer','revenue'
  )),
  problem_class text NOT NULL CHECK (problem_class IN (
    'traffic_quality','landing','engagement','booking','setter','showing','closer','offer'
  )),
  severity text NOT NULL CHECK (severity IN ('weak','critical')),
  metric_key text NOT NULL,
  metric_value numeric NOT NULL,
  metric_threshold numeric NOT NULL,
  impact_score int NOT NULL CHECK (impact_score BETWEEN 0 AND 100),
  effort_score int NOT NULL CHECK (effort_score BETWEEN 0 AND 100),
  priority_rank int NOT NULL,
  problem_label text NOT NULL,
  problem_explanation text NOT NULL,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  deep_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','in_progress','done','dismissed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  self_opt_proposal_id uuid,
  baseline_metric numeric,
  current_metric numeric,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text GENERATED ALWAYS AS (
    coalesce(funnel_key,'_global_') || ':' || stage_key || ':' || metric_key
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS auto_fix_queue_open_dedupe
  ON public.auto_fix_queue(dedupe_key)
  WHERE status IN ('open','acknowledged','in_progress');

CREATE INDEX IF NOT EXISTS auto_fix_queue_status_priority
  ON public.auto_fix_queue(status, priority_rank);

CREATE INDEX IF NOT EXISTS auto_fix_queue_funnel
  ON public.auto_fix_queue(funnel_key);

ALTER TABLE public.auto_fix_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_fix_queue admin all"
  ON public.auto_fix_queue
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'ops_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'ops_admin'::app_role)
  );

CREATE POLICY "auto_fix_queue operator read"
  ON public.auto_fix_queue
  FOR SELECT
  TO authenticated
  USING (
    funnel_key IS NOT NULL
    AND public.is_funnel_operator(funnel_key)
  );

CREATE POLICY "auto_fix_queue operator update"
  ON public.auto_fix_queue
  FOR UPDATE
  TO authenticated
  USING (
    funnel_key IS NOT NULL
    AND public.is_funnel_operator(funnel_key)
  )
  WITH CHECK (
    funnel_key IS NOT NULL
    AND public.is_funnel_operator(funnel_key)
  );

CREATE OR REPLACE FUNCTION public.tg_auto_fix_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'done' AND OLD.status <> 'done' THEN
    NEW.resolved_at = COALESCE(NEW.resolved_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_fix_queue_updated_at ON public.auto_fix_queue;
CREATE TRIGGER auto_fix_queue_updated_at
  BEFORE UPDATE ON public.auto_fix_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auto_fix_queue_updated_at();