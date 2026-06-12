
CREATE OR REPLACE FUNCTION public.ab_assign_funnel(
  p_session_id text,
  p_page_funnel public.funnel_source_t
) RETURNS public.funnel_source_t
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_existing public.ab_funnel_assignments%ROWTYPE;
  v_bucket text;
  v_funnel public.funnel_source_t;
  v_hash bigint;
BEGIN
  SELECT * INTO v_test FROM public.ab_funnel_tests WHERE status='running' LIMIT 1;
  IF NOT FOUND THEN RETURN p_page_funnel; END IF;

  IF p_page_funnel <> v_test.champion_funnel AND p_page_funnel <> v_test.challenger_funnel THEN
    RETURN p_page_funnel;
  END IF;

  SELECT * INTO v_existing
  FROM public.ab_funnel_assignments
  WHERE test_id = v_test.id AND session_id = p_session_id;
  IF FOUND THEN RETURN v_existing.assigned_funnel; END IF;

  -- Deterministic 50/50 via md5 (always available) → low hex byte parity
  v_hash := ('x' || substr(md5(v_test.test_key || ':' || p_session_id), 1, 8))::bit(32)::bigint;
  IF (v_hash % 2) = 0 THEN
    v_bucket := 'champion'; v_funnel := v_test.champion_funnel;
  ELSE
    v_bucket := 'challenger'; v_funnel := v_test.challenger_funnel;
  END IF;

  INSERT INTO public.ab_funnel_assignments(test_id, session_id, bucket, assigned_funnel)
  VALUES (v_test.id, p_session_id, v_bucket, v_funnel)
  ON CONFLICT (test_id, session_id) DO NOTHING;

  RETURN v_funnel;
END $$;
