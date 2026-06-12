
-- Access denial audit log
CREATE TABLE public.access_denial_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  resource_type text NOT NULL,           -- 'appointment', 'calendar', 'performance_tab', etc.
  resource_id text,                      -- e.g. appointment UUID
  resolved_level int,
  team_scope_ids text[],                 -- unit/team IDs the user was resolved to
  denial_reason text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by user
CREATE INDEX idx_access_denial_log_user ON public.access_denial_log (user_id, created_at DESC);
CREATE INDEX idx_access_denial_log_resource ON public.access_denial_log (resource_type, created_at DESC);

-- RLS: only admins can read, system (service role) inserts
ALTER TABLE public.access_denial_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read access denial logs"
  ON public.access_denial_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow authenticated users to insert their own denial logs (client-side logging)
CREATE POLICY "Users can log own denials"
  ON public.access_denial_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
