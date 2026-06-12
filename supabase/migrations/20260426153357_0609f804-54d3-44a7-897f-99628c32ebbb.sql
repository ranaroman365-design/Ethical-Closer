-- Queue table for pending transcriptions
CREATE TABLE IF NOT EXISTS public.pending_call_transcriptions (
  call_id uuid PRIMARY KEY REFERENCES public.calls(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','waiting_for_audio','processing','done','failed')),
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz
);

ALTER TABLE public.pending_call_transcriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pct_admin_only ON public.pending_call_transcriptions;
CREATE POLICY pct_admin_only ON public.pending_call_transcriptions
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE INDEX IF NOT EXISTS idx_pct_status ON public.pending_call_transcriptions(status) WHERE processed_at IS NULL;

-- Trigger: completion → enqueue transcription
CREATE OR REPLACE FUNCTION public.tg_enqueue_call_transcription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  -- Only act on transition into 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed')
     AND COALESCE(NEW.is_simulation, false) = false THEN
    -- Skip if transcript already populated
    IF NEW.transcript IS NOT NULL AND length(NEW.transcript) > 50 THEN
      RETURN NEW;
    END IF;

    -- Choose status based on whether audio is attached
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

DROP TRIGGER IF EXISTS trg_enqueue_call_transcription ON public.calls;
CREATE TRIGGER trg_enqueue_call_transcription
AFTER UPDATE OF status ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.tg_enqueue_call_transcription();

-- 48h outcome fallback
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
    WHERE c.status = 'completed'
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