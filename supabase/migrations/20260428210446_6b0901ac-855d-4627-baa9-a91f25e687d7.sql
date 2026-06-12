
DROP VIEW IF EXISTS public.v_communication_outcome_distribution;

CREATE VIEW public.v_communication_outcome_distribution
WITH (security_invoker = true) AS
SELECT
  event_key,
  template_key,
  COALESCE(variant_key, 'control') AS variant_key,
  COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
  COUNT(*) FILTER (WHERE outcome = 'closed') AS closed_count,
  COUNT(*) FILTER (WHERE outcome = 'showed') AS showed_count,
  COUNT(*) FILTER (WHERE outcome = 'booked') AS booked_count,
  COUNT(*) FILTER (WHERE outcome = 'rescheduled') AS rescheduled_count,
  COUNT(*) FILTER (WHERE outcome = 'replied') AS replied_count,
  COUNT(*) FILTER (WHERE outcome = 'clicked') AS clicked_count,
  COUNT(*) FILTER (WHERE outcome = 'no_response') AS no_response_count,
  COUNT(*) FILTER (WHERE outcome = 'no_show') AS no_show_count,
  COUNT(*) FILTER (WHERE outcome = 'pending') AS pending_count,
  MAX(dispatched_at) AS last_sent_at
FROM public.communication_dispatch_log
WHERE template_key IS NOT NULL
GROUP BY event_key, template_key, COALESCE(variant_key, 'control');

GRANT SELECT ON public.v_communication_outcome_distribution TO authenticated;
