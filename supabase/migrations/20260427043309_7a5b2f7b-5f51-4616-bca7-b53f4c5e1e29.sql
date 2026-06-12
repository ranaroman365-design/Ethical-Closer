
-- ============================================================================
-- Soft-Yes path analytics — separates the masterclass ladder strictly via
-- payload->>'intent' = 'masterclass'. All other traffic is treated as hard_yes.
-- ============================================================================

-- Drop existing if re-running
DROP VIEW IF EXISTS public.v_softyes_funnel_conversion;
DROP VIEW IF EXISTS public.v_ladder_cta_clicks;

-- ----------------------------------------------------------------------------
-- 1) Click-through rate per ladder step
--    Joins home_view (denominator) per session/visitor against home_cta_click
--    grouped by location + cta_type. Soft-yes is identified by intent.
-- ----------------------------------------------------------------------------
CREATE VIEW public.v_ladder_cta_clicks
WITH (security_invoker = true) AS
WITH clicks AS (
  SELECT
    COALESCE(NULLIF(payload->>'location', ''), 'unknown') AS location,
    COALESCE(NULLIF(payload->>'cta_type', ''), 'unknown') AS cta_type,
    CASE WHEN payload->>'intent' = 'masterclass' THEN 'soft_yes' ELSE 'hard_yes' END AS path,
    COALESCE(payload->>'experiment_id', 'home_root_v1') AS experiment_id,
    COALESCE(payload->>'variant', '') AS variant,
    date_trunc('day', created_at) AS day,
    id
  FROM public.event_logs
  WHERE event_name = 'home_cta_click'
),
views AS (
  -- Hero/section/footer view events fire when each ladder section is rendered.
  -- Fallback to home_view if no per-section view event exists yet.
  SELECT
    COALESCE(NULLIF(payload->>'location', ''), 'home') AS location,
    date_trunc('day', created_at) AS day,
    COUNT(*) AS view_count
  FROM public.event_logs
  WHERE event_name IN ('home_view', 'home_section_view')
  GROUP BY 1, 2
)
SELECT
  c.day,
  c.location,
  c.cta_type,
  c.path,
  c.experiment_id,
  c.variant,
  COUNT(*) AS clicks,
  COALESCE(MAX(v.view_count), 0) AS section_views,
  ROUND(
    100.0 * COUNT(*)::numeric
      / NULLIF(MAX(v.view_count), 0),
    2
  ) AS click_through_rate_pct
FROM clicks c
LEFT JOIN views v
  ON v.day = c.day
 AND v.location = c.location
GROUP BY c.day, c.location, c.cta_type, c.path, c.experiment_id, c.variant
ORDER BY c.day DESC, c.location, c.cta_type, c.path;

COMMENT ON VIEW public.v_ladder_cta_clicks IS
  'Per-day click-through rate for each CTA ladder step. path = soft_yes when payload->>intent = ''masterclass'', else hard_yes.';

-- ----------------------------------------------------------------------------
-- 2) Funnel conversion + lift between Soft-Yes and Hard-Yes paths
--    Stages: quiz_started → quiz_completed → booking_completed
--    Soft-Yes = events tagged with intent=masterclass (sticky from ?intent).
-- ----------------------------------------------------------------------------
CREATE VIEW public.v_softyes_funnel_conversion
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    date_trunc('day', created_at) AS day,
    event_name,
    CASE WHEN payload->>'intent' = 'masterclass' THEN 'soft_yes' ELSE 'hard_yes' END AS path,
    COALESCE(payload->>'experiment_id', '') AS experiment_id,
    COALESCE(payload->>'variant', '') AS variant
  FROM public.event_logs
  WHERE event_name IN (
    'home_cta_click',          -- ladder entry point (denominator)
    'quiz_view',
    'quiz_started',
    'quiz_completed',
    'masterclass_teaser_view',
    'booking_completed',
    'masterclass_unlock_click'
  )
),
agg AS (
  SELECT
    day,
    path,
    experiment_id,
    variant,
    COUNT(*) FILTER (WHERE event_name = 'home_cta_click')         AS ladder_clicks,
    COUNT(*) FILTER (WHERE event_name = 'quiz_view')              AS quiz_views,
    COUNT(*) FILTER (WHERE event_name = 'quiz_started')           AS quiz_starts,
    COUNT(*) FILTER (WHERE event_name = 'quiz_completed')         AS quiz_completions,
    COUNT(*) FILTER (WHERE event_name = 'masterclass_teaser_view') AS teaser_views,
    COUNT(*) FILTER (WHERE event_name = 'masterclass_unlock_click') AS unlock_clicks,
    COUNT(*) FILTER (WHERE event_name = 'booking_completed')      AS bookings
  FROM base
  GROUP BY 1, 2, 3, 4
),
with_rates AS (
  SELECT
    *,
    ROUND(100.0 * quiz_starts::numeric      / NULLIF(quiz_views, 0), 2)        AS start_rate_pct,
    ROUND(100.0 * quiz_completions::numeric / NULLIF(quiz_starts, 0), 2)       AS completion_rate_pct,
    ROUND(100.0 * bookings::numeric         / NULLIF(quiz_completions, 0), 2)  AS booking_rate_pct,
    ROUND(100.0 * bookings::numeric         / NULLIF(quiz_views, 0), 2)        AS overall_conv_pct
  FROM agg
)
SELECT
  w.day,
  w.path,
  w.experiment_id,
  w.variant,
  w.ladder_clicks,
  w.quiz_views,
  w.quiz_starts,
  w.quiz_completions,
  w.teaser_views,
  w.unlock_clicks,
  w.bookings,
  w.start_rate_pct,
  w.completion_rate_pct,
  w.booking_rate_pct,
  w.overall_conv_pct,
  -- Absolute lift vs the hard_yes path on the same day/experiment/variant
  w.overall_conv_pct - h.overall_conv_pct AS lift_overall_pp,
  w.start_rate_pct   - h.start_rate_pct   AS lift_start_pp,
  w.booking_rate_pct - h.booking_rate_pct AS lift_booking_pp,
  -- Relative lift % (soft_yes / hard_yes − 1) * 100
  ROUND(
    100.0 * (w.overall_conv_pct - h.overall_conv_pct)
      / NULLIF(h.overall_conv_pct, 0),
    1
  ) AS lift_overall_rel_pct
FROM with_rates w
LEFT JOIN with_rates h
  ON h.day = w.day
 AND h.experiment_id = w.experiment_id
 AND h.variant = w.variant
 AND h.path = 'hard_yes'
 AND w.path = 'soft_yes'
ORDER BY w.day DESC, w.path, w.experiment_id, w.variant;

COMMENT ON VIEW public.v_softyes_funnel_conversion IS
  'Daily funnel conversion + lift, split by path (soft_yes via intent=masterclass vs hard_yes). Lift columns are populated only on soft_yes rows.';

-- ----------------------------------------------------------------------------
-- Access — admin-only via existing has_role helper
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.v_ladder_cta_clicks FROM anon, authenticated;
REVOKE ALL ON public.v_softyes_funnel_conversion FROM anon, authenticated;
GRANT SELECT ON public.v_ladder_cta_clicks TO authenticated;
GRANT SELECT ON public.v_softyes_funnel_conversion TO authenticated;
