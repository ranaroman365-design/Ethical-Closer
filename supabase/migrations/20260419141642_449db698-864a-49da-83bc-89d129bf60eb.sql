-- 1. Counter column on messages
ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS reactions_count INTEGER NOT NULL DEFAULT 0;

-- 2. Reactions table
CREATE TABLE IF NOT EXISTS public.community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.community_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_community_reactions_message ON public.community_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_community_reactions_user ON public.community_reactions(user_id);

ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reactions readable by authenticated" ON public.community_reactions;
CREATE POLICY "Reactions readable by authenticated"
  ON public.community_reactions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can react as themselves" ON public.community_reactions;
CREATE POLICY "Users can react as themselves"
  ON public.community_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their own reactions" ON public.community_reactions;
CREATE POLICY "Users can remove their own reactions"
  ON public.community_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Counter trigger
CREATE OR REPLACE FUNCTION public.community_reactions_count_trg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_messages
       SET reactions_count = reactions_count + 1
     WHERE id = NEW.message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_messages
       SET reactions_count = GREATEST(0, reactions_count - 1)
     WHERE id = OLD.message_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_reactions_count ON public.community_reactions;
CREATE TRIGGER trg_community_reactions_count
AFTER INSERT OR DELETE ON public.community_reactions
FOR EACH ROW EXECUTE FUNCTION public.community_reactions_count_trg();