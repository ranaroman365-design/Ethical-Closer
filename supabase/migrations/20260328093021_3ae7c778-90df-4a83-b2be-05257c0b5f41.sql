
-- Fix: direct_messages already in supabase_realtime, just add community_messages
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
