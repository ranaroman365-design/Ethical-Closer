-- Create private audio storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('audio-messages', 'audio-messages', false, 5242880)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can upload their own audio
CREATE POLICY "Users upload own audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audio-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can read audio they sent or received
CREATE POLICY "Users read accessible audio"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio-messages');

-- Users can delete their own audio
CREATE POLICY "Users delete own audio"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audio-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Audio messages table
CREATE TABLE public.audio_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context_type text NOT NULL DEFAULT 'chat' CHECK (context_type IN ('chat', 'academy', 'feedback')),
  context_id text,
  file_path text NOT NULL,
  duration integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own audio messages"
ON public.audio_messages FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read own audio messages"
ON public.audio_messages FOR SELECT TO authenticated
USING (user_id = auth.uid() OR target_user_id = auth.uid());

CREATE POLICY "Admins read all audio messages"
ON public.audio_messages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own audio messages"
ON public.audio_messages FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_audio_messages_user ON public.audio_messages(user_id);
CREATE INDEX idx_audio_messages_context ON public.audio_messages(context_type, context_id);

-- Add audio columns to direct_messages for voice messages
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS audio_duration integer;