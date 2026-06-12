
CREATE OR REPLACE FUNCTION public.get_lead_by_email(p_email text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'id', l.id,
    'name', l.name,
    'email', l.email,
    'phone', l.phone,
    'source', l.source,
    'quiz_score', l.quiz_score,
    'lead_score', l.lead_score,
    'lead_quality', l.lead_quality,
    'qualification_bucket', l.qualification_bucket,
    'quiz_answers', l.quiz_answers,
    'quiz_attempt_count', l.quiz_attempt_count,
    'last_quiz_completed_at', l.last_quiz_completed_at,
    'funnel_source', l.funnel_source,
    'lead_status', l.lead_status,
    'referral_code', l.referral_code,
    'traffic_owner', l.traffic_owner,
    'do_not_contact', l.do_not_contact,
    'consent_phone', l.consent_phone,
    'created_at', l.created_at,
    'updated_at', l.updated_at
  ) INTO v_result
  FROM leads l
  WHERE l.email = lower(trim(p_email))
  LIMIT 1;

  RETURN COALESCE(v_result, '{}'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_by_email(text) TO anon, authenticated;
