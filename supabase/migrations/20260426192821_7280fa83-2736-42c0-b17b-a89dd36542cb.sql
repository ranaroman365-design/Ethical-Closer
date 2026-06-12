-- 1. Add explicit delivery resolution columns
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS final_delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_resolved_at timestamptz;

-- Constrain values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_send_log_final_delivery_status_chk'
  ) THEN
    ALTER TABLE public.email_send_log
      ADD CONSTRAINT email_send_log_final_delivery_status_chk
      CHECK (final_delivery_status IS NULL OR final_delivery_status IN
        ('delivered','bounced','complained','unsubscribed','failed','unknown'));
  END IF;
END$$;

-- Index for drop-off queries
CREATE INDEX IF NOT EXISTS idx_email_send_log_final_delivery_status
  ON public.email_send_log (final_delivery_status, created_at DESC)
  WHERE final_delivery_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message_id
  ON public.email_send_log (message_id)
  WHERE message_id IS NOT NULL;

-- 2. Backfill existing rows so historical data is queryable
UPDATE public.email_send_log
SET final_delivery_status = 'delivered',
    delivery_resolved_at  = created_at
WHERE status = 'sent' AND final_delivery_status IS NULL;

UPDATE public.email_send_log
SET final_delivery_status = 'bounced',
    delivery_resolved_at  = created_at
WHERE status = 'bounced' AND final_delivery_status IS NULL;

UPDATE public.email_send_log
SET final_delivery_status = 'complained',
    delivery_resolved_at  = created_at
WHERE status = 'complained' AND final_delivery_status IS NULL;

UPDATE public.email_send_log
SET final_delivery_status = 'unsubscribed',
    delivery_resolved_at  = created_at
WHERE status = 'suppressed' AND final_delivery_status IS NULL;

UPDATE public.email_send_log
SET final_delivery_status = 'failed',
    delivery_resolved_at  = created_at
WHERE status IN ('failed','dlq') AND final_delivery_status IS NULL;

-- 3. Drop-off view: provider accepted the send (sent) but it later bounced/complained.
-- One row per message_id where the latest known outcome ≠ delivered.
CREATE OR REPLACE VIEW public.v_email_delivery_dropoffs AS
WITH latest AS (
  SELECT DISTINCT ON (message_id)
    message_id,
    template_name,
    recipient_email,
    status,
    final_delivery_status,
    error_message,
    created_at,
    delivery_resolved_at
  FROM public.email_send_log
  WHERE message_id IS NOT NULL
  ORDER BY message_id, created_at DESC
)
SELECT *
FROM latest
WHERE final_delivery_status IN ('bounced','complained','failed')
   OR (status = 'sent' AND final_delivery_status IS NULL);

-- Lock down view to admins only (uses existing has_role helper)
REVOKE ALL ON public.v_email_delivery_dropoffs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_email_delivery_dropoffs TO service_role;
