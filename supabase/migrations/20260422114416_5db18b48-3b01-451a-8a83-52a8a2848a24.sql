
-- A/B test assignment column on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS retargeting_ab_variants jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Helper view: per-action/variant send + booking conversion
CREATE OR REPLACE VIEW public.view_retargeting_ab_results AS
WITH sends AS (
  SELECT
    (payload->>'action')      AS action,
    (payload->>'variant')     AS variant,
    entity_id                 AS lead_id,
    MIN(created_at)           AS sent_at
  FROM public.outbound_events
  WHERE event_name LIKE 'retargeting.%'
    AND payload ? 'variant'
  GROUP BY 1,2,3
)
SELECT
  s.action,
  s.variant,
  COUNT(*)                                                  AS sends,
  COUNT(*) FILTER (WHERE l.has_booking)                     AS bookings,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE l.has_booking) / NULLIF(COUNT(*),0),
    2
  )                                                         AS booking_rate_pct
FROM sends s
JOIN public.leads l ON l.id = s.lead_id
GROUP BY s.action, s.variant
ORDER BY s.action, s.variant;

GRANT SELECT ON public.view_retargeting_ab_results TO authenticated;
