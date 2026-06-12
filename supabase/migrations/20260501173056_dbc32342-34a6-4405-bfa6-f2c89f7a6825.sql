
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
  v_result jsonb;
  v_sort text;
  v_dir text;
  v_kpi_filter text;
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

  -- KPI-type filter clause
  v_kpi_filter := CASE p_kpi_type
    WHEN 'total_leads' THEN 'TRUE'
    WHEN 'booked_calls' THEN 'l.has_booking = true'
    WHEN 'no_shows' THEN '(l.no_show_flag = true OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.lead_id = l.id AND (a.appointment_status = ''no_show'' OR a.attendance_flag = false)))'
    WHEN 'no_close' THEN '(l.outcome = ''lost'' OR (l.total_calls_attended > 0 AND (l.outcome IS NULL OR l.outcome <> ''won'')))'
    WHEN 'revenue' THEN '(l.outcome = ''won'' OR l.payment_status = ''paid'')'
    WHEN 'engagement' THEN '((l.lead_score IS NOT NULL AND l.lead_score > 0) OR l.has_booking = true)'
    WHEN 'qualification' THEN 'l.setter_call_outcome = ''qualified'''
    ELSE 'TRUE'
  END;

  -- Single query: fetch rows + total via count(*) OVER()
  EXECUTE format(
    'SELECT jsonb_build_object(
       ''total'', COALESCE((SELECT total FROM t LIMIT 1), 0),
       ''page'', $9::int,
       ''page_size'', $10::int,
       ''rows'', COALESCE((SELECT jsonb_agg(to_jsonb(t) - ''total'') FROM t), ''[]''::jsonb)
     )
     FROM (
       SELECT l.id, l.name, l.email, l.source, l.funnel_id, l.lead_score, l.stage,
              l.has_booking, l.setter_id, l.closer_id, l.setter_call_outcome,
              l.outcome, l.deal_value, l.created_at, l.appointment_date,
              l.no_show_flag, l.total_calls_attended, l.total_calls_booked,
              l.payment_status,
              CASE
                WHEN l.lead_score >= 30 AND l.has_booking THEN ''hot''
                WHEN l.lead_score >= 10 OR l.has_booking THEN ''warm''
                ELSE ''cold''
              END AS heat,
              count(*) OVER() AS total
       FROM public.leads l
       WHERE l.created_at >= $1 AND l.is_simulation = false
         AND (%s)
         AND ($2 = ''all'' OR ($2 = ''my'' AND $3 IS NOT NULL AND (l.owner_id = $3 OR l.setter_id = $3 OR l.closer_id = $3))
              OR ($2 = ''team'' AND $4 IS NOT NULL AND (l.owner_id = ANY($4) OR l.setter_id = ANY($4) OR l.closer_id = ANY($4))))
         AND ($5 IS NULL OR l.source = $5 OR (CASE l.source
           WHEN ''funnel_apply'' THEN ''Apply'' WHEN ''funnel'' THEN ''Apply'' WHEN ''funnel_apply-test'' THEN ''Apply (Test)''
           WHEN ''quiz'' THEN ''Quiz'' WHEN ''referral'' THEN ''Referral'' WHEN ''instagram'' THEN ''Instagram''
           WHEN ''cold_outreach'' THEN ''Cold Outreach'' WHEN ''webinar'' THEN ''Webinar'' WHEN ''website'' THEN ''Website''
           ELSE l.source END) = $5)
         AND ($6 IS NULL OR l.source = $6)
         AND ($7 IS NULL OR $7 = ''all'' OR (CASE
           WHEN l.lead_score >= 30 AND l.has_booking THEN ''hot''
           WHEN l.lead_score >= 10 OR l.has_booking THEN ''warm''
           ELSE ''cold'' END) = $7)
         AND ($8 IS NULL OR $8 = '''' OR l.name ILIKE ''%%'' || $8 || ''%%'' OR l.email ILIKE ''%%'' || $8 || ''%%'')
       ORDER BY %I %s NULLS LAST
       LIMIT $10 OFFSET $11
     ) t',
    v_kpi_filter, v_sort, v_dir
  )
  INTO v_result
  USING v_since, p_scope, p_user_id, p_team_ids, p_funnel, p_source, p_heat, p_search,
        p_page, p_page_size, v_offset;

  RETURN COALESCE(v_result, jsonb_build_object('total', 0, 'page', p_page, 'page_size', p_page_size, 'rows', '[]'::jsonb));
END;
$$;
