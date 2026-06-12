-- Layer 49 hardening — attach learning/iteration/snapshot trigger
DROP TRIGGER IF EXISTS trg_experiment_decisions_auto_learn ON public.experiment_decisions;
CREATE TRIGGER trg_experiment_decisions_auto_learn
AFTER INSERT ON public.experiment_decisions
FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_learning();

-- Admin-only gate when transitioning an iteration into `launched`.
-- L6+ keep approve/reject/mark-built. Only admins flip to `launched`.
CREATE OR REPLACE FUNCTION public.fn_iter_queue_launch_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'launched' AND OLD.status IS DISTINCT FROM 'launched' THEN
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only admins can mark an iteration as launched.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_iter_queue_launch_admin_only ON public.experiment_iteration_queue;
CREATE TRIGGER trg_iter_queue_launch_admin_only
BEFORE UPDATE ON public.experiment_iteration_queue
FOR EACH ROW EXECUTE FUNCTION public.fn_iter_queue_launch_admin_only();