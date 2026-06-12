-- Layer 43: Email Documentation Layer
-- Settings (single row) + per-event toggles + lightweight audit log

CREATE TABLE IF NOT EXISTS public.email_documentation_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  master_enabled boolean NOT NULL DEFAULT true,
  per_event jsonb NOT NULL DEFAULT '{
    "account_created": true,
    "magic_link_access": true,
    "appointment_booked": true,
    "appointment_rescheduled": true,
    "appointment_cancelled": true,
    "appointment_confirmed": false,
    "no_show_notification": true,
    "application_progress_update": true,
    "onboarding_started": true,
    "onboarding_completed": true,
    "level_upgraded": true,
    "successful_close": true
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.email_documentation_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.email_documentation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_doc_settings_admin_all" ON public.email_documentation_settings;
CREATE POLICY "email_doc_settings_admin_all"
  ON public.email_documentation_settings
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'ops_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'ops_admin')
  );

-- Audit log: every dispatch decision (sent / suppressed) for traceability
CREATE TABLE IF NOT EXISTS public.email_documentation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  recipient_email text NOT NULL,
  template_name text,
  decision text NOT NULL CHECK (decision IN ('sent','suppressed','error')),
  reason text,
  message_id text,
  related_lead_id uuid,
  related_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_doc_log_event_created
  ON public.email_documentation_log (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_doc_log_recipient_created
  ON public.email_documentation_log (recipient_email, created_at DESC);

ALTER TABLE public.email_documentation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_doc_log_admin_read" ON public.email_documentation_log;
CREATE POLICY "email_doc_log_admin_read"
  ON public.email_documentation_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'ops_admin')
  );

-- Service role inserts only (edge function); no client INSERT policy.