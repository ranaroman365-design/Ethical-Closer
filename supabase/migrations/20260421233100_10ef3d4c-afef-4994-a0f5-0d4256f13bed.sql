
-- 1. Fix audio_messages bucket SELECT policy: scope to folder ownership
DROP POLICY IF EXISTS "Users read accessible audio" ON storage.objects;

CREATE POLICY "Users read own audio"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio-messages'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Make module-videos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'module-videos';

-- 3. Add RLS policies on realtime.messages for topic-scoped subscriptions
-- Allow authenticated users to subscribe only to topics they own (topic contains their user id)
-- or to general broadcast topics they're explicitly authorized for.
DROP POLICY IF EXISTS "Authenticated users can receive own-scoped broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can send broadcasts to own topics" ON realtime.messages;

CREATE POLICY "Authenticated users can receive own-scoped broadcasts"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  -- Allow if topic embeds the user's id (e.g. "user:<uid>", "dm:<uid>:..", "notifications:<uid>")
  (realtime.topic() LIKE '%' || auth.uid()::text || '%')
);

CREATE POLICY "Authenticated users can send broadcasts to own topics"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() LIKE '%' || auth.uid()::text || '%')
);

-- 4. Remove unsafe self-insert XP policy and create validated function
DROP POLICY IF EXISTS "Users insert own xp" ON public.user_xp;

CREATE OR REPLACE FUNCTION public.award_xp(
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Server-side mapping of action to XP amount (mirrors client XP_VALUES)
  v_amount := CASE p_action
    WHEN 'login' THEN 1
    WHEN 'lesson_complete' THEN 5
    WHEN 'quiz_correct' THEN 10
    WHEN 'lead_handled' THEN 15
    WHEN 'appointment_set' THEN 25
    WHEN 'call_completed' THEN 30
    WHEN 'deal_closed' THEN 100
    WHEN 'mentee_promoted' THEN 50
    WHEN 'certification_passed' THEN 75
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Invalid XP action: %', p_action;
  END IF;

  INSERT INTO public.user_xp (user_id, action, xp_amount, metadata)
  VALUES (v_user, p_action, v_amount, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.award_xp(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb) TO authenticated;
