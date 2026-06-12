-- Layer 48.9 — Tone Experiments with Admin Approval Gating

-- 1. Experiments table
CREATE TABLE public.tone_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_key text NOT NULL,
  hypothesis text,
  arms text[] NOT NULL,
  traffic_split jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_sample_per_arm integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'draft',
  auto_promote boolean NOT NULL DEFAULT false,
  winning_arm text,
  created_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tone_experiments_status_check CHECK (status IN
    ('draft','pending_approval','approved','running','paused','completed','rejected','archived')),
  CONSTRAINT tone_experiments_arms_check CHECK (
    array_length(arms,1) BETWEEN 2 AND 4
    AND arms <@ ARRAY['high_performer','uncertain','slow_responder','neutral']::text[]
  )
);

CREATE UNIQUE INDEX uq_tone_experiments_running_per_event
  ON public.tone_experiments (event_key)
  WHERE status IN ('approved','running','paused');

CREATE INDEX idx_tone_experiments_status ON public.tone_experiments (status, event_key);

-- 2. Assignments table (one row per dispatch in an experiment)
CREATE TABLE public.tone_experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.tone_experiments(id) ON DELETE CASCADE,
  dispatch_log_id uuid REFERENCES public.communication_dispatch_log(id) ON DELETE SET NULL,
  lead_id uuid,
  arm text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tone_experiment_assignments_arm_check CHECK (arm IN
    ('high_performer','uncertain','slow_responder','neutral'))
);

CREATE INDEX idx_tone_assignments_experiment ON public.tone_experiment_assignments (experiment_id, arm);
CREATE INDEX idx_tone_assignments_dispatch ON public.tone_experiment_assignments (dispatch_log_id);
CREATE UNIQUE INDEX uq_tone_assignments_dispatch ON public.tone_experiment_assignments (dispatch_log_id)
  WHERE dispatch_log_id IS NOT NULL;

-- 3. Updated-at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_tone_experiments_updated
BEFORE UPDATE ON public.tone_experiments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS
ALTER TABLE public.tone_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tone_experiment_assignments ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user
CREATE POLICY "tone_experiments_read_authenticated"
ON public.tone_experiments FOR SELECT TO authenticated USING (true);

CREATE POLICY "tone_assignments_read_authenticated"
ON public.tone_experiment_assignments FOR SELECT TO authenticated USING (true);

-- Write: admins only (uses existing has_role/app_role pattern)
CREATE POLICY "tone_experiments_admin_insert"
ON public.tone_experiments FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "tone_experiments_admin_update"
ON public.tone_experiments FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "tone_experiments_admin_delete"
ON public.tone_experiments FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Assignments: only system (service role bypasses RLS); authenticated cannot write
-- (no insert/update/delete policies for authenticated)

-- 5. Lifecycle RPCs

CREATE OR REPLACE FUNCTION public.submit_tone_experiment_for_approval(_id uuid)
RETURNS public.tone_experiments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.tone_experiments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.tone_experiments
    SET status = 'pending_approval', submitted_at = now()
    WHERE id = _id AND status IN ('draft','rejected')
    RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'experiment not in draft/rejected state'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.approve_tone_experiment(_id uuid)
RETURNS public.tone_experiments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.tone_experiments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.tone_experiments
    SET status = 'running',
        approved_by = auth.uid(),
        approved_at = now(),
        started_at  = COALESCE(started_at, now())
    WHERE id = _id AND status = 'pending_approval'
    RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'experiment not pending approval'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.reject_tone_experiment(_id uuid, _reason text DEFAULT NULL)
RETURNS public.tone_experiments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.tone_experiments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.tone_experiments
    SET status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), rejection_reason = _reason
    WHERE id = _id AND status = 'pending_approval'
    RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'experiment not pending approval'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.pause_tone_experiment(_id uuid)
RETURNS public.tone_experiments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.tone_experiments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.tone_experiments
    SET status = 'paused', paused_at = now()
    WHERE id = _id AND status = 'running'
    RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'experiment not running'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.complete_tone_experiment(_id uuid, _winning_arm text DEFAULT NULL)
RETURNS public.tone_experiments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.tone_experiments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.tone_experiments
    SET status = 'completed', completed_at = now(), winning_arm = _winning_arm
    WHERE id = _id AND status IN ('running','paused')
    RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'experiment not running/paused'; END IF;
  RETURN r;
END $$;

-- 6. Deterministic arm assignment (hash-based, even split unless traffic_split is set)
CREATE OR REPLACE FUNCTION public.assign_tone_arm(_event_key text, _lead_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  exp public.tone_experiments;
  bucket int;
  chosen text;
BEGIN
  SELECT * INTO exp FROM public.tone_experiments
    WHERE event_key = _event_key AND status = 'running'
    LIMIT 1;
  IF exp.id IS NULL THEN RETURN NULL; END IF;
  bucket := abs(hashtext(COALESCE(_lead_id::text, gen_random_uuid()::text))) % array_length(exp.arms, 1);
  chosen := exp.arms[bucket + 1];
  RETURN chosen;
END $$;

-- 7. Results view (security_invoker so RLS of caller applies)
CREATE OR REPLACE VIEW public.v_tone_experiment_results
WITH (security_invoker = true) AS
SELECT
  e.id                       AS experiment_id,
  e.name                     AS experiment_name,
  e.event_key,
  e.status,
  a.arm,
  count(*)::int              AS sends,
  count(*) FILTER (WHERE l.outcome IN ('replied','clicked','booked','rescheduled','showed','closed'))::int AS engaged,
  count(*) FILTER (WHERE l.outcome IN ('booked','rescheduled'))::int AS booked,
  count(*) FILTER (WHERE l.outcome = 'showed')::int  AS showed,
  count(*) FILTER (WHERE l.outcome = 'closed')::int  AS closed,
  ROUND(
    (count(*) FILTER (WHERE l.outcome IN ('booked','rescheduled','showed','closed'))::numeric
     / NULLIF(count(*),0)) * 100, 2
  ) AS hard_rate_pct
FROM public.tone_experiments e
JOIN public.tone_experiment_assignments a ON a.experiment_id = e.id
LEFT JOIN public.communication_dispatch_log l ON l.id = a.dispatch_log_id
GROUP BY e.id, e.name, e.event_key, e.status, a.arm
ORDER BY e.created_at DESC, a.arm;