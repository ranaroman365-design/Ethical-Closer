-- CRM Hygiene Score + Response Time + Follow-Up Rate calculation function
CREATE OR REPLACE FUNCTION public.recalc_crm_and_response_kpis(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_leads int;
  v_has_email int;
  v_has_phone int;
  v_has_owner int;
  v_recently_updated int;
  v_crm_score numeric;
  v_avg_response_minutes numeric;
  v_follow_up_total int;
  v_follow_up_actioned int;
  v_follow_up_rate numeric;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE email IS NOT NULL AND email != ''),
    count(*) FILTER (WHERE phone IS NOT NULL AND phone != ''),
    count(*) FILTER (WHERE setter_id IS NOT NULL OR closer_id IS NOT NULL),
    count(*) FILTER (WHERE updated_at > now() - interval '72 hours')
  INTO v_total_leads, v_has_email, v_has_phone, v_has_owner, v_recently_updated
  FROM leads
  WHERE (setter_id = p_user_id OR closer_id = p_user_id OR owner_id = p_user_id)
    AND stage NOT IN ('cancelled', 'recycled');

  IF v_total_leads > 0 THEN
    v_crm_score := ROUND(
      ((v_has_email::numeric / v_total_leads) * 25) +
      ((v_has_phone::numeric / v_total_leads) * 25) +
      ((v_has_owner::numeric / v_total_leads) * 25) +
      ((v_recently_updated::numeric / v_total_leads) * 25)
    , 0);
  ELSE
    v_crm_score := 0;
  END IF;

  SELECT COALESCE(
    AVG(EXTRACT(EPOCH FROM (first_action_at - created_at)) / 60),
    0
  )
  INTO v_avg_response_minutes
  FROM leads
  WHERE (setter_id = p_user_id OR closer_id = p_user_id OR owner_id = p_user_id)
    AND first_action_at IS NOT NULL
    AND created_at IS NOT NULL;

  SELECT
    count(*),
    count(*) FILTER (WHERE id IN (
      SELECT DISTINCT lead_id FROM lead_transitions WHERE new_stage = 'follow_up'
    ) OR stage = 'follow_up')
  INTO v_follow_up_total, v_follow_up_actioned
  FROM leads
  WHERE (setter_id = p_user_id OR closer_id = p_user_id OR owner_id = p_user_id)
    AND stage NOT IN ('new', 'cancelled');

  IF v_follow_up_total > 0 THEN
    v_follow_up_rate := ROUND((v_follow_up_actioned::numeric / v_follow_up_total) * 100, 0);
  ELSE
    v_follow_up_rate := 0;
  END IF;

  UPDATE member_kpis SET
    crm_hygiene_score = v_crm_score,
    response_time = ROUND(v_avg_response_minutes, 1),
    follow_up_rate = v_follow_up_rate,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;