-- AI Setter pre-call qualification sessions
CREATE TABLE public.ai_setter_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID,
  session_status TEXT NOT NULL DEFAULT 'ongoing',
  messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  motivation_score INTEGER DEFAULT 0,
  clarity_score INTEGER DEFAULT 0,
  commitment_score INTEGER DEFAULT 0,
  overall_ai_score INTEGER DEFAULT 0,
  ai_recommendation TEXT DEFAULT 'needs_call',
  summary_text TEXT,
  chat_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_setter_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own ai setter sessions"
ON public.ai_setter_sessions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own sessions
CREATE POLICY "Users can create own ai setter sessions"
ON public.ai_setter_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update own ai setter sessions"
ON public.ai_setter_sessions
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all sessions (using has_role function)
CREATE POLICY "Admins can view all ai setter sessions"
ON public.ai_setter_sessions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Index for quick lookup
CREATE INDEX idx_ai_setter_sessions_lead ON public.ai_setter_sessions(lead_id);
CREATE INDEX idx_ai_setter_sessions_user ON public.ai_setter_sessions(user_id);

-- Timestamp trigger
CREATE TRIGGER update_ai_setter_sessions_updated_at
BEFORE UPDATE ON public.ai_setter_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();