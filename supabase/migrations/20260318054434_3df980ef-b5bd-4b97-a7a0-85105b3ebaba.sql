
CREATE OR REPLACE FUNCTION public.auto_post_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_name text;
  v_content text;
BEGIN
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    SELECT COALESCE(full_name, 'Ein Closer') INTO v_user_name FROM profiles WHERE id = NEW.closer_id;
    v_content := '🎉 ' || v_user_name || ' hat einen Deal geclosed! Herzlichen Glückwunsch!';
    -- Post to closer/manager community
    INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
    VALUES (COALESCE(NEW.closer_id, NEW.owner_id), 'closer', 'milestone_close', v_content, NEW.id);
    INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
    VALUES (COALESCE(NEW.closer_id, NEW.owner_id), 'manager', 'milestone_close', v_content, NEW.id);
    INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
    VALUES (COALESCE(NEW.closer_id, NEW.owner_id), 'trainee', 'milestone_close', v_content, NEW.id);
  END IF;

  IF NEW.stage = 'ready_for_closer' AND (OLD.stage IS DISTINCT FROM 'ready_for_closer') THEN
    SELECT COALESCE(full_name, 'Ein Setter') INTO v_user_name FROM profiles WHERE id = NEW.setter_id;
    v_content := '📞 ' || v_user_name || ' hat einen Call qualifiziert und übergeben! Stark!';
    INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
    VALUES (COALESCE(NEW.setter_id, NEW.owner_id), 'trainee', 'milestone_setter_booked', v_content, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;
