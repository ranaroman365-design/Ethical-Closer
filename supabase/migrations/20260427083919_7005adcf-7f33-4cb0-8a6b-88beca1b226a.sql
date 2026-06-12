-- Helper view: lead -> resolved owner (best mapping)
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_resolve(_only_unset boolean DEFAULT true)
RETURNS TABLE (
  lead_id uuid,
  current_owner uuid,
  resolved_owner uuid,
  utm_campaign text,
  utm_source text,
  matched_pattern text,
  is_eligible boolean,
  needs_change boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH la AS (
    SELECT DISTINCT ON (la.lead_id)
      la.lead_id,
      COALESCE(NULLIF(la.utm_campaign, ''), '(none)') AS utm_campaign,
      COALESCE(NULLIF(la.utm_source, ''), '(none)')   AS utm_source
    FROM public.lead_attribution la
    WHERE la.lead_id IS NOT NULL
    ORDER BY la.lead_id, la.created_at DESC
  ),
  resolved AS (
    SELECT
      la.lead_id,
      la.utm_campaign,
      la.utm_source,
      m.id AS mapping_id,
      m.owner_user_id AS resolved_owner,
      COALESCE(m.utm_campaign_pattern, m.utm_campaign) AS matched_pattern
    FROM la
    LEFT JOIN LATERAL (
      SELECT m.id, m.utm_campaign_pattern, m.utm_campaign, m.owner_user_id
      FROM public.traffic_owner_mappings m
      WHERE m.is_active
        AND la.utm_campaign ILIKE replace(COALESCE(m.utm_campaign_pattern, m.utm_campaign), '*', '%')
        AND (m.utm_source IS NULL OR m.utm_source = '' OR m.utm_source = la.utm_source)
        AND public.is_eligible_traffic_owner(m.owner_user_id)
      ORDER BY length(COALESCE(m.utm_campaign_pattern, m.utm_campaign)) DESC, m.created_at
      LIMIT 1
    ) m ON true
  )
  SELECT
    l.id,
    l.traffic_owner,
    r.resolved_owner,
    r.utm_campaign,
    r.utm_source,
    r.matched_pattern,
    public.is_eligible_traffic_owner(r.resolved_owner),
    (r.resolved_owner IS NOT NULL AND r.resolved_owner IS DISTINCT FROM l.traffic_owner)
  FROM public.leads l
  LEFT JOIN resolved r ON r.lead_id = l.id
  WHERE (NOT _only_unset OR l.traffic_owner IS NULL);
$$;

-- 1. Preview: aggregated counts per resolved owner
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_preview(_only_unset boolean DEFAULT true)
RETURNS TABLE (
  resolved_owner uuid,
  owner_name text,
  owner_email text,
  owner_level int,
  is_eligible boolean,
  leads_to_update bigint,
  leads_already_correct bigint,
  leads_unmatched bigint
)
LANGUAGE plpgsql
STABLE
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
    RAISE EXCEPTION 'not authorized for backfill preview';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.traffic_owner_backfill_resolve(_only_unset)
  )
  SELECT
    r.resolved_owner,
    p.full_name,
    p.email,
    COALESCE(uls.current_level, 0)::int,
    public.is_eligible_traffic_owner(r.resolved_owner),
    COUNT(*) FILTER (WHERE r.needs_change),
    COUNT(*) FILTER (WHERE NOT r.needs_change AND r.resolved_owner IS NOT NULL),
    COUNT(*) FILTER (WHERE r.resolved_owner IS NULL)
  FROM r
  LEFT JOIN public.profiles p ON p.id = r.resolved_owner
  LEFT JOIN public.user_level_status uls ON uls.user_id = r.resolved_owner
  GROUP BY r.resolved_owner, p.full_name, p.email, uls.current_level
  ORDER BY COUNT(*) FILTER (WHERE r.needs_change) DESC NULLS LAST;
END;
$$;

-- 2. Sample: real lead_ids with resolved owner
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_sample(
  _only_unset boolean DEFAULT true,
  _limit int DEFAULT 25
)
RETURNS TABLE (
  lead_id uuid,
  current_owner uuid,
  resolved_owner uuid,
  resolved_owner_name text,
  resolved_owner_email text,
  resolved_owner_level int,
  utm_campaign text,
  utm_source text,
  matched_pattern text,
  needs_change boolean
)
LANGUAGE plpgsql
STABLE
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
    RAISE EXCEPTION 'not authorized for backfill sample';
  END IF;

  RETURN QUERY
  SELECT
    r.lead_id,
    r.current_owner,
    r.resolved_owner,
    p.full_name,
    p.email,
    COALESCE(uls.current_level, 0)::int,
    r.utm_campaign,
    r.utm_source,
    r.matched_pattern,
    r.needs_change
  FROM public.traffic_owner_backfill_resolve(_only_unset) r
  LEFT JOIN public.profiles p ON p.id = r.resolved_owner
  LEFT JOIN public.user_level_status uls ON uls.user_id = r.resolved_owner
  WHERE r.resolved_owner IS NOT NULL
  ORDER BY r.needs_change DESC, r.lead_id
  LIMIT GREATEST(1, COALESCE(_limit, 25));
END;
$$;

-- 3. Apply: do the backfill, return before/after + sample
CREATE OR REPLACE FUNCTION public.traffic_owner_backfill_apply(
  _only_unset boolean DEFAULT true,
  _dry_run boolean DEFAULT false,
  _sample_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before_unset bigint;
  v_after_unset bigint;
  v_planned bigint;
  v_updated bigint := 0;
  v_skipped_ineligible bigint := 0;
  v_sample jsonb;
  v_sample_after jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'partner_admin'::app_role)
    OR public.user_has_min_level(auth.uid(), 7)
  ) THEN
    RAISE EXCEPTION 'not authorized to apply backfill';
  END IF;

  SELECT COUNT(*) INTO v_before_unset FROM public.leads WHERE traffic_owner IS NULL;

  WITH r AS (
    SELECT * FROM public.traffic_owner_backfill_resolve(_only_unset)
  )
  SELECT
    COUNT(*) FILTER (WHERE needs_change AND is_eligible),
    COUNT(*) FILTER (WHERE needs_change AND NOT is_eligible)
  INTO v_planned, v_skipped_ineligible
  FROM r;

  -- before-sample (always)
  SELECT jsonb_agg(jsonb_build_object(
    'lead_id', lead_id,
    'current_owner', current_owner,
    'resolved_owner', resolved_owner,
    'resolved_owner_name', resolved_owner_name,
    'resolved_owner_email', resolved_owner_email,
    'utm_campaign', utm_campaign,
    'matched_pattern', matched_pattern
  ))
  INTO v_sample
  FROM public.traffic_owner_backfill_sample(_only_unset, _sample_limit);

  IF NOT _dry_run AND v_planned > 0 THEN
    WITH r AS (
      SELECT lead_id, resolved_owner
      FROM public.traffic_owner_backfill_resolve(_only_unset)
      WHERE needs_change AND is_eligible
    )
    UPDATE public.leads l
       SET traffic_owner = r.resolved_owner
      FROM r
     WHERE l.id = r.lead_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  SELECT COUNT(*) INTO v_after_unset FROM public.leads WHERE traffic_owner IS NULL;

  -- after-sample (resolved leads)
  SELECT jsonb_agg(jsonb_build_object(
    'lead_id', l.id,
    'traffic_owner', l.traffic_owner,
    'owner_name', p.full_name,
    'owner_email', p.email,
    'owner_level', COALESCE(uls.current_level, 0)
  ))
  INTO v_sample_after
  FROM public.leads l
  LEFT JOIN public.profiles p ON p.id = l.traffic_owner
  LEFT JOIN public.user_level_status uls ON uls.user_id = l.traffic_owner
  WHERE l.traffic_owner IS NOT NULL
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, COALESCE(_sample_limit, 10));

  RETURN jsonb_build_object(
    'dry_run', _dry_run,
    'only_unset', _only_unset,
    'planned_updates', v_planned,
    'skipped_ineligible_owner', v_skipped_ineligible,
    'updated_rows', v_updated,
    'leads_unset_before', v_before_unset,
    'leads_unset_after', v_after_unset,
    'leads_resolved_delta', v_before_unset - v_after_unset,
    'sample_before', COALESCE(v_sample, '[]'::jsonb),
    'sample_after', COALESCE(v_sample_after, '[]'::jsonb),
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_resolve(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_preview(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_sample(boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_backfill_apply(boolean, boolean, int) TO authenticated;