
-- Add outcome tagging to dispatch log
ALTER TABLE public.communication_dispatch_log
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_tagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_window_hours int NOT NULL DEFAULT 72;

ALTER TABLE public.communication_dispatch_log
  DROP CONSTRAINT IF EXISTS communication_dispatch_log_outcome_check;

ALTER TABLE public.communication_dispatch_log
  ADD CONSTRAINT communication_dispatch_log_outcome_check
  CHECK (outcome IS NULL OR outcome = ANY (ARRAY[
    'booked','rescheduled','showed','closed','replied','clicked','no_response','no_show','pending'
  ]));

CREATE INDEX IF NOT EXISTS idx_comm_dispatch_outcome
  ON public.communication_dispatch_log (outcome, dispatched_at DESC);

-- Outcome classification: derives single best outcome from conversion events
-- in [dispatched_at, dispatched_at + outcome_window_hours]
CREATE OR REPLACE FUNCTION public.classify_dispatch_outcome(_dispatch_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
  has_close boolean := false;
  has_show boolean := false;
  has_reschedule boolean := false;
  has_booking boolean := false;
  has_reply boolean := false;
  has_click boolean := false;
  window_end timestamptz;
  result text;
BEGIN
  SELECT id, dispatched_at, outcome_window_hours, status
    INTO d
    FROM public.communication_dispatch_log
   WHERE id = _dispatch_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF d.status <> 'sent' THEN RETURN d.status; END IF;

  window_end := d.dispatched_at + make_interval(hours => d.outcome_window_hours);

  SELECT
    bool_or(conversion_type = 'close'),
    bool_or(conversion_type = 'show'),
    bool_or(conversion_type = 'reschedule'),
    bool_or(conversion_type = 'booking'),
    bool_or(conversion_type = 'reply'),
    bool_or(conversion_type = 'click')
  INTO has_close, has_show, has_reschedule, has_booking, has_reply, has_click
  FROM public.communication_conversion_events
  WHERE dispatch_log_id = _dispatch_id
    AND occurred_at BETWEEN d.dispatched_at AND window_end;

  -- Priority: close > show > reschedule > booking > reply > click > no_show/no_response/pending
  IF has_close THEN result := 'closed';
  ELSIF has_show THEN result := 'showed';
  ELSIF has_reschedule THEN result := 'rescheduled';
  ELSIF has_booking THEN result := 'booked';
  ELSIF has_reply THEN result := 'replied';
  ELSIF has_click THEN result := 'clicked';
  ELSE
    -- No engagement signals
    IF window_end < now() THEN
      -- Window closed → terminal no-engagement
      -- If this was a reminder-class touchpoint and no show signal arrived → no_show
      IF EXISTS (
        SELECT 1 FROM public.communication_dispatch_log x
         WHERE x.id = _dispatch_id
           AND (x.event_key ILIKE '%reminder%' OR x.event_key ILIKE '%no_show%' OR x.phase = 'pre_call')
      ) THEN
        result := 'no_show';
      ELSE
        result := 'no_response';
      END IF;
    ELSE
      result := 'pending';
    END IF;
  END IF;

  UPDATE public.communication_dispatch_log
     SET outcome = result,
         outcome_tagged_at = now()
   WHERE id = _dispatch_id;

  RETURN result;
END;
$$;

-- Trigger: re-classify dispatch when a conversion event lands
CREATE OR REPLACE FUNCTION public.trg_reclassify_on_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dispatch_log_id IS NOT NULL THEN
    PERFORM public.classify_dispatch_outcome(NEW.dispatch_log_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reclassify_dispatch_on_conversion
  ON public.communication_conversion_events;

CREATE TRIGGER reclassify_dispatch_on_conversion
AFTER INSERT ON public.communication_conversion_events
FOR EACH ROW EXECUTE FUNCTION public.trg_reclassify_on_conversion();

-- Batch sweep: tag still-pending dispatches whose window has closed
CREATE OR REPLACE FUNCTION public.sweep_dispatch_outcomes(_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id
      FROM public.communication_dispatch_log
     WHERE status = 'sent'
       AND (outcome IS NULL OR outcome = 'pending')
       AND dispatched_at + make_interval(hours => outcome_window_hours) < now()
     ORDER BY dispatched_at ASC
     LIMIT _limit
  LOOP
    PERFORM public.classify_dispatch_outcome(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Aggregate view: outcome distribution per template/variant
CREATE OR REPLACE VIEW public.v_communication_outcome_distribution AS
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
