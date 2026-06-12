CREATE TABLE IF NOT EXISTS public.utm_mapping_conflict_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utm_campaign text NOT NULL,
  utm_source text,
  utm_source_key text GENERATED ALWAYS AS (COALESCE(utm_source, '')) STORED,
  conflict_type text NOT NULL CHECK (conflict_type IN ('multi_pattern','multi_owner','ineligible_owner','ambiguous_tiebreak')),
  severity text NOT NULL CHECK (severity IN ('info','warn','critical')) DEFAULT 'warn',
  matched_mapping_ids uuid[] NOT NULL DEFAULT '{}',
  matched_patterns text[] NOT NULL DEFAULT '{}',
  matched_owner_ids uuid[] NOT NULL DEFAULT '{}',
  chosen_mapping_id uuid,
  chosen_pattern text,
  chosen_owner_id uuid,
  hit_count bigint NOT NULL DEFAULT 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  detection_window_days int NOT NULL DEFAULT 30,
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_on date GENERATED ALWAYS AS ((detected_at AT TIME ZONE 'UTC')::date) STORED,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_utm_conflict_open
  ON public.utm_mapping_conflict_log (utm_campaign, utm_source_key, conflict_type, detected_on)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_utm_conflict_open
  ON public.utm_mapping_conflict_log (severity, detected_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.utm_mapping_conflict_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "utm_conflict_log_governed_read" ON public.utm_mapping_conflict_log;
CREATE POLICY "utm_conflict_log_governed_read"
ON public.utm_mapping_conflict_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'partner_admin'::app_role)
  OR public.user_has_min_level(auth.uid(), 7)
);

CREATE OR REPLACE FUNCTION public.utm_mapping_conflict_log_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_utm_conflict_touch ON public.utm_mapping_conflict_log;
CREATE TRIGGER trg_utm_conflict_touch
BEFORE UPDATE ON public.utm_mapping_conflict_log
FOR EACH ROW EXECUTE FUNCTION public.utm_mapping_conflict_log_touch();

CREATE OR REPLACE FUNCTION public.utm_detect_mapping_conflicts(_days int DEFAULT 30)
RETURNS TABLE (
  inserted int,
  refreshed int,
  conflicts_total int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_refreshed int := 0;
  v_total int := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'partner_admin'::app_role)
    OR public.user_has_min_level(auth.uid(), 7)
  ) THEN
    RAISE EXCEPTION 'not authorized to run conflict detection';
  END IF;

  WITH base AS (
    SELECT
      COALESCE(NULLIF(la.utm_source, ''), '(none)')   AS utm_source,
      COALESCE(NULLIF(la.utm_campaign, ''), '(none)') AS utm_campaign,
      COUNT(*) AS hit_count,
      MIN(la.created_at) AS first_seen,
      MAX(la.created_at) AS last_seen
    FROM public.lead_attribution la
    WHERE la.created_at >= now() - make_interval(days => _days)
    GROUP BY 1, 2
  ),
  matches AS (
    SELECT
      b.utm_source,
      b.utm_campaign,
      b.hit_count,
      b.first_seen,
      b.last_seen,
      array_agg(m.id ORDER BY length(COALESCE(m.utm_campaign_pattern, m.utm_campaign)) DESC, m.created_at) AS mapping_ids,
      array_agg(COALESCE(m.utm_campaign_pattern, m.utm_campaign) ORDER BY length(COALESCE(m.utm_campaign_pattern, m.utm_campaign)) DESC, m.created_at) AS patterns,
      array_agg(m.owner_user_id ORDER BY length(COALESCE(m.utm_campaign_pattern, m.utm_campaign)) DESC, m.created_at) AS owner_ids,
      COUNT(*) AS pattern_count,
      COUNT(DISTINCT m.owner_user_id) AS distinct_owner_count,
      bool_or(NOT public.is_eligible_traffic_owner(m.owner_user_id)) AS has_ineligible
    FROM base b
    JOIN public.traffic_owner_mappings m
      ON m.is_active
     AND b.utm_campaign ILIKE replace(COALESCE(m.utm_campaign_pattern, m.utm_campaign), '*', '%')
     AND (m.utm_source IS NULL OR m.utm_source = '' OR m.utm_source = b.utm_source)
    GROUP BY b.utm_source, b.utm_campaign, b.hit_count, b.first_seen, b.last_seen
  ),
  classified AS (
    SELECT
      mt.*,
      CASE
        WHEN mt.distinct_owner_count > 1 THEN 'multi_owner'
        WHEN mt.pattern_count > 1
             AND length(mt.patterns[1]) = length(mt.patterns[2]) THEN 'ambiguous_tiebreak'
        WHEN mt.pattern_count > 1 THEN 'multi_pattern'
        WHEN mt.has_ineligible THEN 'ineligible_owner'
      END AS conflict_type,
      CASE
        WHEN mt.distinct_owner_count > 1 THEN 'critical'
        WHEN mt.pattern_count > 1
             AND length(mt.patterns[1]) = length(mt.patterns[2]) THEN 'critical'
        WHEN mt.has_ineligible THEN 'critical'
        WHEN mt.pattern_count > 1 THEN 'warn'
        ELSE 'info'
      END AS severity
    FROM matches mt
    WHERE mt.pattern_count > 1 OR mt.has_ineligible
  ),
  upserted AS (
    INSERT INTO public.utm_mapping_conflict_log (
      utm_campaign, utm_source, conflict_type, severity,
      matched_mapping_ids, matched_patterns, matched_owner_ids,
      chosen_mapping_id, chosen_pattern, chosen_owner_id,
      hit_count, first_seen_at, last_seen_at, detection_window_days
    )
    SELECT
      c.utm_campaign,
      NULLIF(c.utm_source, '(none)'),
      c.conflict_type,
      c.severity,
      c.mapping_ids,
      c.patterns,
      c.owner_ids,
      c.mapping_ids[1],
      c.patterns[1],
      c.owner_ids[1],
      c.hit_count,
      c.first_seen,
      c.last_seen,
      _days
    FROM classified c
    WHERE c.conflict_type IS NOT NULL
    ON CONFLICT (utm_campaign, utm_source_key, conflict_type, detected_on)
    WHERE resolved_at IS NULL
    DO UPDATE SET
      severity            = EXCLUDED.severity,
      matched_mapping_ids = EXCLUDED.matched_mapping_ids,
      matched_patterns    = EXCLUDED.matched_patterns,
      matched_owner_ids   = EXCLUDED.matched_owner_ids,
      chosen_mapping_id   = EXCLUDED.chosen_mapping_id,
      chosen_pattern      = EXCLUDED.chosen_pattern,
      chosen_owner_id     = EXCLUDED.chosen_owner_id,
      hit_count           = EXCLUDED.hit_count,
      first_seen_at       = LEAST(public.utm_mapping_conflict_log.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at        = GREATEST(public.utm_mapping_conflict_log.last_seen_at, EXCLUDED.last_seen_at),
      updated_at          = now()
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    COUNT(*) FILTER (WHERE was_insert)::int,
    COUNT(*) FILTER (WHERE NOT was_insert)::int,
    COUNT(*)::int
  INTO v_inserted, v_refreshed, v_total
  FROM upserted;

  inserted := v_inserted;
  refreshed := v_refreshed;
  conflicts_total := v_total;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.utm_mapping_conflict_list(
  _only_open boolean DEFAULT true,
  _limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  utm_campaign text,
  utm_source text,
  conflict_type text,
  severity text,
  matched_mapping_ids uuid[],
  matched_patterns text[],
  matched_owner_ids uuid[],
  chosen_pattern text,
  chosen_owner_id uuid,
  chosen_owner_name text,
  chosen_owner_email text,
  chosen_owner_level int,
  hit_count bigint,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  detected_at timestamptz,
  resolved_at timestamptz,
  resolution_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.utm_campaign,
    l.utm_source,
    l.conflict_type,
    l.severity,
    l.matched_mapping_ids,
    l.matched_patterns,
    l.matched_owner_ids,
    l.chosen_pattern,
    l.chosen_owner_id,
    p.full_name,
    p.email,
    COALESCE(uls.current_level, 0)::int,
    l.hit_count,
    l.first_seen_at,
    l.last_seen_at,
    l.detected_at,
    l.resolved_at,
    l.resolution_note
  FROM public.utm_mapping_conflict_log l
  LEFT JOIN public.profiles p ON p.id = l.chosen_owner_id
  LEFT JOIN public.user_level_status uls ON uls.user_id = l.chosen_owner_id
  WHERE (NOT _only_open OR l.resolved_at IS NULL)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'partner_admin'::app_role)
      OR public.user_has_min_level(auth.uid(), 7)
    )
  ORDER BY
    CASE l.severity WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
    l.hit_count DESC,
    l.detected_at DESC
  LIMIT GREATEST(1, COALESCE(_limit, 200));
$$;

CREATE OR REPLACE FUNCTION public.utm_mapping_conflict_resolve(
  _id uuid,
  _note text DEFAULT NULL
)
RETURNS boolean
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
    RAISE EXCEPTION 'not authorized to resolve mapping conflicts';
  END IF;

  UPDATE public.utm_mapping_conflict_log
     SET resolved_at = now(),
         resolved_by = auth.uid(),
         resolution_note = _note
   WHERE id = _id AND resolved_at IS NULL;

  RETURN FOUND;
END;
$$;

GRANT SELECT ON public.utm_mapping_conflict_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.utm_detect_mapping_conflicts(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.utm_mapping_conflict_list(boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.utm_mapping_conflict_resolve(uuid, text) TO authenticated;