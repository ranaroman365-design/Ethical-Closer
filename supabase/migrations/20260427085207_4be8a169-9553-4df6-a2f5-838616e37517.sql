-- =========================================================================
-- ORS Governance Hardening
-- =========================================================================

-- 1. profiles.director_id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS director_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_director_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_director_id_fkey
      FOREIGN KEY (director_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_director_id ON public.profiles(director_id);

-- 2. Helper: is_eligible_director
CREATE OR REPLACE FUNCTION public.is_eligible_director(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id)
    AND (
      COALESCE(
        (SELECT current_level >= 7 FROM public.user_level_status WHERE user_id = _user_id LIMIT 1),
        false
      )
      OR public.has_role(_user_id, 'owner'::app_role)
      OR public.has_role(_user_id, 'partner_admin'::app_role)
    );
$$;

-- 3. Trigger: enforce director link
CREATE OR REPLACE FUNCTION public.enforce_director_link()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.director_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.director_id = NEW.id THEN
    RAISE EXCEPTION 'director_id cannot reference self (operator=%)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.is_eligible_director(NEW.director_id) THEN
    RAISE EXCEPTION 'director_id % is not an eligible director (need L>=7 or owner/partner_admin)', NEW.director_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_enforce_director_link ON public.profiles;
CREATE TRIGGER trg_profiles_enforce_director_link
  BEFORE INSERT OR UPDATE OF director_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_director_link();

-- 4. RPC: sanctioned write path
CREATE OR REPLACE FUNCTION public.set_operator_director(_operator uuid, _director uuid)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE p public.profiles;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'partner_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.profiles
     SET director_id = _director,
         updated_at = now()
   WHERE id = _operator
   RETURNING * INTO p;

  IF p.id IS NULL THEN
    RAISE EXCEPTION 'operator % not found', _operator;
  END IF;

  -- Audit
  BEGIN
    INSERT INTO public.governance_events(event_type, level, payload, created_by)
    VALUES (
      'ors_director_assigned',
      'info',
      jsonb_build_object('operator', _operator, 'director', _director),
      auth.uid()
    );
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    -- governance_events shape may vary; do not fail the assignment on audit hiccup
    NULL;
  END;

  RETURN p;
END $$;

-- 5. Diagnostic RPCs
CREATE OR REPLACE FUNCTION public.ors_operator_directors_missing()
RETURNS TABLE (
  operator_id uuid,
  operator_name text,
  operator_email text,
  operator_level int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, uls.current_level::int
  FROM public.profiles p
  JOIN public.user_level_status uls ON uls.user_id = p.id
  WHERE uls.current_level >= 6
    AND p.director_id IS NULL
  ORDER BY uls.current_level DESC, p.full_name NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.ors_invalid_directors()
RETURNS TABLE (
  operator_id uuid,
  director_id uuid,
  reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.director_id,
    CASE
      WHEN p.director_id = p.id THEN 'self_reference'
      WHEN NOT public.is_eligible_director(p.director_id) THEN 'not_eligible'
      ELSE 'unknown'
    END
  FROM public.profiles p
  WHERE p.director_id IS NOT NULL
    AND (p.director_id = p.id OR NOT public.is_eligible_director(p.director_id));
$$;

-- 6. Updated completeness: 70% lead attribution + 30% director coverage
CREATE OR REPLACE FUNCTION public.ors_completeness_score()
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lead_score numeric := 1.0;
  v_dir_score numeric := 1.0;
  v_total bigint;
  v_attr  bigint;
  v_ops bigint;
  v_ops_with_dir bigint;
BEGIN
  SELECT leads_total, fully_attributed
    INTO v_total, v_attr
  FROM public.operator_data_quality;
  IF v_total > 0 THEN
    v_lead_score := round(v_attr::numeric / v_total, 4);
  END IF;

  SELECT count(*) INTO v_ops
  FROM public.user_level_status WHERE current_level >= 6;
  IF v_ops > 0 THEN
    SELECT count(*) INTO v_ops_with_dir
    FROM public.profiles p
    JOIN public.user_level_status uls ON uls.user_id = p.id
    WHERE uls.current_level >= 6 AND p.director_id IS NOT NULL;
    v_dir_score := round(v_ops_with_dir::numeric / v_ops, 4);
  END IF;

  RETURN round(0.7 * v_lead_score + 0.3 * v_dir_score, 4);
END $$;

-- 7. Views
DROP VIEW IF EXISTS public.operator_team_performance CASCADE;
DROP VIEW IF EXISTS public.operator_performance_v2 CASCADE;

CREATE VIEW public.operator_performance_v2
WITH (security_invoker = true) AS
SELECT
  op.traffic_owner,
  p.full_name AS traffic_owner_name,
  p.email     AS traffic_owner_email,
  uls.current_level::int AS traffic_owner_level,
  p.director_id AS director_owner_id,
  d.full_name   AS director_owner_name,
  op.funnel_source,
  op.leads,
  op.bookings,
  op.shows,
  op.deals,
  op.revenue,
  op.booking_rate,
  op.show_rate,
  op.close_rate,
  op.revenue_per_lead
FROM public.operator_performance op
LEFT JOIN public.profiles p ON p.id = op.traffic_owner
LEFT JOIN public.user_level_status uls ON uls.user_id = op.traffic_owner
LEFT JOIN public.profiles d ON d.id = p.director_id;

CREATE VIEW public.operator_team_performance
WITH (security_invoker = true) AS
SELECT
  p.director_id AS director_owner_id,
  d.full_name   AS director_owner_name,
  d.email       AS director_owner_email,
  op.traffic_owner,
  p.full_name   AS traffic_owner_name,
  p.email       AS traffic_owner_email,
  uls.current_level::int AS traffic_owner_level,
  SUM(op.leads)    AS leads,
  SUM(op.bookings) AS bookings,
  SUM(op.shows)    AS shows,
  SUM(op.deals)    AS deals,
  SUM(op.revenue)  AS revenue,
  CASE WHEN SUM(op.leads) > 0 THEN ROUND(SUM(op.bookings)::numeric / SUM(op.leads), 4) END AS booking_rate,
  CASE WHEN SUM(op.shows) > 0 THEN ROUND(SUM(op.deals)::numeric / SUM(op.shows), 4)    END AS close_rate,
  CASE WHEN SUM(op.leads) > 0 THEN ROUND(SUM(op.revenue)::numeric / SUM(op.leads), 2)  END AS revenue_per_lead
FROM public.operator_performance op
LEFT JOIN public.profiles p ON p.id = op.traffic_owner
LEFT JOIN public.user_level_status uls ON uls.user_id = op.traffic_owner
LEFT JOIN public.profiles d ON d.id = p.director_id
GROUP BY p.director_id, d.full_name, d.email, op.traffic_owner, p.full_name, p.email, uls.current_level;

-- 8. Validation report
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
  -- TEST 1: invalid owner FK
  SELECT count(*) INTO t1
  FROM public.leads l
  WHERE l.traffic_owner IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = l.traffic_owner);

  -- TEST 2: level violation (any owner not eligible)
  SELECT count(*) INTO t2
  FROM public.leads l
  WHERE l.traffic_owner IS NOT NULL
    AND NOT public.is_eligible_traffic_owner(l.traffic_owner);

  -- TEST 3: admin leak (any user with role 'admin' that is NOT also eligible operator)
  SELECT array_agg(ur.user_id) INTO v_admin_ids
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
    AND NOT public.is_eligible_traffic_owner(ur.user_id);

  IF v_admin_ids IS NULL THEN
    t3 := 0;
  ELSE
    SELECT count(*) INTO t3 FROM public.leads l WHERE l.traffic_owner = ANY(v_admin_ids);
  END IF;

  -- TEST 4: operators without director_id
  SELECT count(*) INTO t4
  FROM public.profiles p
  JOIN public.user_level_status uls ON uls.user_id = p.id
  WHERE uls.current_level >= 6 AND p.director_id IS NULL;

  -- TEST 5: completeness
  t5 := public.ors_completeness_score();

  -- TEST 6: team visibility (distinct directors with at least one operator visible)
  SELECT count(*) INTO t6 FROM (
    SELECT director_owner_id FROM public.operator_team_performance
    WHERE director_owner_id IS NOT NULL
    GROUP BY director_owner_id
  ) x;

  -- TEST 7: traceability — any one lead with full chain owner→director→revenue
  SELECT to_jsonb(row_to_json(z)) INTO t7
  FROM (
    SELECT l.id AS lead_id, l.traffic_owner, p.director_id AS director_owner_id,
           COALESCE((SELECT SUM(amount_eur) FROM public.deals d WHERE d.lead_id = l.id), 0) AS deal_value
    FROM public.leads l
    JOIN public.profiles p ON p.id = l.traffic_owner
    WHERE l.traffic_owner IS NOT NULL AND p.director_id IS NOT NULL
    LIMIT 1
  ) z;

  -- Counts
  SELECT count(*) INTO v_op_count
  FROM public.user_level_status WHERE current_level >= 6;
  SELECT count(*) INTO v_dir_count
  FROM public.profiles p
  WHERE public.is_eligible_director(p.id);

  -- Verdict
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

-- 9. Grants
GRANT EXECUTE ON FUNCTION public.is_eligible_director(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operator_director(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ors_operator_directors_missing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ors_invalid_directors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ors_validation_report() TO authenticated;
GRANT SELECT ON public.operator_performance_v2 TO authenticated;
GRANT SELECT ON public.operator_team_performance TO authenticated;
