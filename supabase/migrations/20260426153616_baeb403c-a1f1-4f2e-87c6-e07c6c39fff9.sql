CREATE OR REPLACE FUNCTION public.tg_enqueue_call_transcription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_terminal_statuses text[] := ARRAY['completed','closed_won','closed_lost','no_show'];
BEGIN
  -- Only act when transitioning INTO a terminal status from a non-terminal one
  IF NEW.status = ANY(v_terminal_statuses)
     AND (OLD.status IS NULL OR NOT (OLD.status = ANY(v_terminal_statuses)))
     AND COALESCE(NEW.is_simulation, false) = false THEN

    IF NEW.transcript IS NOT NULL AND length(NEW.transcript) > 50 THEN
      RETURN NEW;
    END IF;

    IF NEW.file_url IS NOT NULL AND length(NEW.file_url) > 0 THEN
      v_status := 'pending';
    ELSE
      v_status := 'waiting_for_audio';
    END IF;

    INSERT INTO public.pending_call_transcriptions (call_id, status)
    VALUES (NEW.id, v_status)
    ON CONFLICT (call_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Also broaden the 48h fallback to all terminal statuses
CREATE OR REPLACE FUNCTION public.auto_close_missing_outcomes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT c.id, c.user_id
    FROM public.calls c
    WHERE c.status IN ('completed','closed_won','closed_lost','no_show')
      AND COALESCE(c.is_simulation, false) = false
      AND c.closed_at IS NOT NULL
      AND c.closed_at < now() - interval '48 hours'
      AND NOT EXISTS (SELECT 1 FROM public.call_outcomes co WHERE co.call_id = c.id)
  LOOP
    INSERT INTO public.call_outcomes (call_id, user_id, outcome, comment)
    VALUES (r.id, r.user_id, 'unknown', 'system_fallback: no outcome logged within 48h');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Backfill: enqueue all existing terminal calls without transcript
INSERT INTO public.pending_call_transcriptions (call_id, status)
SELECT c.id,
       CASE WHEN c.file_url IS NOT NULL AND length(c.file_url) > 0 THEN 'pending' ELSE 'waiting_for_audio' END
FROM public.calls c
WHERE c.status IN ('completed','closed_won','closed_lost','no_show')
  AND COALESCE(c.is_simulation, false) = false
  AND (c.transcript IS NULL OR length(c.transcript) <= 50)
ON CONFLICT (call_id) DO NOTHING;