-- Feedback Engine: alternative to mentor-only pyramid
CREATE TYPE public.feedback_track AS ENUM ('ai', 'peer', 'mentor');
CREATE TYPE public.feedback_status AS ENUM ('open', 'assigned', 'answered', 'expired');

CREATE TABLE public.feedback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_call_id uuid REFERENCES public.practice_calls(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track feedback_track NOT NULL,
  status feedback_status NOT NULL DEFAULT 'open',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  level_at_request integer,
  context jsonb DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fbreq_requester ON public.feedback_requests(requester_id, created_at DESC);
CREATE INDEX idx_fbreq_assignee_status ON public.feedback_requests(assignee_id, status) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_fbreq_practice_call ON public.feedback_requests(practice_call_id);

CREATE TABLE public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.feedback_requests(id) ON DELETE CASCADE,
  responder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  track feedback_track NOT NULL,
  scorecard jsonb,
  strengths text,
  improvements text,
  next_action text,
  response_time_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fbres_request ON public.feedback_responses(request_id);
CREATE INDEX idx_fbres_responder ON public.feedback_responses(responder_id, created_at DESC);

ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;

-- feedback_requests policies
CREATE POLICY "Requesters read own requests" ON public.feedback_requests
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR assignee_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Requesters create own requests" ON public.feedback_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Assignee or requester updates" ON public.feedback_requests
  FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid() OR requester_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete" ON public.feedback_requests
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- feedback_responses policies
CREATE POLICY "Read responses on own/assigned requests" ON public.feedback_responses
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR responder_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.feedback_requests r
      WHERE r.id = request_id AND (r.requester_id = auth.uid() OR r.assignee_id = auth.uid())
    )
  );

CREATE POLICY "Responder writes own response" ON public.feedback_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    responder_id = auth.uid()
    OR (track = 'ai' AND has_role(auth.uid(), 'admin'::app_role))
    OR EXISTS (
      SELECT 1 FROM public.feedback_requests r
      WHERE r.id = request_id AND (r.assignee_id = auth.uid() OR r.requester_id = auth.uid())
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_fbreq_touch
  BEFORE UPDATE ON public.feedback_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Routing RPC: deterministic, never blocks
CREATE OR REPLACE FUNCTION public.route_feedback_request(
  p_practice_call_id uuid,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_level int;
  v_ai_req uuid;
  v_peer_req uuid;
  v_mentor_req uuid;
  v_peer1 uuid;
  v_peer2 uuid;
  v_mentor uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- Determine requester level
  SELECT COALESCE(current_level, 0) INTO v_level
  FROM public.user_level_status WHERE user_id = v_user;
  v_level := COALESCE(v_level, 0);

  -- Track 1: AI (always)
  INSERT INTO public.feedback_requests(practice_call_id, requester_id, track, status, level_at_request, context)
  VALUES (p_practice_call_id, v_user, 'ai', 'open', v_level, p_context)
  RETURNING id INTO v_ai_req;

  -- Track 2: Peer (same level, prefer certified, exclude self)
  SELECT p.id INTO v_peer1
  FROM public.profiles p
  LEFT JOIN public.user_level_status uls ON uls.user_id = p.id
  WHERE p.id <> v_user
    AND COALESCE(uls.current_level, 0) = v_level
  ORDER BY p.certified DESC NULLS LAST, random()
  LIMIT 1;

  IF v_peer1 IS NOT NULL THEN
    INSERT INTO public.feedback_requests(practice_call_id, requester_id, track, status, assignee_id, level_at_request, context)
    VALUES (p_practice_call_id, v_user, 'peer', 'assigned', v_peer1, v_level, p_context)
    RETURNING id INTO v_peer_req;

    SELECT p.id INTO v_peer2
    FROM public.profiles p
    LEFT JOIN public.user_level_status uls ON uls.user_id = p.id
    WHERE p.id <> v_user AND p.id <> v_peer1
      AND COALESCE(uls.current_level, 0) = v_level
    ORDER BY p.certified DESC NULLS LAST, random()
    LIMIT 1;

    IF v_peer2 IS NOT NULL THEN
      INSERT INTO public.feedback_requests(practice_call_id, requester_id, track, status, assignee_id, level_at_request, context)
      VALUES (p_practice_call_id, v_user, 'peer', 'assigned', v_peer2, v_level, p_context);
    END IF;
  END IF;

  -- Track 3: Mentor (level+1 or higher, capacity < 5)
  SELECT uls.user_id INTO v_mentor
  FROM public.user_level_status uls
  WHERE uls.current_level >= v_level + 1
    AND uls.user_id <> v_user
    AND (
      SELECT COUNT(*) FROM public.feedback_requests fr
      WHERE fr.assignee_id = uls.user_id AND fr.status IN ('open','assigned')
    ) < 5
  ORDER BY uls.current_level ASC, random()
  LIMIT 1;

  IF v_mentor IS NOT NULL THEN
    INSERT INTO public.feedback_requests(practice_call_id, requester_id, track, status, assignee_id, level_at_request, context)
    VALUES (p_practice_call_id, v_user, 'mentor', 'assigned', v_mentor, v_level, p_context)
    RETURNING id INTO v_mentor_req;
  END IF;

  RETURN jsonb_build_object(
    'ai_request_id', v_ai_req,
    'peer_request_id', v_peer_req,
    'mentor_request_id', v_mentor_req,
    'peer_count', (CASE WHEN v_peer1 IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN v_peer2 IS NOT NULL THEN 1 ELSE 0 END),
    'mentor_assigned', v_mentor IS NOT NULL,
    'guaranteed_track', 'ai'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.route_feedback_request(uuid, jsonb) TO authenticated;