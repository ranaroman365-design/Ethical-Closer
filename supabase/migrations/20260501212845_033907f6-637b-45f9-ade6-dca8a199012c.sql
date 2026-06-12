
CREATE TABLE public.lead_unit_assignment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  previous_unit_id UUID,
  new_unit_id UUID,
  previous_owner_id UUID,
  new_owner_id UUID,
  source_funnel TEXT,
  funnel_path TEXT,
  assigned_by TEXT NOT NULL DEFAULT 'system',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_unit_assignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all assignment logs"
ON public.lead_unit_assignment_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Unit operators can view their unit assignment logs"
ON public.lead_unit_assignment_log
FOR SELECT
TO authenticated
USING (
  new_unit_id IN (
    SELECT id FROM public.operator_units WHERE operator_id = auth.uid()
  )
  OR
  previous_unit_id IN (
    SELECT id FROM public.operator_units WHERE operator_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.log_lead_unit_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.unit_id IS NOT NULL OR NEW.assigned_operator_id IS NOT NULL THEN
      INSERT INTO public.lead_unit_assignment_log (
        lead_id, new_unit_id, new_owner_id,
        source_funnel, funnel_path, assigned_by, reason
      ) VALUES (
        NEW.id, NEW.unit_id, NEW.assigned_operator_id,
        NEW.source, NEW.source_funnel,
        'system', 'initial_assignment'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.unit_id IS DISTINCT FROM NEW.unit_id)
       OR (OLD.assigned_operator_id IS DISTINCT FROM NEW.assigned_operator_id) THEN
      INSERT INTO public.lead_unit_assignment_log (
        lead_id, previous_unit_id, new_unit_id,
        previous_owner_id, new_owner_id,
        source_funnel, funnel_path, assigned_by, reason
      ) VALUES (
        NEW.id, OLD.unit_id, NEW.unit_id,
        OLD.assigned_operator_id, NEW.assigned_operator_id,
        NEW.source, NEW.source_funnel,
        'system',
        CASE
          WHEN OLD.unit_id IS DISTINCT FROM NEW.unit_id AND OLD.assigned_operator_id IS DISTINCT FROM NEW.assigned_operator_id THEN 'unit_and_owner_change'
          WHEN OLD.unit_id IS DISTINCT FROM NEW.unit_id THEN 'unit_change'
          ELSE 'owner_change'
        END
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_lead_unit_assignment
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.log_lead_unit_assignment();

CREATE INDEX idx_lead_unit_assignment_log_lead ON public.lead_unit_assignment_log(lead_id);
CREATE INDEX idx_lead_unit_assignment_log_created ON public.lead_unit_assignment_log(created_at DESC);
