-- Idempotent auto-analyze trigger: transcript set → enqueue analysis
CREATE OR REPLACE FUNCTION public.tg_enqueue_call_analysis()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when transcript transitions empty → non-empty
  IF (NEW.transcript IS NOT NULL AND length(NEW.transcript) > 50)
     AND (OLD.transcript IS NULL OR length(coalesce(OLD.transcript, '')) <= 50)
     AND COALESCE(NEW.is_simulation, false) = false
  THEN
    -- Skip if analysis already exists (idempotent)
    IF NOT EXISTS (SELECT 1 FROM public.call_analysis WHERE call_id = NEW.id) THEN
      INSERT INTO public.pending_call_analyses (call_id, status, created_at)
      VALUES (NEW.id, 'pending', now())
      ON CONFLICT (call_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_call_analysis ON public.calls;
CREATE TRIGGER trg_enqueue_call_analysis
AFTER UPDATE OF transcript ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.tg_enqueue_call_analysis();