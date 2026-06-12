-- 1. Pin + Mention columns on community_messages
ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by UUID,
  ADD COLUMN IF NOT EXISTS mentioned_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

CREATE INDEX IF NOT EXISTS idx_community_messages_reply_to
  ON public.community_messages (reply_to) WHERE reply_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_messages_pinned
  ON public.community_messages (community_type, pinned_at DESC) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_messages_mentions
  ON public.community_messages USING GIN (mentioned_user_ids);

-- 2. Pin / unpin policy: only admins / owners
DROP POLICY IF EXISTS "Admins can pin community messages" ON public.community_messages;
CREATE POLICY "Admins can pin community messages"
  ON public.community_messages FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_role(auth.uid(), 'owner'::app_role));

-- 3. Bookmarks
CREATE TABLE IF NOT EXISTS public.community_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES public.community_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);

ALTER TABLE public.community_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bookmarks"
  ON public.community_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users add own bookmarks"
  ON public.community_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove own bookmarks"
  ON public.community_bookmarks FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_community_bookmarks_user
  ON public.community_bookmarks (user_id, created_at DESC);