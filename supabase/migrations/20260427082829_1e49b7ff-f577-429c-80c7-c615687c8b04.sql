-- 1. Eligibility helper
CREATE OR REPLACE FUNCTION public.is_eligible_traffic_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id)
    AND (
      COALESCE(
        (SELECT current_level >= 6 FROM public.user_level_status WHERE user_id = _user_id LIMIT 1),
        false
      )
      OR public.has_role(_user_id, 'partner_admin'::app_role)
      OR public.has_role(_user_id, 'owner'::app_role)
    );
$$;

-- 2. Hardened validation trigger
CREATE OR REPLACE FUNCTION public.traffic_owner_mappings_validate_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_eligible boolean;
  v_lvl int;
  v_has_partner boolean;
  v_has_owner boolean;
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id required - traffic owner must be a real platform user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.owner_user_id) THEN
    RAISE EXCEPTION 'owner_user_id % does not reference an existing platform user (profiles.id)', NEW.owner_user_id;
  END IF;

  v_eligible := public.is_eligible_traffic_owner(NEW.owner_user_id);
  IF NOT v_eligible THEN
    SELECT current_level INTO v_lvl FROM public.user_level_status WHERE user_id = NEW.owner_user_id LIMIT 1;
    v_has_partner := public.has_role(NEW.owner_user_id, 'partner_admin'::app_role);
    v_has_owner   := public.has_role(NEW.owner_user_id, 'owner'::app_role);
    RAISE EXCEPTION 'owner_user_id % is not eligible (level=%, partner_admin=%, owner=%) - need L6+ OR partner/owner role',
      NEW.owner_user_id, COALESCE(v_lvl, 0), v_has_partner, v_has_owner;
  END IF;

  -- Anti-admin-fallback: caller is admin, self-assigning, and NOT independently eligible -> reject
  IF v_caller IS NOT NULL
     AND v_caller = NEW.owner_user_id
     AND public.has_role(v_caller, 'admin'::app_role)
     AND NOT (
       COALESCE((SELECT current_level >= 6 FROM public.user_level_status WHERE user_id = v_caller LIMIT 1), false)
       OR public.has_role(v_caller, 'partner_admin'::app_role)
       OR public.has_role(v_caller, 'owner'::app_role)
     )
  THEN
    RAISE EXCEPTION 'admin cannot self-assign as traffic owner - admin role alone does not qualify (need L6+ or partner/owner)';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Mapping permissions: extend write policy
DROP POLICY IF EXISTS "traffic_owner_mappings_admin_all" ON public.traffic_owner_mappings;

CREATE POLICY "traffic_owner_mappings_governed_write"
ON public.traffic_owner_mappings
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'partner_admin'::app_role)
  OR public.user_has_min_level(auth.uid(), 7)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'partner_admin'::app_role)
  OR public.user_has_min_level(auth.uid(), 7)
);

-- 4. Eligible-owner picker
CREATE OR REPLACE FUNCTION public.traffic_owner_eligible_list()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  current_level int,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    COALESCE(uls.current_level, 0)::int,
    CASE
      WHEN COALESCE(uls.current_level, 0) >= 6 THEN 'level_l6_plus'
      WHEN public.has_role(p.id, 'partner_admin'::app_role) THEN 'role_partner_admin'
      WHEN public.has_role(p.id, 'owner'::app_role) THEN 'role_owner'
      ELSE 'unknown'
    END
  FROM public.profiles p
  LEFT JOIN public.user_level_status uls ON uls.user_id = p.id
  WHERE
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'partner_admin'::app_role)
    OR public.user_has_min_level(auth.uid(), 7)
  AND (
    COALESCE(uls.current_level, 0) >= 6
    OR public.has_role(p.id, 'partner_admin'::app_role)
    OR public.has_role(p.id, 'owner'::app_role)
  )
  ORDER BY COALESCE(uls.current_level, 0) DESC, p.full_name NULLS LAST;
$$;

-- 5. utm_validation_stats: add resolved owner identity
DROP FUNCTION IF EXISTS public.utm_validation_stats(int);
CREATE OR REPLACE FUNCTION public.utm_validation_stats(_days int DEFAULT 30)
RETURNS TABLE (
  utm_source text,
  utm_campaign text,
  hit_count bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  matched_mapping_id uuid,
  matched_pattern text,
  matched_owner uuid,
  is_matched boolean,
  traffic_owner_id uuid,
  traffic_owner_name text,
  traffic_owner_email text,
  traffic_owner_level int,
  is_eligible boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  matched AS (
    SELECT
      b.*,
      m.id AS matched_mapping_id,
      m.utm_campaign_pattern AS matched_pattern,
      m.owner_user_id AS matched_owner
    FROM base b
    LEFT JOIN LATERAL (
      SELECT m.id, m.utm_campaign_pattern, m.owner_user_id
      FROM public.traffic_owner_mappings m
      WHERE m.is_active
        AND b.utm_campaign ILIKE replace(COALESCE(m.utm_campaign_pattern, m.utm_campaign), '*', '%')
        AND (m.utm_source IS NULL OR m.utm_source = '' OR m.utm_source = b.utm_source)
      ORDER BY length(COALESCE(m.utm_campaign_pattern, m.utm_campaign)) DESC
      LIMIT 1
    ) m ON true
  )
  SELECT
    mt.utm_source,
    mt.utm_campaign,
    mt.hit_count,
    mt.first_seen,
    mt.last_seen,
    mt.matched_mapping_id,
    mt.matched_pattern,
    mt.matched_owner,
    mt.matched_mapping_id IS NOT NULL AS is_matched,
    mt.matched_owner AS traffic_owner_id,
    p.full_name AS traffic_owner_name,
    p.email AS traffic_owner_email,
    COALESCE(uls.current_level, 0)::int AS traffic_owner_level,
    public.is_eligible_traffic_owner(mt.matched_owner) AS is_eligible
  FROM matched mt
  LEFT JOIN public.profiles p ON p.id = mt.matched_owner
  LEFT JOIN public.user_level_status uls ON uls.user_id = mt.matched_owner
  ORDER BY mt.hit_count DESC;
$$;

-- 6. utm_mapping_match_counts: add resolved owner identity
DROP FUNCTION IF EXISTS public.utm_mapping_match_counts(int);
CREATE OR REPLACE FUNCTION public.utm_mapping_match_counts(_days int DEFAULT 30)
RETURNS TABLE (
  mapping_id uuid,
  utm_campaign_pattern text,
  utm_source text,
  owner_user_id uuid,
  is_active boolean,
  match_count bigint,
  distinct_campaigns bigint,
  last_match_at timestamptz,
  traffic_owner_id uuid,
  traffic_owner_name text,
  traffic_owner_email text,
  traffic_owner_level int,
  is_eligible boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    COALESCE(m.utm_campaign_pattern, m.utm_campaign),
    m.utm_source,
    m.owner_user_id,
    m.is_active,
    COUNT(la.id) AS match_count,
    COUNT(DISTINCT la.utm_campaign) AS distinct_campaigns,
    MAX(la.created_at) AS last_match_at,
    m.owner_user_id AS traffic_owner_id,
    p.full_name,
    p.email,
    COALESCE(uls.current_level, 0)::int,
    public.is_eligible_traffic_owner(m.owner_user_id)
  FROM public.traffic_owner_mappings m
  LEFT JOIN public.profiles p ON p.id = m.owner_user_id
  LEFT JOIN public.user_level_status uls ON uls.user_id = m.owner_user_id
  LEFT JOIN public.lead_attribution la
    ON la.created_at >= now() - make_interval(days => _days)
   AND la.utm_campaign ILIKE replace(COALESCE(m.utm_campaign_pattern, m.utm_campaign), '*', '%')
   AND (m.utm_source IS NULL OR m.utm_source = '' OR m.utm_source = la.utm_source)
  GROUP BY m.id, p.full_name, p.email, uls.current_level
  ORDER BY match_count DESC;
$$;

-- 7. Apply-suggestion: relax to governed write set, keep owner eligibility
DROP FUNCTION IF EXISTS public.utm_mapping_apply_suggestion(text, uuid, text, text);
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
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'partner_admin'::app_role)
    OR public.user_has_min_level(auth.uid(), 7)
  ) THEN
    RAISE EXCEPTION 'not authorized to create traffic owner mappings';
  END IF;

  IF NOT public.is_eligible_traffic_owner(_owner) THEN
    RAISE EXCEPTION 'owner % is not an eligible traffic owner (need L6+ OR partner/owner role)', _owner;
  END IF;

  INSERT INTO public.traffic_owner_mappings(
    utm_campaign, utm_campaign_pattern, utm_source, owner_user_id, is_active, notes, created_by
  )
  VALUES (
    _pattern,
    _pattern,
    NULLIF(_source, ''),
    _owner,
    true,
    _notes,
    auth.uid()
  )
  ON CONFLICT (utm_campaign, utm_source) DO UPDATE
    SET utm_campaign_pattern = EXCLUDED.utm_campaign_pattern,
        owner_user_id        = EXCLUDED.owner_user_id,
        is_active            = true,
        notes                = COALESCE(EXCLUDED.notes, public.traffic_owner_mappings.notes),
        updated_at           = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 8. Data-quality summary
CREATE OR REPLACE FUNCTION public.utm_data_quality_summary(_days int DEFAULT 30)
RETURNS TABLE (
  total_attribution_rows bigint,
  unassigned_owner_rows bigint,
  unassigned_owner_pct numeric,
  mappings_total bigint,
  mappings_with_ineligible_owner bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH att AS (
    SELECT la.id, la.utm_campaign, la.utm_source
    FROM public.lead_attribution la
    WHERE la.created_at >= now() - make_interval(days => _days)
  ),
  classified AS (
    SELECT
      a.id,
      EXISTS (
        SELECT 1 FROM public.traffic_owner_mappings m
        WHERE m.is_active
          AND COALESCE(a.utm_campaign, '') ILIKE replace(COALESCE(m.utm_campaign_pattern, m.utm_campaign), '*', '%')
          AND (m.utm_source IS NULL OR m.utm_source = '' OR m.utm_source = COALESCE(a.utm_source, ''))
          AND public.is_eligible_traffic_owner(m.owner_user_id)
      ) AS has_eligible_owner
    FROM att a
  )
  SELECT
    (SELECT COUNT(*) FROM att),
    (SELECT COUNT(*) FROM classified WHERE NOT has_eligible_owner),
    CASE WHEN (SELECT COUNT(*) FROM att) = 0 THEN 0
         ELSE ROUND(100.0 * (SELECT COUNT(*) FROM classified WHERE NOT has_eligible_owner)::numeric
                          / (SELECT COUNT(*) FROM att), 2)
    END,
    (SELECT COUNT(*) FROM public.traffic_owner_mappings),
    (SELECT COUNT(*) FROM public.traffic_owner_mappings m
       WHERE NOT public.is_eligible_traffic_owner(m.owner_user_id));
$$;

-- 9. Grants
GRANT EXECUTE ON FUNCTION public.is_eligible_traffic_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_owner_eligible_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.utm_validation_stats(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.utm_mapping_match_counts(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.utm_mapping_apply_suggestion(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.utm_data_quality_summary(int) TO authenticated;

-- 10. Sample mapping notice (no fake data inserted)
DO $$
DECLARE
  v_oleg_count int;
  v_josue_count int;
BEGIN
  SELECT COUNT(*) INTO v_oleg_count
  FROM public.profiles p
  JOIN public.user_level_status uls ON uls.user_id = p.id
  WHERE (p.full_name ILIKE '%oleg%' OR p.email ILIKE '%oleg%') AND uls.current_level >= 6;

  SELECT COUNT(*) INTO v_josue_count
  FROM public.profiles p
  JOIN public.user_level_status uls ON uls.user_id = p.id
  WHERE (p.full_name ILIKE '%josu%' OR p.email ILIKE '%josu%') AND uls.current_level >= 6;

  RAISE NOTICE 'Traffic-owner provisioning check: eligible Oleg=% / eligible Josué=%. No mappings auto-created; admin must promote them to L6+ or grant partner_admin role first.', v_oleg_count, v_josue_count;
END $$;