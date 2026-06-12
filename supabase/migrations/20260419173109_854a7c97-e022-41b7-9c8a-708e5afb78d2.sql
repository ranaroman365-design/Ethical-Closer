-- ============================================================
-- PART B — Notification triggers writing into existing public.notifications
-- Schema reuses: recipient_id, type, title, message, link_path, metadata, is_read
-- type values added: 'like', 'reply', 'mention', 'level_up'
-- ============================================================

-- TRIGGER 1: like notification on community_reactions INSERT
CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg RECORD;
  v_actor_name text;
BEGIN
  SELECT user_id, content INTO v_msg
  FROM public.community_messages WHERE id = NEW.message_id;

  IF v_msg.user_id IS NULL OR v_msg.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Jemand') INTO v_actor_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (recipient_id, type, title, message, link_path, metadata)
  VALUES (
    v_msg.user_id,
    'like',
    v_actor_name || ' hat deinen Post geliked',
    LEFT(COALESCE(v_msg.content, ''), 60),
    '/community/feed',
    jsonb_build_object('actor_id', NEW.user_id, 'message_id', NEW.message_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_reaction ON public.community_reactions;
CREATE TRIGGER trg_notify_on_reaction
AFTER INSERT ON public.community_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_reaction();


-- TRIGGER 2 + 3: reply + mention notifications on community_messages INSERT
CREATE OR REPLACE FUNCTION public.notify_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_user uuid;
  v_actor_name text;
  v_match text;
  v_target uuid;
BEGIN
  SELECT COALESCE(full_name, 'Jemand') INTO v_actor_name
  FROM public.profiles WHERE id = NEW.user_id;

  -- REPLY
  IF NEW.reply_to IS NOT NULL THEN
    SELECT user_id INTO v_parent_user FROM public.community_messages WHERE id = NEW.reply_to;
    IF v_parent_user IS NOT NULL AND v_parent_user <> NEW.user_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, link_path, metadata)
      VALUES (
        v_parent_user,
        'reply',
        v_actor_name || ' hat geantwortet',
        LEFT(COALESCE(NEW.content, ''), 60),
        '/community/feed',
        jsonb_build_object('actor_id', NEW.user_id, 'message_id', NEW.id, 'parent_id', NEW.reply_to)
      );
    END IF;
  END IF;

  -- MENTIONS @full_name (lower-cased, spaces->underscore best-effort match by full_name ilike)
  FOR v_match IN
    SELECT DISTINCT regexp_replace(m[1], '[_\.]', ' ', 'g')
    FROM regexp_matches(COALESCE(NEW.content, ''), '@([A-Za-z0-9_\.]{2,40})', 'g') AS m
  LOOP
    SELECT id INTO v_target FROM public.profiles
    WHERE full_name ILIKE v_match LIMIT 1;
    IF v_target IS NOT NULL AND v_target <> NEW.user_id THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, link_path, metadata)
      VALUES (
        v_target,
        'mention',
        v_actor_name || ' hat dich erwähnt',
        LEFT(COALESCE(NEW.content, ''), 60),
        '/community/feed',
        jsonb_build_object('actor_id', NEW.user_id, 'message_id', NEW.id)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_message_insert ON public.community_messages;
CREATE TRIGGER trg_notify_on_message_insert
AFTER INSERT ON public.community_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_message_insert();


-- TRIGGER 4: level_up on profiles UPDATE when credit_level increases
CREATE OR REPLACE FUNCTION public.notify_on_level_up()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.credit_level, 0) > COALESCE(OLD.credit_level, 0) THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, link_path, metadata)
    VALUES (
      NEW.id,
      'level_up',
      'Neues Credit-Level erreicht',
      'Du hast Level ' || NEW.credit_level || ' erreicht.',
      '/community',
      jsonb_build_object('new_level', NEW.credit_level, 'old_level', OLD.credit_level)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_level_up ON public.profiles;
CREATE TRIGGER trg_notify_on_level_up
AFTER UPDATE OF credit_level ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_on_level_up();