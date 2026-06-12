-- Rollback safety check used BEFORE any hard-delete cleanup.
-- Returns JSONB:
-- {
--   ok: bool,
--   checked_at: ts,
--   audit: { ran_at, cutoff, age_hours, fresh: bool } | null,
--   tables: [
--     { table, backup_table, backup_exists, backup_rows, live_rows,
--       backup_covers_live, csv_path, csv_exists, csv_size, status, issues:[..] }
--   ],
--   summary: { total, passing, failing }
-- }
CREATE OR REPLACE FUNCTION public.preflight_cleanup_check(
  p_target_tables text[] DEFAULT ARRAY[
    'leads','appointments','calls','call_analysis','call_outcomes',
    'quiz_submissions','quiz_attempts','lead_assignments','lead_events',
    'lead_transitions','wa_messages','wa_conversations','twilio_message_logs',
    'community_messages','direct_messages'
  ],
  p_backup_suffix text DEFAULT '_backup_20260429',
  p_csv_prefix text DEFAULT '2026-04-29/',
  p_max_audit_age_hours int DEFAULT 168  -- 7 days
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin bool;
  v_tbl text;
  v_backup text;
  v_csv text;
  v_backup_exists bool;
  v_backup_rows bigint;
  v_live_rows bigint;
  v_csv_row record;
  v_issues jsonb;
  v_status text;
  v_table_results jsonb := '[]'::jsonb;
  v_audit record;
  v_audit_json jsonb;
  v_audit_fresh bool := false;
  v_audit_age_hours numeric;
  v_passing int := 0;
  v_failing int := 0;
  v_total int := 0;
BEGIN
  -- Hard gate: admin only
  SELECT public.has_role(auth.uid(), 'admin'::app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_admin_only');
  END IF;

  -- Audit freshness
  SELECT ran_at, cutoff INTO v_audit
  FROM public.cleanup_audit
  ORDER BY ran_at DESC
  LIMIT 1;

  IF v_audit.ran_at IS NOT NULL THEN
    v_audit_age_hours := EXTRACT(EPOCH FROM (now() - v_audit.ran_at)) / 3600.0;
    v_audit_fresh := v_audit_age_hours <= p_max_audit_age_hours;
    v_audit_json := jsonb_build_object(
      'ran_at', v_audit.ran_at,
      'cutoff', v_audit.cutoff,
      'age_hours', round(v_audit_age_hours, 2),
      'max_age_hours', p_max_audit_age_hours,
      'fresh', v_audit_fresh
    );
  ELSE
    v_audit_json := NULL;
  END IF;

  -- Per-table checks
  FOREACH v_tbl IN ARRAY p_target_tables LOOP
    v_total := v_total + 1;
    v_backup := v_tbl || p_backup_suffix;
    v_csv := p_csv_prefix || v_tbl || '_pre_cleanup.csv';
    v_issues := '[]'::jsonb;
    v_backup_rows := NULL;
    v_live_rows := NULL;

    -- 1. Backup table exists?
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_backup
    ) INTO v_backup_exists;

    IF NOT v_backup_exists THEN
      v_issues := v_issues || to_jsonb('backup_table_missing'::text);
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', v_backup) INTO v_backup_rows;
    END IF;

    -- 2. Live table row count
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v_tbl) INTO v_live_rows;
    EXCEPTION WHEN OTHERS THEN
      v_live_rows := NULL;
      v_issues := v_issues || to_jsonb(('live_table_unreadable: ' || SQLERRM)::text);
    END;

    -- 3. Backup must cover at least live rows (no silent loss)
    IF v_backup_rows IS NOT NULL AND v_live_rows IS NOT NULL
       AND v_backup_rows < v_live_rows THEN
      v_issues := v_issues || to_jsonb(format(
        'backup_smaller_than_live (%s < %s)', v_backup_rows, v_live_rows
      )::text);
    END IF;

    -- 4. CSV manifest entry
    SELECT name, COALESCE((metadata->>'size')::bigint, 0) AS size
    INTO v_csv_row
    FROM storage.objects
    WHERE bucket_id='cleanup-backups' AND name=v_csv
    LIMIT 1;

    IF v_csv_row.name IS NULL THEN
      v_issues := v_issues || to_jsonb('csv_missing'::text);
    ELSIF v_csv_row.size = 0 THEN
      v_issues := v_issues || to_jsonb('csv_empty'::text);
    END IF;

    v_status := CASE WHEN jsonb_array_length(v_issues)=0 THEN 'pass' ELSE 'fail' END;
    IF v_status='pass' THEN v_passing := v_passing + 1; ELSE v_failing := v_failing + 1; END IF;

    v_table_results := v_table_results || jsonb_build_object(
      'table', v_tbl,
      'backup_table', v_backup,
      'backup_exists', v_backup_exists,
      'backup_rows', v_backup_rows,
      'live_rows', v_live_rows,
      'backup_covers_live', COALESCE(v_backup_rows >= v_live_rows, false),
      'csv_path', v_csv,
      'csv_exists', v_csv_row.name IS NOT NULL,
      'csv_size', COALESCE(v_csv_row.size, 0),
      'status', v_status,
      'issues', v_issues
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (v_failing = 0 AND v_audit_fresh),
    'checked_at', now(),
    'audit', v_audit_json,
    'tables', v_table_results,
    'summary', jsonb_build_object(
      'total', v_total,
      'passing', v_passing,
      'failing', v_failing
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preflight_cleanup_check(text[], text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preflight_cleanup_check(text[], text, text, int) TO authenticated;