
ALTER TABLE public.community_messages 
  ADD COLUMN IF NOT EXISTS post_category text DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS reply_to uuid DEFAULT NULL;
