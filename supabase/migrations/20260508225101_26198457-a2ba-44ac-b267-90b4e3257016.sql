DROP VIEW IF EXISTS public.revenue_operator_profile_public CASCADE;
DROP VIEW IF EXISTS public.revenue_operator_profile CASCADE;

CREATE VIEW public.revenue_operator_profile AS
WITH
calls_agg AS (
  SELECT
    COALESCE(c.revenue_owner_user_id, c.user_id) AS user_id,
    COUNT(*) FILTER (WHERE c.booked_at IS NOT NULL) AS lifetime_bookings,
    COUNT(*) FILTER (WHERE c.showed_at IS NOT NULL) AS lifetime_shows,
    COUNT(*) FILTER (WHERE c.no_show_at IS NOT NULL) AS lifetime_no_shows,
    COUNT(*) AS lifetime_calls,
    COUNT(*) FILTER (WHERE c.result IN ('won','closed_won') AND c.closed_at IS NOT NULL) AS lifetime_closings,
    COUNT(*) FILTER (WHERE c.closed_at IS NOT NULL AND c.result NOT IN ('won','closed_won')) AS lifetime_no_closes,
    COALESCE(SUM(c.revenue) FILTER (WHERE c.result IN ('won','closed_won')), 0)::numeric AS lifetime_revenue_closed,
    (ARRAY_AGG(c.id ORDER BY c.created_at DESC))[1:10] AS latest_call_ids
  FROM public.calls c
  WHERE COALESCE(c.is_simulation, false) = false
    AND COALESCE(c.revenue_owner_user_id, c.user_id) IS NOT NULL
  GROUP BY COALESCE(c.revenue_owner_user_id, c.user_id)
),
comm_agg AS (
  SELECT
    cm.user_id,
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.reversed_at IS NULL), 0)::numeric AS lifetime_commission_earned,
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.reversed_at IS NOT NULL), 0)::numeric AS lifetime_revenue_reversed,
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.source_type = 'override' AND cm.reversed_at IS NULL), 0)::numeric AS lifetime_override_revenue,
    (ARRAY_AGG(cm.id ORDER BY cm.created_at DESC))[1:10] AS commission_ids
  FROM public.commissions cm
  WHERE COALESCE(cm.is_simulation, false) = false
  GROUP BY cm.user_id
),
pay_agg AS (
  SELECT
    c.revenue_owner_user_id AS user_id,
    COALESCE(SUM(
      CASE
        WHEN pe.metadata ? 'amount' AND (pe.metadata->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN (pe.metadata->>'amount')::numeric
        ELSE 0
      END
    ), 0)::numeric AS lifetime_revenue_collected
  FROM public.payment_events pe
  JOIN public.calls c ON c.payment_link_id = pe.payment_link_id
  WHERE c.revenue_owner_user_id IS NOT NULL
    AND COALESCE(c.is_simulation, false) = false
  GROUP BY c.revenue_owner_user_id
),
snap_agg AS (
  SELECT
    s.user_id,
    COUNT(*) AS kpi_snapshot_count,
    MAX(s.created_at) AS last_kpi_snapshot_at,
    (AVG(s.revenue_closed)  FILTER (WHERE s.week_start >= (CURRENT_DATE - INTERVAL '8 weeks')))::numeric AS revenue_trend_8w,
    (AVG(s.show_rate)       FILTER (WHERE s.week_start >= (CURRENT_DATE - INTERVAL '8 weeks')))::numeric AS show_rate_trend_8w,
    (AVG(s.closing_rate)    FILTER (WHERE s.week_start >= (CURRENT_DATE - INTERVAL '8 weeks')))::numeric AS close_rate_trend_8w,
    (STDDEV(s.revenue_closed) FILTER (WHERE s.week_start >= (CURRENT_DATE - INTERVAL '8 weeks')))::numeric AS kpi_trend_stability
  FROM public.kpi_snapshots s
  GROUP BY s.user_id
),
ver_agg AS (
  SELECT v.user_id, COUNT(*) AS verification_count, MAX(v.verified_at) AS latest_verification_at,
    (ARRAY_AGG(v.id ORDER BY v.created_at DESC))[1:10] AS verification_ids
  FROM public.kpi_verifications v GROUP BY v.user_id
),
proof_agg AS (
  SELECT v.user_id, COUNT(*) AS proof_count
  FROM public.kpi_proof_files pf
  JOIN public.kpi_verifications v ON v.id = pf.verification_id
  GROUP BY v.user_id
),
cert_log_agg AS (
  SELECT user_id, COUNT(*) AS certification_log_count,
    (ARRAY_AGG(id ORDER BY created_at DESC))[1:10] AS certification_log_ids
  FROM public.operator_certification_log GROUP BY user_id
),
prom_agg AS (
  SELECT user_id, COUNT(*) AS promotion_evaluation_count, MAX(created_at) AS latest_promotion_evaluation_at,
    (ARRAY_AGG(threshold_passed ORDER BY created_at DESC))[1] AS latest_promotion_result,
    (ARRAY_AGG(id ORDER BY created_at DESC))[1:10] AS promotion_evaluation_ids
  FROM public.promotion_evaluations GROUP BY user_id
),
hist_agg AS (
  SELECT user_id, COUNT(*) AS promotion_history_count, MAX(valid_from) AS current_level_since
  FROM public.operator_level_history GROUP BY user_id
),
lead_agg AS (
  SELECT COALESCE(closer_id, setter_id, owner_id) AS user_id,
    (ARRAY_AGG(id ORDER BY created_at DESC))[1:10] AS latest_lead_ids
  FROM public.leads
  WHERE COALESCE(is_simulation, false) = false
    AND COALESCE(closer_id, setter_id, owner_id) IS NOT NULL
  GROUP BY COALESCE(closer_id, setter_id, owner_id)
),
team_agg AS (
  SELECT operator_id AS user_id,
    COUNT(DISTINCT team_member_id) AS team_member_count,
    COALESCE(SUM(revenue_total), 0)::numeric AS team_revenue,
    AVG(NULLIF(close_rate, 0))::numeric AS team_close_rate,
    AVG(CASE WHEN booked_count > 0 THEN showed_count::numeric / booked_count END)::numeric AS team_show_rate
  FROM public.operator_team_performance GROUP BY operator_id
),
role_agg AS (
  SELECT user_id, MAX(role::text) AS role_label FROM public.user_roles GROUP BY user_id
)
SELECT
  p.id AS user_id,
  p.email,
  p.full_name,
  COALESCE(uls.current_level::text, cs.current_level::text) AS current_level,
  p.business_stage,
  COALESCE(uls.current_role_label, r.role_label) AS role_label,
  p.created_at,

  p.certification_status,
  cs.certified_at,
  p.certified AS legacy_certified,
  COALESCE(va.verification_count, 0) AS verification_count,
  COALESCE(pa.proof_count, 0) AS proof_count,
  COALESCE(cla.certification_log_count, 0) AS certification_log_count,
  va.latest_verification_at,
  CASE
    WHEN COALESCE(pa.proof_count, 0) = 0 AND COALESCE(va.verification_count, 0) = 0 THEN 'T0_COMPUTED'
    WHEN COALESCE(pa.proof_count, 0) = 0 AND COALESCE(va.verification_count, 0) > 0 THEN 'T1_SELF_REPORTED'
    WHEN COALESCE(pa.proof_count, 0) > 0 AND COALESCE(cla.certification_log_count, 0) = 0 THEN 'T2_PROOF_UPLOADED'
    WHEN COALESCE(cla.certification_log_count, 0) > 0 AND COALESCE(cs.admin_override, false) = false THEN 'T3_REVIEWED'
    WHEN COALESCE(cs.admin_override, false) = true THEN 'T4_CERTIFIED'
    ELSE 'T0_COMPUTED'
  END AS verification_tier,
  CASE
    WHEN COALESCE(va.verification_count, 0) = 0 THEN 0::numeric
    ELSE LEAST(100, (COALESCE(pa.proof_count, 0) * 25 + COALESCE(cla.certification_log_count, 0) * 25))::numeric
  END AS verification_confidence,

  COALESCE(pra.promotion_evaluation_count, 0) AS promotion_evaluation_count,
  pra.latest_promotion_evaluation_at,
  pra.latest_promotion_result,
  COALESCE(ha.promotion_history_count, 0) AS promotion_history_count,
  ha.current_level_since,

  COALESCE(ca.lifetime_calls, 0) AS lifetime_calls,
  COALESCE(ca.lifetime_shows, 0) AS lifetime_shows,
  COALESCE(ca.lifetime_bookings, 0) AS lifetime_bookings,
  COALESCE(ca.lifetime_closings, 0) AS lifetime_closings,
  COALESCE(ca.lifetime_no_shows, 0) AS lifetime_no_shows,
  COALESCE(ca.lifetime_no_closes, 0) AS lifetime_no_closes,

  COALESCE(ca.lifetime_revenue_closed, 0) AS lifetime_revenue_closed,
  COALESCE(payg.lifetime_revenue_collected, 0) AS lifetime_revenue_collected,
  COALESCE(coa.lifetime_revenue_reversed, 0) AS lifetime_revenue_reversed,
  COALESCE(coa.lifetime_commission_earned, 0) AS lifetime_commission_earned,
  COALESCE(coa.lifetime_override_revenue, 0) AS lifetime_override_revenue,

  mk.show_rate,
  mk.closing_rate,
  mk.revenue_closed AS kpi_revenue_closed,
  mk.earnings_per_call,
  mk.storno_rate,
  mk.follow_up_rate,
  mk.crm_hygiene_score,
  mk.response_time,
  mk.qualification_accuracy,
  NULL::numeric AS booking_rate,
  NULL::numeric AS attendance_reliability,

  COALESCE(sa.kpi_snapshot_count, 0) AS kpi_snapshot_count,
  sa.last_kpi_snapshot_at,
  sa.revenue_trend_8w,
  sa.show_rate_trend_8w,
  sa.close_rate_trend_8w,
  sa.kpi_trend_stability,

  ta.team_revenue,
  ta.team_member_count,
  ta.team_show_rate,
  ta.team_close_rate,
  COALESCE(coa.lifetime_override_revenue, 0) AS override_revenue_earned,

  jsonb_build_object(
    'commission_ids',           COALESCE(coa.commission_ids,           ARRAY[]::uuid[]),
    'certification_log_ids',    COALESCE(cla.certification_log_ids,    ARRAY[]::uuid[]),
    'verification_ids',         COALESCE(va.verification_ids,          ARRAY[]::uuid[]),
    'promotion_evaluation_ids', COALESCE(pra.promotion_evaluation_ids, ARRAY[]::uuid[]),
    'latest_call_ids',          COALESCE(ca.latest_call_ids,           ARRAY[]::uuid[]),
    'latest_lead_ids',          COALESCE(la.latest_lead_ids,           ARRAY[]::uuid[])
  ) AS audit_refs

FROM public.profiles p
LEFT JOIN public.user_level_status   uls ON uls.user_id = p.id
LEFT JOIN public.certification_status cs ON cs.user_id  = p.id
LEFT JOIN public.member_kpis         mk  ON mk.user_id  = p.id
LEFT JOIN role_agg                   r   ON r.user_id   = p.id
LEFT JOIN calls_agg                  ca  ON ca.user_id  = p.id
LEFT JOIN comm_agg                   coa ON coa.user_id = p.id
LEFT JOIN pay_agg                    payg ON payg.user_id = p.id
LEFT JOIN snap_agg                   sa  ON sa.user_id  = p.id
LEFT JOIN ver_agg                    va  ON va.user_id  = p.id
LEFT JOIN proof_agg                  pa  ON pa.user_id  = p.id
LEFT JOIN cert_log_agg               cla ON cla.user_id = p.id
LEFT JOIN prom_agg                   pra ON pra.user_id = p.id
LEFT JOIN hist_agg                   ha  ON ha.user_id  = p.id
LEFT JOIN lead_agg                   la  ON la.user_id  = p.id
LEFT JOIN team_agg                   ta  ON ta.user_id  = p.id
WHERE COALESCE(p.is_simulation_user, false) = false
  AND COALESCE(p.is_test_user, false) = false;

COMMENT ON VIEW public.revenue_operator_profile IS
  'Revenue Operator Canon S1: read-only, additive, null-safe canonical track record per user. Rollback: DROP VIEW.';

CREATE VIEW public.revenue_operator_profile_public AS
SELECT
  user_id,
  full_name,
  role_label,
  current_level,
  certification_status,
  verification_tier,
  jsonb_build_object(
    'show_rate',     show_rate,
    'closing_rate',  closing_rate,
    'response_time', response_time
  ) AS public_kpi_summary,
  jsonb_build_object(
    'lifetime_calls',    lifetime_calls,
    'lifetime_shows',    lifetime_shows,
    'lifetime_closings', lifetime_closings
  ) AS public_track_record_summary,
  CASE WHEN legacy_certified THEN ARRAY['certified'] ELSE ARRAY[]::text[] END
    || CASE WHEN verification_tier IN ('T3_REVIEWED','T4_CERTIFIED') THEN ARRAY['verified'] ELSE ARRAY[]::text[] END
    AS verified_badges
FROM public.revenue_operator_profile;

COMMENT ON VIEW public.revenue_operator_profile_public IS
  'Revenue Operator Canon S1 (public): redacted reputation layer. No audit IDs, no commission, no revenue values.';