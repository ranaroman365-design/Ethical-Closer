CREATE OR REPLACE VIEW public.operator_team_performance AS
SELECT
  p.id AS traffic_owner,
  COALESCE(booking_counts.bookings, 0)::numeric AS bookings,
  COALESCE(show_counts.shows, 0)::numeric AS shows,
  COALESCE(deal_counts.deals, 0)::numeric AS deals,
  CASE
    WHEN COALESCE(show_counts.shows, 0) = 0 THEN 0
    ELSE ROUND((COALESCE(deal_counts.deals, 0)::numeric / show_counts.shows::numeric) * 100, 1)
  END AS close_rate
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS bookings
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= now() - interval '30 days'
) booking_counts ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS shows
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= now() - interval '30 days'
    AND a.attendance_flag = true
) show_counts ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::numeric AS deals
  FROM public.appointments a
  WHERE (a.setter_id = p.id OR a.closer_id = p.id OR a.assigned_operator_id = p.id)
    AND a.starts_at >= now() - interval '30 days'
    AND a.outcome = 'won'
) deal_counts ON true;

GRANT SELECT ON public.operator_team_performance TO authenticated;
GRANT SELECT ON public.operator_team_performance TO anon;