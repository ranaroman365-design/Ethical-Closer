-- =========================================================================
-- Traffic-Owner Backfill Batch-Job
-- =========================================================================

-- 1. Job-Tabelle
CREATE TABLE IF NOT EXISTS public.traffic_owner_backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','paused','done','failed','cancelled')),
  only_unset boolean NOT NULL DEFAULT true,
  dry_run boolean NOT NULL DEFAULT false,
  batch_size integer NOT NULL DEFAULT 500 CHECK (batch_size BETWEEN 50 AND 5000),
  total_planned bigint NOT NULL DEFAULT 0,
  processed bigint NOT NULL DEFAULT 0,
  updated bigint NOT NULL DEFAULT 0,
  skipped_ineligible bigint NOT NULL DEFAULT 0,
  unmatched bigint NOT NULL DEFAULT 0,
  last_lead_id uuid,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  last_progress_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_to_backfill_jobs_status_created
  ON public.traffic_owner_backfill_jobs(status, created_at DESC);

ALTER TABLE public.traffic_owner_backfill_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backfill_jobs_admin_select" ON public.traffic_owner_backfill_jobs;
CREATE POLICY "backfill_jobs_admin_select"
ON public.traffic_owner_backfill_jobs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'partner_admin'::app_role)
  OR public.user_has_min_level(auth.uid(), 7)
);

-- Inserts/Updates only via SECURITY DEFINER RPCs (no direct write policy)

-- =========================================================================
-- 2. Authorization helper (inline check)
-- =========================================================================
CREATE OR REPLACE FUNCTION public._tobf_assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'partner_admin'::app_role)
    OR public.user_has_min_level(auth.uid(), 7)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

-- =========================================================================
-- 3. Start a job
-- =========================================================================
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_job_start(
  _only_unset boolean DEFAULT true,
  _dry_run boolean DEFAULT false,
  _batch_size integer DEFAULT 500
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_planned bigint;
BEGIN
  PERFORM public._tobf_assert_admin();

  -- Refuse if a non-finished job already exists
  IF EXISTS (
    SELECT 1 FROM public.traffic_owner_backfill_jobs
    WHERE status IN ('queued','running','paused')
  ) THEN
    RAISE EXCEPTION 'another backfill job is already active – cancel it first';
  END IF;

  -- Plan: count rows that would change AND have an eligible resolved owner
  SELECT COUNT(*)::bigint INTO v_planned
  FROM public.traffic_owner_backfill_resolve(_only_unset)
  WHERE needs_change AND is_eligible;

  INSERT INTO public.traffic_owner_backfill_jobs(
    status, only_unset, dry_run, batch_size,
    total_planned, created_by, started_at, last_progress_at
  )
  VALUES (
    'running', _only_unset, COALESCE(_dry_run,false),
    GREATEST(50, LEAST(COALESCE(_batch_size,500), 5000)),
    v_planned, auth.uid(), now(), now()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

-- =========================================================================
-- 4. Process one batch (cursor-based, idempotent)
--     - Returns the updated job row
--     - Safe to call repeatedly; called by cron and by UI "step now"
-- =========================================================================
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_job_step(
  _job_id uuid DEFAULT NULL
)
RETURNS public.traffic_owner_backfill_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.traffic_owner_backfill_jobs;
  v_batch_updated bigint := 0;
  v_batch_skipped bigint := 0;
  v_batch_seen bigint := 0;
  v_max_lead uuid;
BEGIN
  PERFORM public._tobf_assert_admin();

  -- Pick the job: explicit, otherwise oldest running
  IF _job_id IS NOT NULL THEN
    SELECT * INTO j FROM public.traffic_owner_backfill_jobs WHERE id = _job_id FOR UPDATE;
  ELSE
    SELECT * INTO j FROM public.traffic_owner_backfill_jobs
    WHERE status = 'running'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  IF j.id IS NULL THEN
    RETURN j; -- nothing to do
  END IF;

  IF j.status <> 'running' THEN
    RETURN j;
  END IF;

  BEGIN
    -- Resolve next batch slice from the resolver, ordered by lead_id, after cursor
    WITH slice AS (
      SELECT r.lead_id, r.resolved_owner, r.is_eligible, r.needs_change
      FROM public.traffic_owner_backfill_resolve(j.only_unset) r
      WHERE r.needs_change
        AND (j.last_lead_id IS NULL OR r.lead_id > j.last_lead_id)
      ORDER BY r.lead_id ASC
      LIMIT j.batch_size
    ),
    upd AS (
      UPDATE public.leads l
         SET traffic_owner = s.resolved_owner
        FROM slice s
       WHERE l.id = s.lead_id
         AND s.is_eligible
         AND NOT j.dry_run
      RETURNING l.id
    )
    SELECT
      (SELECT COUNT(*) FROM slice),
      (SELECT COUNT(*) FROM slice WHERE NOT is_eligible),
      (SELECT COUNT(*) FROM upd),
      (SELECT MAX(lead_id) FROM slice)
    INTO v_batch_seen, v_batch_skipped, v_batch_updated, v_max_lead;

    -- For dry_run, "updated" reflects what *would* have been updated
    IF j.dry_run THEN
      v_batch_updated := v_batch_seen - v_batch_skipped;
    END IF;

    UPDATE public.traffic_owner_backfill_jobs
       SET processed = processed + COALESCE(v_batch_seen, 0),
           updated   = updated   + COALESCE(v_batch_updated, 0),
           skipped_ineligible = skipped_ineligible + COALESCE(v_batch_skipped, 0),
           last_lead_id = COALESCE(v_max_lead, last_lead_id),
           last_progress_at = now(),
           status = CASE
             WHEN COALESCE(v_batch_seen, 0) = 0 THEN 'done'
             ELSE 'running'
           END,
           finished_at = CASE
             WHEN COALESCE(v_batch_seen, 0) = 0 THEN now()
             ELSE finished_at
           END
     WHERE id = j.id
     RETURNING * INTO j;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.traffic_owner_backfill_jobs
       SET status = 'failed',
           error_message = SQLERRM,
           finished_at = now(),
           last_progress_at = now()
     WHERE id = j.id
     RETURNING * INTO j;
  END;

  RETURN j;
END;
$$;

-- =========================================================================
-- 5. Cancel a job
-- =========================================================================
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_job_cancel(_job_id uuid)
RETURNS public.traffic_owner_backfill_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.traffic_owner_backfill_jobs;
BEGIN
  PERFORM public._tobf_assert_admin();
  UPDATE public.traffic_owner_backfill_jobs
     SET status = 'cancelled',
         finished_at = now(),
         last_progress_at = now()
   WHERE id = _job_id
     AND status IN ('queued','running','paused')
   RETURNING * INTO j;
  RETURN j;
END;
$$;

-- =========================================================================
-- 6. Status / list
-- =========================================================================
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_job_status(_job_id uuid DEFAULT NULL)
RETURNS public.traffic_owner_backfill_jobs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.traffic_owner_backfill_jobs;
BEGIN
  PERFORM public._tobf_assert_admin();
  IF _job_id IS NULL THEN
    SELECT * INTO j FROM public.traffic_owner_backfill_jobs
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    SELECT * INTO j FROM public.traffic_owner_backfill_jobs WHERE id = _job_id;
  END IF;
  RETURN j;
END;
$$;

CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_job_list(_limit integer DEFAULT 20)
RETURNS SETOF public.traffic_owner_backfill_jobs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._tobf_assert_admin();
  RETURN QUERY
  SELECT * FROM public.traffic_owner_backfill_jobs
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END;
$$;

-- =========================================================================
-- 7. Cron worker — every minute, advance the oldest running job by ONE batch
-- =========================================================================
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_worker_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j_id uuid;
  res public.traffic_owner_backfill_jobs;
BEGIN
  SELECT id INTO j_id
  FROM public.traffic_owner_backfill_jobs
  WHERE status = 'running'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF j_id IS NULL THEN
    RETURN jsonb_build_object('worked', false);
  END IF;

  -- Bypass admin check by calling internal logic via a service role context.
  -- The step function asserts admin via auth.uid(); cron runs without auth.uid(),
  -- so we inline a minimal version here.
  DECLARE
    j public.traffic_owner_backfill_jobs;
    v_batch_seen bigint := 0;
    v_batch_skipped bigint := 0;
    v_batch_updated bigint := 0;
    v_max_lead uuid;
  BEGIN
    SELECT * INTO j FROM public.traffic_owner_backfill_jobs WHERE id = j_id FOR UPDATE;

    WITH slice AS (
      SELECT r.lead_id, r.resolved_owner, r.is_eligible, r.needs_change
      FROM public.traffic_owner_backfill_resolve(j.only_unset) r
      WHERE r.needs_change
        AND (j.last_lead_id IS NULL OR r.lead_id > j.last_lead_id)
      ORDER BY r.lead_id ASC
      LIMIT j.batch_size
    ),
    upd AS (
      UPDATE public.leads l
         SET traffic_owner = s.resolved_owner
        FROM slice s
       WHERE l.id = s.lead_id
         AND s.is_eligible
         AND NOT j.dry_run
      RETURNING l.id
    )
    SELECT
      (SELECT COUNT(*) FROM slice),
      (SELECT COUNT(*) FROM slice WHERE NOT is_eligible),
      (SELECT COUNT(*) FROM upd),
      (SELECT MAX(lead_id) FROM slice)
    INTO v_batch_seen, v_batch_skipped, v_batch_updated, v_max_lead;

    IF j.dry_run THEN
      v_batch_updated := v_batch_seen - v_batch_skipped;
    END IF;

    UPDATE public.traffic_owner_backfill_jobs
       SET processed = processed + COALESCE(v_batch_seen,0),
           updated   = updated   + COALESCE(v_batch_updated,0),
           skipped_ineligible = skipped_ineligible + COALESCE(v_batch_skipped,0),
           last_lead_id = COALESCE(v_max_lead, last_lead_id),
           last_progress_at = now(),
           status = CASE WHEN COALESCE(v_batch_seen,0) = 0 THEN 'done' ELSE 'running' END,
           finished_at = CASE WHEN COALESCE(v_batch_seen,0) = 0 THEN now() ELSE finished_at END
     WHERE id = j.id
     RETURNING * INTO res;

    RETURN jsonb_build_object(
      'worked', true,
      'job_id', res.id,
      'status', res.status,
      'batch_seen', v_batch_seen,
      'batch_updated', v_batch_updated,
      'processed', res.processed,
      'updated', res.updated
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.traffic_owner_backfill_jobs
       SET status = 'failed',
           error_message = SQLERRM,
           finished_at = now(),
           last_progress_at = now()
     WHERE id = j_id;
    RETURN jsonb_build_object('worked', true, 'error', SQLERRM);
  END;
END;
$$;

-- Schedule worker every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('traffic_owner_backfill_worker')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'traffic_owner_backfill_worker');
    PERFORM cron.schedule(
      'traffic_owner_backfill_worker',
      '* * * * *',
      $cron$ SELECT public.traffic_owner_backfill_worker_tick(); $cron$
    );
  END IF;
END $$;

-- =========================================================================
-- 8. Grants
-- =========================================================================
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_job_start(boolean, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_job_step(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_job_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_job_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_job_list(integer) TO authenticated;
