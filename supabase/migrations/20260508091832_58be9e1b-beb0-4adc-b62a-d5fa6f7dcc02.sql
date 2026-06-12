
-- Function: Find duplicate emails by recipient + template + appointment_id
CREATE OR REPLACE FUNCTION public.get_duplicate_sends_24h(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(
  recipient_email text,
  template_name text,
  appointment_id text,
  count bigint,
  message_ids text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    e.recipient_email,
    e.template_name,
    (e.metadata->>'appointment_id')::text AS appointment_id,
    count(DISTINCT e.message_id) AS count,
    array_agg(DISTINCT e.message_id) AS message_ids
  FROM email_send_log e
  WHERE e.created_at >= p_start
    AND e.created_at <= p_end
    AND e.status = 'sent'
  GROUP BY e.recipient_email, e.template_name, (e.metadata->>'appointment_id')::text
  HAVING count(DISTINCT e.message_id) > 1;
$$;

-- Function: Find duplicate reminders by appointment_id + stage
CREATE OR REPLACE FUNCTION public.get_duplicate_reminders_24h(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(
  appointment_id text,
  stage text,
  count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (e.metadata->>'appointment_id')::text AS appointment_id,
    e.template_name AS stage,
    count(DISTINCT e.message_id) AS count
  FROM email_send_log e
  WHERE e.created_at >= p_start
    AND e.created_at <= p_end
    AND e.status = 'sent'
    AND e.template_name ILIKE '%reminder%'
  GROUP BY (e.metadata->>'appointment_id')::text, e.template_name
  HAVING count(DISTINCT e.message_id) > 1;
$$;

-- Function: Find duplicate no-show recovery by appointment_id
CREATE OR REPLACE FUNCTION public.get_duplicate_noshow_recovery_24h(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(
  appointment_id text,
  count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (e.metadata->>'appointment_id')::text AS appointment_id,
    count(DISTINCT e.message_id) AS count
  FROM email_send_log e
  WHERE e.created_at >= p_start
    AND e.created_at <= p_end
    AND e.status = 'sent'
    AND e.template_name ILIKE '%no%show%'
  GROUP BY (e.metadata->>'appointment_id')::text
  HAVING count(DISTINCT e.message_id) > 1;
$$;
