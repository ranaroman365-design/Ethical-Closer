-- View: latest email delivery status per lead (joined by lowercased email).
-- One row per lead; NULL columns mean no email was ever attempted.
CREATE OR REPLACE VIEW public.v_lead_email_delivery_status AS
WITH latest_per_email AS (
  SELECT DISTINCT ON (LOWER(recipient_email))
    LOWER(recipient_email) AS email_norm,
    COALESCE(final_delivery_status, status) AS delivery_status,
    delivery_resolved_at,
    template_name,
    error_message,
    created_at AS last_event_at
  FROM public.email_send_log
  WHERE recipient_email IS NOT NULL
  ORDER BY LOWER(recipient_email), created_at DESC
)
SELECT
  l.id AS lead_id,
  l.email AS lead_email,
  e.delivery_status,
  e.delivery_resolved_at,
  e.template_name AS last_template_name,
  e.error_message AS last_error_message,
  e.last_event_at
FROM public.leads l
LEFT JOIN latest_per_email e
  ON e.email_norm = LOWER(l.email);

COMMENT ON VIEW public.v_lead_email_delivery_status IS
  'Latest email delivery outcome per lead. delivery_status is one of pending|sent|delivered|bounced|complained|unsubscribed|suppressed|failed|dlq, or NULL if no email was ever sent to this address.';

GRANT SELECT ON public.v_lead_email_delivery_status TO authenticated, service_role;