ALTER TABLE public.member_kpis ADD COLUMN IF NOT EXISTS storno_rate numeric DEFAULT 0;

-- Create function to auto-update KPIs when lead transitions happen
CREATE OR REPLACE FUNCTION public.auto_update_kpis_on_lead_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_total_closed_won int;
  v_total_closed int;
  v_total_cancelled int;
  v_total_calls int;
  v_total_showed int;
  v_total_qualified int;
  v_total_leads int;
BEGIN
  -- Determine which user to update KPIs for
  v_user_id := COALESCE(NEW.closer_id, NEW.setter_id, NEW.owner_id);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- Count lead stats for this user
  SELECT 
    count(*) FILTER (WHERE stage = 'closed_won'),
    count(*) FILTER (WHERE stage IN ('closed_won', 'closed_lost')),
    count(*) FILTER (WHERE stage = 'cancelled'),
    count(*) FILTER (WHERE stage IN ('closed_won', 'closed_lost', 'offer_made', 'cancelled')),
    count(*) FILTER (WHERE stage NOT IN ('new', 'assigned_setter', 'backlog')),
    count(*) FILTER (WHERE stage IN ('qualified', 'ready_for_closer', 'offer_made', 'closed_won', 'closed_lost')),
    count(*)
  INTO v_total_closed_won, v_total_closed, v_total_cancelled, v_total_calls, v_total_showed, v_total_qualified, v_total_leads
  FROM leads
  WHERE closer_id = v_user_id OR setter_id = v_user_id OR owner_id = v_user_id;

  -- Upsert KPIs
  INSERT INTO member_kpis (user_id, closing_rate, storno_rate, calls_handled, show_rate, qualification_accuracy, updated_at)
  VALUES (
    v_user_id,
    CASE WHEN v_total_closed > 0 THEN ROUND((v_total_closed_won::numeric / v_total_closed) * 100, 1) ELSE 0 END,
    CASE WHEN v_total_closed_won > 0 THEN ROUND((v_total_cancelled::numeric / v_total_closed_won) * 100, 1) ELSE 0 END,
    v_total_calls,
    CASE WHEN v_total_leads > 0 THEN ROUND((v_total_showed::numeric / v_total_leads) * 100, 1) ELSE 0 END,
    CASE WHEN v_total_leads > 0 THEN ROUND((v_total_qualified::numeric / v_total_leads) * 100, 1) ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate,
    storno_rate = EXCLUDED.storno_rate,
    calls_handled = EXCLUDED.calls_handled,
    show_rate = EXCLUDED.show_rate,
    qualification_accuracy = EXCLUDED.qualification_accuracy,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Trigger on leads table for KPI auto-update
DROP TRIGGER IF EXISTS trigger_auto_update_kpis ON leads;
CREATE TRIGGER trigger_auto_update_kpis
  AFTER UPDATE OF stage ON leads
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION auto_update_kpis_on_lead_transition();

-- Auto-handover: when a lead is qualified + has appointment, assign to closer pipeline
CREATE OR REPLACE FUNCTION public.auto_handover_to_closer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When lead reaches 'ready_for_closer' stage and has an appointment
  IF NEW.stage = 'ready_for_closer' AND NEW.appointment_date IS NOT NULL THEN
    -- Find an available closer (round-robin from profiles with business_stage in closer stages)
    UPDATE leads SET
      stage = 'assigned_closer',
      closer_id = (
        SELECT p.id FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        WHERE p.business_stage IN ('junior_manager', 'manager', 'senior_manager', 'director')
          AND p.id != COALESCE(NEW.setter_id, NEW.owner_id)
        ORDER BY (
          SELECT count(*) FROM leads l2 WHERE l2.closer_id = p.id AND l2.stage NOT IN ('closed_won', 'closed_lost', 'cancelled', 'recycled')
        ) ASC
        LIMIT 1
      ),
      updated_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_handover ON leads;
CREATE TRIGGER trigger_auto_handover
  AFTER UPDATE OF stage ON leads
  FOR EACH ROW
  WHEN (NEW.stage = 'ready_for_closer' AND NEW.appointment_date IS NOT NULL)
  EXECUTE FUNCTION auto_handover_to_closer();