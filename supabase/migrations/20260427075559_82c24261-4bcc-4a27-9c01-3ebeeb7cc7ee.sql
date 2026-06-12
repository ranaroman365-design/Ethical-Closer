-- RPC: UTM validation stats from lead_attribution + mapping match counts

CREATE OR REPLACE FUNCTION public.utm_validation_stats(
  _days integer DEFAULT 30
)
RETURNS TABLE (
  utm_source text,
  utm_campaign text,
  hit_count bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  matched_mapping_id uuid,
  matched_pattern text,
  matched_owner uuid,
  is_matched boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT
      COALESCE(NULLIF(utm_source, ''), '(none)') AS utm_source,
      COALESCE(NULLIF(utm_campaign, ''), '(none)') AS utm_campaign,
      created_at
    FROM public.lead_attribution
    WHERE created_at >= now() - make_interval(days => _days)
  ),
  agg AS (
    SELECT
      utm_source,
      utm_campaign,
      COUNT(*)::bigint AS hit_count,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen
    FROM recent
    GROUP BY utm_source, utm_campaign
  )
  SELECT
    a.utm_source,
    a.utm_campaign,
    a.hit_count,
    a.first_seen,
    a.last_seen,
    m.id AS matched_mapping_id,
    m.utm_campaign_pattern AS matched_pattern,
    m.owner_user_id AS matched_owner,
    (m.id IS NOT NULL) AS is_matched
  FROM agg a
  LEFT JOIN LATERAL (
    SELECT m.*
    FROM public.traffic_owner_mappings m
    WHERE m.is_active = true
      AND a.utm_campaign ILIKE replace(m.utm_campaign_pattern, '*', '%')
      AND (m.utm_source IS NULL OR m.utm_source = '' OR a.utm_source = m.utm_source)
    ORDER BY length(m.utm_campaign_pattern) DESC
    LIMIT 1
  ) m ON true
  ORDER BY a.hit_count DESC;
$$;

REVOKE ALL ON FUNCTION public.utm_validation_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utm_validation_stats(integer) TO authenticated;

-- RPC: Per-mapping match counts
CREATE OR REPLACE FUNCTION public.utm_mapping_match_counts(
  _days integer DEFAULT 30
)
RETURNS TABLE (
  mapping_id uuid,
  utm_campaign_pattern text,
  utm_source text,
  owner_user_id uuid,
  is_active boolean,
  match_count bigint,
  distinct_campaigns bigint,
  last_match_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT
      COALESCE(NULLIF(utm_source, ''), '') AS utm_source,
      COALESCE(NULLIF(utm_campaign, ''), '') AS utm_campaign,
      created_at
    FROM public.lead_attribution
    WHERE created_at >= now() - make_interval(days => _days)
      AND utm_campaign IS NOT NULL
      AND utm_campaign <> ''
  ),
  joined AS (
    SELECT
      m.id AS mapping_id,
      m.utm_campaign_pattern,
      m.utm_source,
      m.owner_user_id,
      m.is_active,
      r.utm_campaign,
      r.created_at
    FROM public.traffic_owner_mappings m
    LEFT JOIN recent r
      ON r.utm_campaign ILIKE replace(m.utm_campaign_pattern, '*', '%')
     AND (m.utm_source IS NULL OR m.utm_source = '' OR r.utm_source = m.utm_source)
  )
  SELECT
    mapping_id,
    utm_campaign_pattern,
    utm_source,
    owner_user_id,
    is_active,
    COUNT(utm_campaign)::bigint AS match_count,
    COUNT(DISTINCT utm_campaign)::bigint AS distinct_campaigns,
    MAX(created_at) AS last_match_at
  FROM joined
  GROUP BY mapping_id, utm_campaign_pattern, utm_source, owner_user_id, is_active
  ORDER BY match_count DESC;
$$;

REVOKE ALL ON FUNCTION public.utm_mapping_match_counts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utm_mapping_match_counts(integer) TO authenticated;