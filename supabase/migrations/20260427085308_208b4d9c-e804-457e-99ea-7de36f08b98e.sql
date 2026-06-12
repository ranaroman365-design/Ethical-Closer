CREATE OR REPLACE FUNCTION public.ors_validation_report()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t1 bigint; t2 bigint; t3 bigint; t4 bigint;
  t5 numeric; t6 bigint; t7 jsonb;
  v_op_count bigint; v_dir_count bigint;
  v_admin_ids uuid[];
  verdict text;
  blockers jsonb := '[]'::jsonb;
BEGIN
  SELECT count(*) INTO t1
  FROM public.leads l
  WHERE l.traffic_owner IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = l.traffic_owner);

  SELECT count(*) INTO t2
  FROM public.leads l
  WHERE l.traffic_owner IS NOT NULL
    AND NOT public.is_eligible_traffic_owner(l.traffic_owner);

  SELECT array_agg(ur.user_id) INTO v_admin_ids
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
    AND NOT public.is_eligible_traffic_owner(ur.user_id);

  IF v_admin_ids IS NULL THEN
    t3 := 0;
  ELSE
    SELECT count(*) INTO t3 FROM public.leads l WHERE l.traffic_owner = ANY(v_admin_ids);
  END IF;

  SELECT count(*) INTO t4
  FROM public.profiles p
  JOIN public.user_level_status uls ON uls.user_id = p.id
  WHERE uls.current_level >= 6 AND p.director_id IS NULL;

  t5 := public.ors_completeness_score();

  SELECT count(*) INTO t6 FROM (
    SELECT director_owner_id FROM public.operator_team_performance
    WHERE director_owner_id IS NOT NULL
    GROUP BY director_owner_id
  ) x;

  SELECT to_jsonb(row_to_json(z)) INTO t7
  FROM (
    SELECT l.id AS lead_id,
           l.traffic_owner,
           p.director_id AS director_owner_id,
           COALESCE(l.deal_value, 0) AS deal_value,
           l.lead_status,
           l.closed_at
    FROM public.leads l
    JOIN public.profiles p ON p.id = l.traffic_owner
    WHERE l.traffic_owner IS NOT NULL AND p.director_id IS NOT NULL
    LIMIT 1
  ) z;

  SELECT count(*) INTO v_op_count
  FROM public.user_level_status WHERE current_level >= 6;
  SELECT count(*) INTO v_dir_count
  FROM public.profiles p
  WHERE public.is_eligible_director(p.id);

  IF t1 > 0 THEN blockers := blockers || jsonb_build_array('TEST1_invalid_owner_fk'); END IF;
  IF t2 > 0 THEN blockers := blockers || jsonb_build_array('TEST2_level_violation'); END IF;
  IF t3 > 0 THEN blockers := blockers || jsonb_build_array('TEST3_admin_leak'); END IF;
  IF t4 > 0 THEN blockers := blockers || jsonb_build_array('TEST4_operators_without_director'); END IF;
  IF t5 < 0.8 THEN blockers := blockers || jsonb_build_array('TEST5_completeness_below_0.8'); END IF;
  IF t6 < 1 THEN blockers := blockers || jsonb_build_array('TEST6_no_team_visibility'); END IF;
  IF t7 IS NULL THEN blockers := blockers || jsonb_build_array('TEST7_no_traceable_lead'); END IF;

  verdict := CASE WHEN jsonb_array_length(blockers)=0 THEN 'READY' ELSE 'NOT READY' END;

  RETURN jsonb_build_object(
    'tests', jsonb_build_object(
      'test1_invalid_owner_fk', t1,
      'test2_level_violation', t2,
      'test3_admin_leak', t3,
      'test4_operators_without_director', t4,
      'test5_completeness_score', t5,
      'test6_directors_with_operators', t6,
      'test7_traceable_lead_sample', t7
    ),
    'counts', jsonb_build_object(
      'operators_l6_plus', v_op_count,
      'eligible_directors', v_dir_count
    ),
    'blockers', blockers,
    'verdict', verdict,
    'generated_at', now()
  );
END $$;