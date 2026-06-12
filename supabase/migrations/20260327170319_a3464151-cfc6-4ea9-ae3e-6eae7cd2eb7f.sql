
-- Chat threads table to track bidirectional unlock
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  is_open boolean NOT NULL DEFAULT true,
  UNIQUE(user_a, user_b)
);

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

-- Users can see threads they're part of
CREATE POLICY "Users can view own threads"
  ON public.chat_threads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Users can insert threads (validated in app logic)
CREATE POLICY "Users can create threads"
  ON public.chat_threads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = opened_by AND (auth.uid() = user_a OR auth.uid() = user_b));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
