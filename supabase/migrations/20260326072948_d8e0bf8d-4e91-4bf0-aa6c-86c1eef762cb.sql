
-- 2. FIX AUTO HANDOVER: Update to log transitions
CREATE OR REPLACE FUNCTION public.auto_handover_to_closer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_closer_id uuid;
  v_previous_stage text;
BEGIN
  -- When lead reaches 'ready_for_closer' stage and has an appointment
  IF NEW.stage = 'ready_for_closer' AND NEW.appointment_date IS NOT NULL THEN
    v_previous_stage := NEW.stage;
    
    -- Find an available closer (round-robin)
    SELECT p.id INTO v_closer_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    WHERE p.business_stage IN ('junior_manager', 'manager', 'senior_manager', 'director')
      AND p.id != COALESCE(NEW.setter_id, NEW.owner_id)
    ORDER BY (
      SELECT count(*) FROM leads l2 
      WHERE l2.closer_id = p.id 
      AND l2.stage NOT IN ('closed_won', 'closed_lost', 'cancelled', 'recycled', 'returned_to_pool')
    ) ASC
    LIMIT 1;

    IF v_closer_id IS NOT NULL THEN
      -- Update the lead directly (avoid recursive trigger by setting both fields)
      NEW.stage := 'assigned_closer';
      NEW.closer_id := v_closer_id;
      NEW.updated_at := now();

      -- Log the transition
      INSERT INTO lead_transitions (lead_id, previous_stage, new_stage, changed_by, reason)
      VALUES (
        NEW.id,
        v_previous_stage,
        'assigned_closer',
        v_closer_id,
        'auto_handover – Round-Robin-Zuweisung an Closer'
      );

      -- Audit log
      INSERT INTO audit_logs (action, source_type, note, before_state, after_state)
      VALUES (
        'auto_handover_to_closer',
        'trigger',
        format('Lead "%s" auto-assigned to closer', NEW.name),
        jsonb_build_object('stage', v_previous_stage, 'closer_id', null),
        jsonb_build_object('stage', 'assigned_closer', 'closer_id', v_closer_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
