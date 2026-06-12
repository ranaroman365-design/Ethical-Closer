CREATE TABLE IF NOT EXISTS public.e2e_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.e2e_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/Owners can view e2e alert settings"
ON public.e2e_alert_settings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Admins/Owners can manage e2e alert settings"
ON public.e2e_alert_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

INSERT INTO public.e2e_alert_settings (key, value, description) VALUES
  ('critical_alert_email', '', 'Empfänger-E-Mail für kritische E2E-Alerts. Leer = keine Mail.'),
  ('critical_alert_enabled', 'true', 'Aktiviert/deaktiviert E-Mail-Alerts bei status=critical.'),
  ('critical_alert_cooldown_minutes', '30', 'Minimaler Abstand zwischen zwei Alert-Mails (Anti-Spam).')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.e2e_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  health_check_id uuid,
  recipient text NOT NULL,
  score integer,
  failed_critical integer,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.e2e_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/Owners can view e2e alert log"
ON public.e2e_alert_log FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));