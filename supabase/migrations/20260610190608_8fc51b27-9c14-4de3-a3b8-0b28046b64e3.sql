CREATE TABLE IF NOT EXISTS public.mos_internal_notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('setter','senior_closer','admin')),
  name text NOT NULL,
  phone text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notification_type text NOT NULL DEFAULT 'whatsapp'
    CHECK (notification_type IN ('whatsapp','sms','both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mos_internal_recipients_active
  ON public.mos_internal_notification_recipients (is_active, role);

GRANT SELECT ON public.mos_internal_notification_recipients TO authenticated;
GRANT ALL    ON public.mos_internal_notification_recipients TO service_role;

ALTER TABLE public.mos_internal_notification_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage mos internal recipients"
  ON public.mos_internal_notification_recipients;
CREATE POLICY "admins manage mos internal recipients"
  ON public.mos_internal_notification_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.mos_internal_dispatch_dedup (
  appointment_id uuid NOT NULL,
  recipient_role text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, recipient_role)
);

GRANT SELECT ON public.mos_internal_dispatch_dedup TO authenticated;
GRANT ALL    ON public.mos_internal_dispatch_dedup TO service_role;

ALTER TABLE public.mos_internal_dispatch_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read mos dedup"
  ON public.mos_internal_dispatch_dedup;
CREATE POLICY "admins read mos dedup"
  ON public.mos_internal_dispatch_dedup
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));