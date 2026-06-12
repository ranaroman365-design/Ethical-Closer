CREATE OR REPLACE FUNCTION public.set_email_vt(
  queue_name text,
  message_id bigint,
  vt_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  IF queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Invalid queue name: %', queue_name;
  END IF;
  IF vt_seconds < 0 OR vt_seconds > 3600 THEN
    RAISE EXCEPTION 'vt_seconds out of range: %', vt_seconds;
  END IF;
  PERFORM pgmq.set_vt(queue_name, message_id, vt_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.set_email_vt(text, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_email_vt(text, bigint, integer) TO service_role;

COMMENT ON FUNCTION public.set_email_vt IS 'Extends pgmq visibility timeout for an email queue message. Used by process-email-queue dispatcher for per-message exponential backoff.';