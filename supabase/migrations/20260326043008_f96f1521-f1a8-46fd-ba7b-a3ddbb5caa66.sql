-- Allow setters to update their assigned leads
CREATE POLICY "Setters update own assigned leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (setter_id = auth.uid());

-- Allow closers to update their assigned leads
CREATE POLICY "Closers update own assigned leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (closer_id = auth.uid());

-- DB trigger: auto-upgrade lead_level to L1 on closed_won
CREATE OR REPLACE FUNCTION public.auto_upgrade_lead_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    NEW.lead_level := 'L1';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_upgrade_lead_level
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.auto_upgrade_lead_level();

-- Also add setter_no_response to Pool visibility (align with setter workspace)
-- No schema change needed, just ensuring stage consistency