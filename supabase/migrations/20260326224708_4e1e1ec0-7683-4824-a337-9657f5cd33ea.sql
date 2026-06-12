
-- Direct messages table for 1:1 chat
CREATE TABLE public.direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_dm_sender ON public.direct_messages(sender_id, created_at DESC);
CREATE INDEX idx_dm_receiver ON public.direct_messages(receiver_id, created_at DESC);
CREATE INDEX idx_dm_conversation ON public.direct_messages(
  LEAST(sender_id, receiver_id), 
  GREATEST(sender_id, receiver_id), 
  created_at DESC
);

-- Enable RLS
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages they sent or received
CREATE POLICY "Users read own messages" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Users can insert messages they send
CREATE POLICY "Users send messages" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Users can update (mark as read) messages they received
CREATE POLICY "Users mark received as read" ON public.direct_messages
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid());

-- Admins full access
CREATE POLICY "Admins manage messages" ON public.direct_messages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
