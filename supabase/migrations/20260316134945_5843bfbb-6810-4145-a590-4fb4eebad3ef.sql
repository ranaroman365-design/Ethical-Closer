
CREATE TABLE IF NOT EXISTS public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  community_type text NOT NULL DEFAULT 'trainee',
  message_type text NOT NULL DEFAULT 'chat',
  content text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read community messages" ON public.community_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert own messages" ON public.community_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins delete messages" ON public.community_messages
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;

CREATE OR REPLACE FUNCTION public.auto_post_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_name text;
  v_content text;
BEGIN
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    SELECT COALESCE(full_name, 'Ein Closer') INTO v_user_name FROM profiles WHERE id = NEW.closer_id;
    v_content := '🎉 ' || v_user_name || ' hat einen Deal geclosed! Herzlichen Glückwunsch!';
    INSERT INTO community_messages (user_id, community_type, message_type, content, lead_id)
    VALUES (COALESCE(NEW.closer_id, NEW.owner_id), 'closer', 'milestone_close', v_content, NEW.id);
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
$$;

CREATE TRIGGER trg_auto_post_milestone
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_post_milestone();
