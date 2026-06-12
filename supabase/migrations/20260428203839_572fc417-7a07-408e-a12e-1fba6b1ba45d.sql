CREATE TABLE IF NOT EXISTS public.communication_dispatch_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('attention','action','documentation','reinforcement')),
  user_id UUID NULL,
  lead_id UUID NULL,
  recipient TEXT NULL,
  primary_channel TEXT NOT NULL CHECK (primary_channel IN ('whatsapp','sms','push','email')),
  fallback_channel TEXT NULL CHECK (fallback_channel IS NULL OR fallback_channel IN ('whatsapp','sms','push','email')),
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','suppressed_dedup','no_recipient')),
  error_message TEXT NULL,
  template_key TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_dispatch_event ON public.communication_dispatch_log (event_key, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_dispatch_user ON public.communication_dispatch_log (user_id, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_dispatch_lead ON public.communication_dispatch_log (lead_id, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_dispatch_channel ON public.communication_dispatch_log (primary_channel, status, dispatched_at DESC);

ALTER TABLE public.communication_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and L6+ read dispatch log"
  ON public.communication_dispatch_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.current_phase, 0) >= 6
    )
  );

CREATE TABLE IF NOT EXISTS public.communication_dedup (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dedup_key TEXT NOT NULL,
  event_key TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_dedup ON public.communication_dedup (dedup_key, window_start);
CREATE INDEX IF NOT EXISTS idx_comm_dedup_window ON public.communication_dedup (window_start);

ALTER TABLE public.communication_dedup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read dedup table"
  ON public.communication_dedup
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));