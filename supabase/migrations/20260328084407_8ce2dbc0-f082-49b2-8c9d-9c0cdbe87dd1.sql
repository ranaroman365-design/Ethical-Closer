
-- Add mute fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS is_chat_muted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_muted_until timestamp with time zone DEFAULT NULL;

-- Create flagged_messages table for compliance tracking
CREATE TABLE IF NOT EXISTS public.flagged_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text NOT NULL,
  flagged_word text,
  flag_reason text NOT NULL DEFAULT 'toxic_content',
  status text NOT NULL DEFAULT 'open',
  reviewed_by uuid DEFAULT NULL,
  reviewed_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.flagged_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage flagged messages"
  ON public.flagged_messages
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
