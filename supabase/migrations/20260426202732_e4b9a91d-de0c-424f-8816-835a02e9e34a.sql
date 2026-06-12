-- E2E threshold settings — admin-editable, read at runtime by run-e2e-checks
CREATE TABLE IF NOT EXISTS public.e2e_check_thresholds (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'count',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.e2e_check_thresholds ENABLE ROW LEVEL SECURITY;

-- Admins (and owner) can read + write. Reuse existing has_role helper.
CREATE POLICY "Admins read e2e thresholds"
  ON public.e2e_check_thresholds FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE POLICY "Admins update e2e thresholds"
  ON public.e2e_check_thresholds FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE POLICY "Admins insert e2e thresholds"
  ON public.e2e_check_thresholds FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE TRIGGER trg_e2e_check_thresholds_updated_at
  BEFORE UPDATE ON public.e2e_check_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults (mirrors current hard-coded values in run-e2e-checks)
INSERT INTO public.e2e_check_thresholds (key, value, description, unit) VALUES
  ('email_failure_rate_warn',        10,  'E-Mail Failure-Rate (24h): warn ab',                'percent'),
  ('email_failure_rate_critical',    25,  'E-Mail Failure-Rate (24h): critical ab',            'percent'),
  ('email_pending_max_minutes',      30,  'E-Mail darf max. so lange "pending" sein',          'minutes'),
  ('email_pending_warn_count',       1,   'Pending-E-Mails > Schwelle: warn ab',               'count'),
  ('email_pending_critical_count',   5,   'Pending-E-Mails > Schwelle: critical ab',           'count'),
  ('outbound_failed_warn',           10,  'Outbound-Events failed (24h): warn ab',             'count'),
  ('outbound_failed_critical',       25,  'Outbound-Events failed (24h): critical ab',         'count'),
  ('appointment_pending_warn',       1,   'Abgelaufene pending_payment-Reservierungen: warn',  'count'),
  ('appointment_pending_critical',   3,   'Abgelaufene pending_payment-Reservierungen: critical','count')
ON CONFLICT (key) DO NOTHING;