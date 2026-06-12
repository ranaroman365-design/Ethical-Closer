
-- Add metadata column to notifications if missing
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add index on notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id, is_read, created_at DESC);

-- Enable realtime for notifications (if not already)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- WEBHOOK DLQ TABLE
CREATE TABLE IF NOT EXISTS public.webhook_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid,
  endpoint text,
  payload jsonb,
  error text,
  failed_at timestamptz NOT NULL DEFAULT now(),
  retried_at timestamptz,
  dismissed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.webhook_dlq ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage DLQ"
    ON public.webhook_dlq FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add next_retry_at to outbound_events
ALTER TABLE public.outbound_events ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- pg_trgm + GIN indexes for search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_dm_content_trgm 
  ON public.direct_messages USING gin(content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_community_content_trgm 
  ON public.community_messages USING gin(content gin_trgm_ops);

-- Composite indexes for scalability
CREATE INDEX IF NOT EXISTS idx_community_messages_type_created 
  ON public.community_messages(community_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_participants_created 
  ON public.direct_messages(sender_id, receiver_id, created_at DESC);

-- Auto-welcome trigger
CREATE OR REPLACE FUNCTION public.auto_welcome_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_old_community text;
  v_new_community text;
  v_name text;
  v_admin_id uuid;
  v_already_welcomed boolean;
BEGIN
  IF OLD.business_stage IS NOT DISTINCT FROM NEW.business_stage THEN
    RETURN NEW;
  END IF;

  v_old_community := CASE 
    WHEN OLD.business_stage IN ('prospect','applicant','opener','trainee') THEN 'trainee'
    WHEN OLD.business_stage IN ('setter','associate_setter','associate','senior_associate','senior_setter') THEN 'setter'
    WHEN OLD.business_stage IN ('junior_manager','manager','senior_manager') THEN 'closer'
    WHEN OLD.business_stage IN ('director','partner') THEN 'manager'
    ELSE 'trainee'
  END;

  v_new_community := CASE 
    WHEN NEW.business_stage IN ('prospect','applicant','opener','trainee') THEN 'trainee'
    WHEN NEW.business_stage IN ('setter','associate_setter','associate','senior_associate','senior_setter') THEN 'setter'
    WHEN NEW.business_stage IN ('junior_manager','manager','senior_manager') THEN 'closer'
    WHEN NEW.business_stage IN ('director','partner') THEN 'manager'
    ELSE 'trainee'
  END;

  IF v_old_community = v_new_community THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM community_messages 
    WHERE message_type = 'system' 
      AND community_type = v_new_community
      AND content LIKE '%' || NEW.id::text || '%'
  ) INTO v_already_welcomed;

  IF v_already_welcomed THEN RETURN NEW; END IF;

  v_name := COALESCE(NEW.full_name, 'Ein neues Mitglied');
  SELECT ur.user_id INTO v_admin_id FROM user_roles ur WHERE ur.role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN v_admin_id := NEW.id; END IF;

  INSERT INTO community_messages (user_id, community_type, message_type, content, post_category)
  VALUES (v_admin_id, v_new_community, 'system',
    'Willkommen ' || v_name || ' in der Community! 👋 [user:' || NEW.id::text || ']',
    'motivation');

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_auto_welcome_community ON public.profiles;
CREATE TRIGGER trg_auto_welcome_community
  AFTER UPDATE OF business_stage ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_welcome_community();
