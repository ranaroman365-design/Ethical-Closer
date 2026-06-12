
-- FIX 1: Drop duplicate triggers on member_progress, keep only on_progress_auto_advance
DROP TRIGGER IF EXISTS trg_auto_advance_phase ON public.member_progress;
DROP TRIGGER IF EXISTS trigger_auto_advance_phase ON public.member_progress;

-- FIX 2: Drop duplicate trigger on leads, keep only trg_auto_post_milestone
DROP TRIGGER IF EXISTS trigger_auto_post_milestone ON public.leads;

-- FIX 3: Rebuild auto_post_milestone with null guards on v_content
CREATE OR REPLACE FUNCTION public.auto_post_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_name text;
  v_content text;
BEGIN
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    v_user_id := COALESCE(NEW.closer_id, NEW.owner_id);
    IF v_user_id IS NOT NULL THEN
      SELECT COALESCE(full_name, 'Ein Closer') INTO v_user_name FROM profiles WHERE id = v_user_id;
      v_content := '🎉 ' || v_user_name || ' hat einen Deal geclosed! Herzlichen Glückwunsch!';
      IF v_content IS NOT NULL AND v_content <> '' THEN
        INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
        VALUES (v_user_id, 'closer', 'milestone_close', v_content, NEW.id);
        INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
        VALUES (v_user_id, 'manager', 'milestone_close', v_content, NEW.id);
        INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
        VALUES (v_user_id, 'trainee', 'milestone_close', v_content, NEW.id);
      END IF;
    END IF;
  END IF;

  IF NEW.stage = 'ready_for_closer' AND (OLD.stage IS DISTINCT FROM 'ready_for_closer') THEN
    v_user_id := COALESCE(NEW.setter_id, NEW.owner_id);
    IF v_user_id IS NOT NULL THEN
      SELECT COALESCE(full_name, 'Ein Setter') INTO v_user_name FROM profiles WHERE id = v_user_id;
      v_content := '📞 ' || v_user_name || ' hat einen Call qualifiziert und übergeben! Stark!';
      IF v_content IS NOT NULL AND v_content <> '' THEN
        INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
        VALUES (v_user_id, 'trainee', 'milestone_setter_booked', v_content, NEW.id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
