-- Suggest mapping patterns based on unmapped incoming campaigns

CREATE OR REPLACE FUNCTION public.utm_mapping_suggestions(
  _days integer DEFAULT 30,
  _min_hits integer DEFAULT 2
)
RETURNS TABLE (
  suggested_pattern text,
  suggested_source text,
  matched_campaigns_count bigint,
  total_hits bigint,
  example_campaigns text[],
  first_seen timestamptz,
  last_seen timestamptz,
  conflicts_with_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT
      COALESCE(NULLIF(utm_source, ''), '') AS utm_source,
      NULLIF(utm_campaign, '')              AS utm_campaign,
      created_at
    FROM public.lead_attribution
    WHERE created_at >= now() - make_interval(days => _days)
      AND utm_campaign IS NOT NULL
      AND utm_campaign <> ''
  ),
  -- Eliminate already-mapped campaigns
  unmapped AS (
    SELECT r.*
    FROM recent r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.traffic_owner_mappings m
      WHERE m.is_active = true
        AND r.utm_campaign ILIKE replace(m.utm_campaign_pattern, '*', '%')
        AND (m.utm_source IS NULL OR m.utm_source = '' OR r.utm_source = m.utm_source)
    )
  ),
  -- Generate candidate patterns: exact + prefix-up-to-separator + token-prefix
  candidates AS (
    -- exact match
    SELECT utm_campaign AS pattern, utm_source, utm_campaign, created_at FROM unmapped
    UNION ALL
    -- prefix before first '_' or '-' (length >= 3)
    SELECT
      regexp_replace(utm_campaign, '^([^_\-]{3,}).*$', '\1') || '*' AS pattern,
      utm_source, utm_campaign, created_at
    FROM unmapped
    WHERE utm_campaign ~ '^[^_\-]{3,}[_\-]'
    UNION ALL
    -- two-token prefix joined by '_' or '-'
    SELECT
      regexp_replace(utm_campaign, '^([^_\-]+[_\-][^_\-]+).*$', '\1') || '*' AS pattern,
      utm_source, utm_campaign, created_at
    FROM unmapped
    WHERE utm_campaign ~ '^[^_\-]+[_\-][^_\-]+[_\-]'
  ),
  agg AS (
    SELECT
      pattern,
      utm_source,
      COUNT(DISTINCT utm_campaign)::bigint AS matched_campaigns_count,
      COUNT(*)::bigint                     AS total_hits,
      (array_agg(DISTINCT utm_campaign))[1:5] AS example_campaigns,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen
    FROM candidates
    GROUP BY pattern, utm_source
    HAVING COUNT(*) >= _min_hits
  )
  SELECT
    a.pattern AS suggested_pattern,
    NULLIF(a.utm_source, '') AS suggested_source,
    a.matched_campaigns_count,
    a.total_hits,
    a.example_campaigns,
    a.first_seen,
    a.last_seen,
    EXISTS (
      SELECT 1 FROM public.traffic_owner_mappings m
      WHERE m.is_active = true
        AND m.utm_campaign_pattern = a.pattern
        AND COALESCE(m.utm_source, '') = a.utm_source
    ) AS conflicts_with_active
  FROM agg a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.traffic_owner_mappings m
    WHERE m.is_active = true
      AND m.utm_campaign_pattern = a.pattern
      AND COALESCE(m.utm_source, '') = a.utm_source
  )
  ORDER BY a.total_hits DESC, a.matched_campaigns_count DESC;
$$;

REVOKE ALL ON FUNCTION public.utm_mapping_suggestions(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utm_mapping_suggestions(integer, integer) TO authenticated;


-- One-click apply
CREATE OR REPLACE FUNCTION public.utm_mapping_apply_suggestion(
  _pattern text,
  _owner uuid,
  _source text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  IF _pattern IS NULL OR length(trim(_pattern)) = 0 THEN
    RAISE EXCEPTION 'pattern required';
  END IF;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'owner required';
  END IF;

  INSERT INTO public.traffic_owner_mappings (
    utm_campaign,
    utm_campaign_pattern,
    utm_source,
    owner_user_id,
    is_active,
    notes,
    created_by
  ) VALUES (
    _pattern,         -- legacy NOT NULL column mirrors pattern
    _pattern,
    NULLIF(_source, ''),
    _owner,
    true,
    COALESCE(_notes, 'Auto-suggested from UTM Validation'),
    v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.utm_mapping_apply_suggestion(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utm_mapping_apply_suggestion(text, uuid, text, text) TO authenticated;