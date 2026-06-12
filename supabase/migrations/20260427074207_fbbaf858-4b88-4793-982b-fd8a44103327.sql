-- =============================================================================
-- Layer: Traffic-Owner Mapping — L6 Validation + Pattern Matching + Backfill
-- Non-destructive: existing columns (utm_campaign, utm_source, owner_user_id,
-- is_active) and resolve_traffic_owner(text,text) remain unchanged.
-- =============================================================================

-- 1) Pattern column for LIKE-style matching ----------------------------------
ALTER TABLE public.traffic_owner_mappings
  ADD COLUMN IF NOT EXISTS utm_campaign_pattern text;

CREATE INDEX IF NOT EXISTS idx_traffic_owner_mappings_pattern
  ON public.traffic_owner_mappings (utm_campaign_pattern)
  WHERE is_active AND utm_campaign_pattern IS NOT NULL;

-- 2) L6+ operator validation trigger -----------------------------------------
CREATE OR REPLACE FUNCTION public.traffic_owner_mappings_validate_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level text;
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id required';
  END IF;

  SELECT current_level INTO v_level
    FROM public.profiles WHERE id = NEW.owner_user_id;

  IF v_level IS NULL THEN
    RAISE EXCEPTION 'owner_user_id % has no profile', NEW.owner_user_id;
  END IF;

  IF v_level NOT IN ('L6','L7','L8') THEN
    RAISE EXCEPTION 'owner_user_id % is %, must be L6+ operator',
                    NEW.owner_user_id, v_level;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_traffic_owner_mappings_validate
  ON public.traffic_owner_mappings;
CREATE TRIGGER trg_traffic_owner_mappings_validate
  BEFORE INSERT OR UPDATE OF owner_user_id ON public.traffic_owner_mappings
  FOR EACH ROW EXECUTE FUNCTION public.traffic_owner_mappings_validate_owner();

-- 3) Resolver v2 — exact > pattern > NULL (never raises) ---------------------
CREATE OR REPLACE FUNCTION public.resolve_traffic_owner_v2(
  p_utm_campaign text,
  p_utm_source text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_utm_campaign IS NULL OR p_utm_campaign = '' THEN
    RETURN NULL;
  END IF;

  -- Exact match (source-aware first, then source-agnostic)
  SELECT owner_user_id INTO v_owner
    FROM public.traffic_owner_mappings
   WHERE is_active
     AND utm_campaign = p_utm_campaign
     AND (utm_source IS NULL OR utm_source = COALESCE(p_utm_source, utm_source))
   ORDER BY (utm_source IS NOT NULL) DESC
   LIMIT 1;
  IF v_owner IS NOT NULL THEN RETURN v_owner; END IF;

  -- Pattern match (LIKE)
  SELECT owner_user_id INTO v_owner
    FROM public.traffic_owner_mappings
   WHERE is_active
     AND utm_campaign_pattern IS NOT NULL
     AND p_utm_campaign LIKE utm_campaign_pattern
     AND (utm_source IS NULL OR utm_source = COALESCE(p_utm_source, utm_source))
   ORDER BY length(utm_campaign_pattern) DESC,
            (utm_source IS NOT NULL) DESC
   LIMIT 1;

  RETURN v_owner;  -- NULL if nothing matches — caller treats as "system"
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_traffic_owner_v2(text, text)
  TO authenticated, anon, service_role;

-- 4) Auto-fill traffic_owner on leads from lead_attribution ------------------
CREATE OR REPLACE FUNCTION public.leads_fill_traffic_owner_from_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_campaign text;
  v_source text;
BEGIN
  -- Only act when traffic_owner is missing — never overwrite manual choices
  IF NEW.traffic_owner IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT utm_campaign, utm_source INTO v_campaign, v_source
    FROM public.lead_attribution
   WHERE lead_id = NEW.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_campaign IS NULL OR v_campaign = '' THEN
    RETURN NEW;  -- no signal, leave NULL
  END IF;

  BEGIN
    v_owner := public.resolve_traffic_owner_v2(v_campaign, v_source);
  EXCEPTION WHEN OTHERS THEN
    v_owner := NULL;  -- never block lead creation
  END;

  IF v_owner IS NOT NULL THEN
    NEW.traffic_owner := v_owner;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_fill_traffic_owner
  ON public.leads;
CREATE TRIGGER trg_leads_fill_traffic_owner
  BEFORE INSERT OR UPDATE OF traffic_owner ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_fill_traffic_owner_from_attribution();

-- 5) Safe backfill RPC (admin/owner only) ------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_lead_traffic_owner()
RETURNS TABLE (matched bigint, scanned bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched bigint := 0;
  v_scanned bigint := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'admin or owner role required';
  END IF;

  WITH candidates AS (
    SELECT l.id, la.utm_campaign, la.utm_source
      FROM public.leads l
      JOIN LATERAL (
        SELECT utm_campaign, utm_source
          FROM public.lead_attribution a
         WHERE a.lead_id = l.id
           AND a.utm_campaign IS NOT NULL AND a.utm_campaign <> ''
         ORDER BY a.created_at DESC LIMIT 1
      ) la ON TRUE
     WHERE l.traffic_owner IS NULL
  ),
  resolved AS (
    SELECT id, public.resolve_traffic_owner_v2(utm_campaign, utm_source) AS owner
      FROM candidates
  ),
  upd AS (
    UPDATE public.leads l
       SET traffic_owner = r.owner
      FROM resolved r
     WHERE l.id = r.id AND r.owner IS NOT NULL
     RETURNING 1
  )
  SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM candidates)
  INTO v_matched, v_scanned;

  RETURN QUERY SELECT v_matched, v_scanned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_lead_traffic_owner() TO authenticated;

COMMENT ON COLUMN public.traffic_owner_mappings.utm_campaign_pattern IS
  'Optional LIKE pattern (e.g. ''oleg_%''). Tried after exact utm_campaign match.';
COMMENT ON FUNCTION public.resolve_traffic_owner_v2(text,text) IS
  'Resolves UTM → L6 owner. Order: exact match → pattern match → NULL. Never raises.';