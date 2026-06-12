-- 0. Conflict-type enum erweitern
ALTER TABLE public.utm_mapping_conflict_log
  DROP CONSTRAINT IF EXISTS utm_mapping_conflict_log_conflict_type_check;
ALTER TABLE public.utm_mapping_conflict_log
  ADD CONSTRAINT utm_mapping_conflict_log_conflict_type_check
  CHECK (conflict_type IN (
    'multi_pattern','multi_owner','ineligible_owner','ambiguous_tiebreak',
    'zero_match','overbroad'
  ));

-- 1. Self-check RPC (kann mit existierendem mapping_id ODER ad-hoc pattern aufgerufen werden)
CREATE OR REPLACE FUNCTION public.mapping_self_check(
  _mapping_id uuid DEFAULT NULL,
  _pattern text DEFAULT NULL,
  _source text DEFAULT NULL,
  _days int DEFAULT 30
)
RETURNS TABLE (
  pattern text,
  source text,
  matched_campaigns bigint,
  matched_hits bigint,
  distinct_owners bigint,
  has_match boolean,
  is_overbroad boolean,
  first_seen timestamptz,
  last_seen timestamptz,
  example_campaigns text[],
  warnings text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern text := _pattern;
  v_source text := _source;
  v_warn text[] := ARRAY[]::text[];
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'partner_admin'::app_role)
    OR public.user_has_min_level(auth.uid(), 7)
  ) THEN
    RAISE EXCEPTION 'not authorized to run mapping self-check';
  END IF;

  IF _mapping_id IS NOT NULL THEN
    SELECT COALESCE(m.utm_campaign_pattern, m.utm_campaign), m.utm_source
      INTO v_pattern, v_source
    FROM public.traffic_owner_mappings m WHERE m.id = _mapping_id;
  END IF;

  IF v_pattern IS NULL OR v_pattern = '' THEN
    RAISE EXCEPTION 'no pattern resolved (provide _mapping_id or _pattern)';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      COALESCE(NULLIF(la.utm_campaign, ''), '(none)') AS utm_campaign,
      COALESCE(NULLIF(la.utm_source, ''), '(none)')   AS utm_source,
      la.created_at,
      la.lead_id
    FROM public.lead_attribution la
    WHERE la.created_at >= now() - make_interval(days => _days)
  ),
  hits AS (
    SELECT *
    FROM base b
    WHERE b.utm_campaign ILIKE replace(v_pattern, '*', '%')
      AND (v_source IS NULL OR v_source = '' OR v_source = b.utm_source)
  ),
  agg AS (
    SELECT
      COUNT(DISTINCT utm_campaign) AS matched_campaigns,
      COUNT(*)                     AS matched_hits,
      COUNT(DISTINCT lead_id) FILTER (WHERE lead_id IS NOT NULL) AS distinct_leads,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen,
      (ARRAY_AGG(DISTINCT utm_campaign ORDER BY utm_campaign))[1:5] AS example_campaigns
    FROM hits
  ),
  owners AS (
    SELECT COUNT(DISTINCT m.owner_user_id) AS distinct_owners
    FROM public.traffic_owner_mappings m
    WHERE m.is_active
      AND replace(COALESCE(m.utm_campaign_pattern, m.utm_campaign), '*', '%')
          ILIKE replace(v_pattern, '*', '%')
  )
  SELECT
    v_pattern,
    v_source,
    COALESCE(a.matched_campaigns, 0),
    COALESCE(a.distinct_leads, 0),
    COALESCE(o.distinct_owners, 0),
    COALESCE(a.matched_hits, 0) > 0,
    COALESCE(a.matched_campaigns, 0) >= 50,
    a.first_seen,
    a.last_seen,
    COALESCE(a.example_campaigns, ARRAY[]::text[]),
    (
      CASE WHEN COALESCE(a.matched_hits, 0) = 0
           THEN ARRAY['zero_match: kein Lead in den letzten ' || _days || ' Tagen getroffen']
           ELSE ARRAY[]::text[] END
      ||
      CASE WHEN COALESCE(a.matched_campaigns, 0) >= 50
           THEN ARRAY['overbroad: ' || a.matched_campaigns || ' verschiedene utm_campaigns getroffen — Pattern evtl. zu generisch']
           ELSE ARRAY[]::text[] END
      ||
      CASE WHEN COALESCE(o.distinct_owners, 0) > 1
           THEN ARRAY['conflicting_mappings: ' || o.distinct_owners || ' Owner haben überlappende Patterns']
           ELSE ARRAY[]::text[] END
    )
  FROM agg a CROSS JOIN owners o;
END;
$$;

-- 2. AFTER-Trigger: nach Insert/Update aktiver Mappings Self-Check ins Log schreiben
CREATE OR REPLACE FUNCTION public.trg_traffic_owner_mappings_self_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern text;
  v_source text;
  v_camps bigint;
  v_hits bigint;
  v_first timestamptz;
  v_last timestamptz;
  v_examples text[];
BEGIN
  IF NOT NEW.is_active THEN RETURN NEW; END IF;

  v_pattern := COALESCE(NEW.utm_campaign_pattern, NEW.utm_campaign);
  v_source  := NEW.utm_source;

  SELECT
    COUNT(DISTINCT COALESCE(NULLIF(la.utm_campaign, ''), '(none)')),
    COUNT(*),
    MIN(la.created_at),
    MAX(la.created_at),
    (ARRAY_AGG(DISTINCT COALESCE(NULLIF(la.utm_campaign, ''), '(none)') ORDER BY COALESCE(NULLIF(la.utm_campaign, ''), '(none)')))[1:5]
  INTO v_camps, v_hits, v_first, v_last, v_examples
  FROM public.lead_attribution la
  WHERE la.created_at >= now() - interval '30 days'
    AND COALESCE(NULLIF(la.utm_campaign, ''), '(none)') ILIKE replace(v_pattern, '*', '%')
    AND (v_source IS NULL OR v_source = '' OR v_source = COALESCE(NULLIF(la.utm_source, ''), '(none)'));

  v_camps := COALESCE(v_camps, 0);
  v_hits  := COALESCE(v_hits, 0);

  IF v_hits = 0 THEN
    INSERT INTO public.utm_mapping_conflict_log(
      utm_campaign, utm_source, conflict_type, severity,
      matched_mapping_ids, matched_patterns, matched_owner_ids,
      chosen_mapping_id, chosen_pattern, chosen_owner_id,
      hit_count, detection_window_days
    ) VALUES (
      v_pattern, v_source, 'zero_match', 'warn',
      ARRAY[NEW.id], ARRAY[v_pattern], ARRAY[NEW.owner_user_id],
      NEW.id, v_pattern, NEW.owner_user_id,
      0, 30
    )
    ON CONFLICT (utm_campaign, utm_source_key, conflict_type, detected_on)
    WHERE resolved_at IS NULL DO UPDATE SET hit_count = 0, updated_at = now();

  ELSIF v_camps >= 50 THEN
    INSERT INTO public.utm_mapping_conflict_log(
      utm_campaign, utm_source, conflict_type, severity,
      matched_mapping_ids, matched_patterns, matched_owner_ids,
      chosen_mapping_id, chosen_pattern, chosen_owner_id,
      hit_count, first_seen_at, last_seen_at, detection_window_days
    ) VALUES (
      v_pattern, v_source, 'overbroad', 'warn',
      ARRAY[NEW.id], ARRAY[v_pattern], ARRAY[NEW.owner_user_id],
      NEW.id, v_pattern, NEW.owner_user_id,
      v_hits, v_first, v_last, 30
    )
    ON CONFLICT (utm_campaign, utm_source_key, conflict_type, detected_on)
    WHERE resolved_at IS NULL DO UPDATE SET
      hit_count = EXCLUDED.hit_count,
      last_seen_at = EXCLUDED.last_seen_at,
      updated_at = now();
  END IF;

  RAISE NOTICE 'mapping_self_check[%]: pattern=% camps=% hits=% examples=%',
    NEW.id, v_pattern, v_camps, v_hits, v_examples;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_traffic_owner_mappings_self_check ON public.traffic_owner_mappings;
CREATE TRIGGER trg_traffic_owner_mappings_self_check
AFTER INSERT OR UPDATE OF utm_campaign_pattern, utm_campaign, utm_source, owner_user_id, is_active
ON public.traffic_owner_mappings
FOR EACH ROW EXECUTE FUNCTION public.trg_traffic_owner_mappings_self_check();

GRANT EXECUTE ON FUNCTION public.mapping_self_check(uuid, text, text, int) TO authenticated;