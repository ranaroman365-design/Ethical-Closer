CREATE OR REPLACE FUNCTION public.link_lead_attribution(
  p_session_id text,
  p_lead_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 OR p_lead_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.lead_attribution
     SET lead_id = p_lead_id,
         updated_at = now()
   WHERE session_id = p_session_id
     AND lead_id IS NULL;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_lead_attribution(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.lead_attribution_linkage_report()
RETURNS TABLE (
  total_attribution_rows bigint,
  attribution_rows_linked bigint,
  attribution_link_rate numeric,
  total_leads bigint,
  leads_with_attribution bigint,
  lead_attribution_rate numeric,
  utm_campaign_rows bigint,
  utm_campaign_rows_linked bigint,
  utm_campaign_link_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stats AS (
    SELECT
      (SELECT count(*) FROM public.lead_attribution) AS total_attribution_rows,
      (SELECT count(*) FROM public.lead_attribution WHERE lead_id IS NOT NULL) AS attribution_rows_linked,
      (SELECT count(*) FROM public.leads) AS total_leads,
      (SELECT count(DISTINCT lead_id) FROM public.lead_attribution WHERE lead_id IS NOT NULL) AS leads_with_attribution,
      (SELECT count(*) FROM public.lead_attribution WHERE utm_campaign IS NOT NULL) AS utm_campaign_rows,
      (SELECT count(*) FROM public.lead_attribution WHERE utm_campaign IS NOT NULL AND lead_id IS NOT NULL) AS utm_campaign_rows_linked
  )
  SELECT
    total_attribution_rows,
    attribution_rows_linked,
    CASE WHEN total_attribution_rows = 0 THEN 0 ELSE round((attribution_rows_linked::numeric / total_attribution_rows::numeric), 4) END,
    total_leads,
    leads_with_attribution,
    CASE WHEN total_leads = 0 THEN 0 ELSE round((leads_with_attribution::numeric / total_leads::numeric), 4) END,
    utm_campaign_rows,
    utm_campaign_rows_linked,
    CASE WHEN utm_campaign_rows = 0 THEN 0 ELSE round((utm_campaign_rows_linked::numeric / utm_campaign_rows::numeric), 4) END
  FROM stats;
$$;

GRANT EXECUTE ON FUNCTION public.lead_attribution_linkage_report() TO authenticated;