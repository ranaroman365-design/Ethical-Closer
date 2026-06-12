
CREATE OR REPLACE FUNCTION public.get_kpi_drilldown_leads(
  p_kpi_type text,
  p_window_days int DEFAULT 30,
  p_sort_col text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc',
  p_page int DEFAULT 0,
  p_page_size int DEFAULT 50,
  p_scope text DEFAULT 'all',
  p_user_id uuid DEFAULT NULL,
  p_team_ids uuid[] DEFAULT NULL,
  p_funnel text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_heat text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_since timestamptz := now() - (p_window_days || ' days')::interval;
  v_offset int := p_page * p_page_size;
  v_total bigint;
  v_rows jsonb;
  v_sort text;
  v_dir text;
BEGIN
  -- Validate sort column
  v_sort := CASE p_sort_col
    WHEN 'name' THEN 'name'
    WHEN 'source' THEN 'source'
    WHEN 'stage' THEN 'stage'
    WHEN 'score' THEN 'lead_score'
    WHEN 'deal' THEN 'deal_value'
    WHEN 'date' THEN 'created_at'
    WHEN 'created_at' THEN 'created_at'
    WHEN 'outcome' THEN 'outcome'
    ELSE 'created_at'
  END;

  v_dir := CASE WHEN lower(p_sort_dir) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  -- Build temp filtered set
  CREATE TEMP TABLE _drilldown_leads ON COMMIT DROP AS
  SELECT
    l.id, l.name, l.email, l.source, l.funnel_id, l.lead_score, l.stage,
    l.has_booking, l.setter_id, l.closer_id, l.setter_call_outcome,
    l.outcome, l.deal_value, l.created_at, l.appointment_date,
    l.no_show_flag, l.total_calls_attended, l.total_calls_booked,
    l.payment_status, l.owner_id,
    CASE
      WHEN l.lead_score >= 30 AND l.has_booking THEN 'hot'
      WHEN l.lead_score >= 10 OR l.has_booking THEN 'warm'
      ELSE 'cold'
    END AS heat
  FROM public.leads l
  WHERE l.created_at >= v_since
    AND l.is_simulation = false
    -- Scope filter
    AND (
      p_scope = 'all'
      OR (p_scope = 'my' AND p_user_id IS NOT NULL AND (
        l.owner_id = p_user_id OR l.setter_id = p_user_id OR l.closer_id = p_user_id
      ))
      OR (p_scope = 'team' AND p_team_ids IS NOT NULL AND (
        l.owner_id = ANY(p_team_ids) OR l.setter_id = ANY(p_team_ids) OR l.closer_id = ANY(p_team_ids)
      ))
    )
    -- Optional filters
    AND (p_funnel IS NULL OR l.source = p_funnel
         OR CASE l.source
              WHEN 'funnel_apply' THEN 'Apply'
              WHEN 'funnel' THEN 'Apply'
              WHEN 'funnel_apply-test' THEN 'Apply (Test)'
              WHEN 'quiz' THEN 'Quiz'
              WHEN 'referral' THEN 'Referral'
              WHEN 'instagram' THEN 'Instagram'
              WHEN 'cold_outreach' THEN 'Cold Outreach'
              WHEN 'webinar' THEN 'Webinar'
              WHEN 'website' THEN 'Website'
              ELSE l.source
            END = p_funnel)
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_search IS NULL OR p_search = '' OR
         l.name ILIKE '%' || p_search || '%' OR
         l.email ILIKE '%' || p_search || '%');

  -- Delete rows not matching heat filter (after computation)
  IF p_heat IS NOT NULL AND p_heat <> 'all' THEN
    DELETE FROM _drilldown_leads WHERE heat <> p_heat;
  END IF;

  -- KPI-type specific filter
  CASE p_kpi_type
    WHEN 'total_leads' THEN
      NULL; -- no additional filter
    WHEN 'booked_calls' THEN
      DELETE FROM _drilldown_leads WHERE has_booking = false;
    WHEN 'no_shows' THEN
      DELETE FROM _drilldown_leads WHERE no_show_flag = false
        AND NOT EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.lead_id = _drilldown_leads.id
            AND (a.appointment_status = 'no_show' OR a.attendance_flag = false)
        );
    WHEN 'no_close' THEN
      DELETE FROM _drilldown_leads
      WHERE NOT (outcome = 'lost' OR (total_calls_attended > 0 AND (outcome IS NULL OR outcome <> 'won')));
    WHEN 'revenue' THEN
      DELETE FROM _drilldown_leads WHERE outcome <> 'won' AND payment_status <> 'paid';
    WHEN 'engagement' THEN
      DELETE FROM _drilldown_leads WHERE (lead_score IS NULL OR lead_score <= 0) AND has_booking = false;
    WHEN 'qualification' THEN
      DELETE FROM _drilldown_leads WHERE setter_call_outcome IS DISTINCT FROM 'qualified';
    ELSE
      NULL;
  END CASE;

  -- Get total count
  SELECT count(*) INTO v_total FROM _drilldown_leads;

  -- Get sorted page
  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (
       SELECT id, name, email, source, funnel_id, lead_score, stage,
              has_booking, setter_id, closer_id, setter_call_outcome,
              outcome, deal_value, created_at, appointment_date,
              no_show_flag, total_calls_attended, total_calls_booked,
              payment_status, heat
       FROM _drilldown_leads
       ORDER BY %I %s NULLS LAST
       LIMIT %s OFFSET %s
     ) t',
    v_sort, v_dir, p_page_size, v_offset
  ) INTO v_rows;

  RETURN jsonb_build_object(
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'rows', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;
