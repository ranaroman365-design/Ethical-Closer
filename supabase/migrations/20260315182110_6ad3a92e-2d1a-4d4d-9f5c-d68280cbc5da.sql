-- Auto phase-progression function
CREATE OR REPLACE FUNCTION public.auto_advance_phase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_current_phase int;
  v_phase_module_count int;
  v_phase_completed_count int;
BEGIN
  v_user_id := NEW.user_id;
  
  IF NEW.completed = false THEN
    RETURN NEW;
  END IF;
  
  SELECT current_phase INTO v_current_phase FROM profiles WHERE id = v_user_id;
  
  SELECT count(*) INTO v_phase_module_count
  FROM modules WHERE phase_id = (SELECT id FROM phases WHERE sort_order = v_current_phase);
  
  SELECT count(*) INTO v_phase_completed_count
  FROM member_progress mp
  JOIN modules m ON m.id = mp.module_id
  WHERE mp.user_id = v_user_id
    AND mp.completed = true
    AND m.phase_id = (SELECT id FROM phases WHERE sort_order = v_current_phase);
  
  IF v_phase_completed_count >= v_phase_module_count AND v_phase_module_count > 0 THEN
    IF EXISTS (SELECT 1 FROM phases WHERE sort_order = v_current_phase + 1) THEN
      UPDATE profiles SET current_phase = v_current_phase + 1, updated_at = now()
      WHERE id = v_user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_progress_auto_advance
  AFTER INSERT OR UPDATE ON member_progress
  FOR EACH ROW
  EXECUTE FUNCTION auto_advance_phase();