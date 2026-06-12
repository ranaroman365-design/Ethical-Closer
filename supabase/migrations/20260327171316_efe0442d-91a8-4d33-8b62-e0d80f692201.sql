
-- System health checks table
CREATE TABLE public.system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_type text NOT NULL DEFAULT 'automated',
  overall_score integer NOT NULL DEFAULT 0,
  checks_passed integer NOT NULL DEFAULT 0,
  checks_failed integer NOT NULL DEFAULT 0,
  checks_total integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'healthy',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Error detection log
CREATE TABLE public.system_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_level text NOT NULL DEFAULT 'LOW',
  category text NOT NULL DEFAULT 'ui',
  title text NOT NULL,
  details text,
  metadata jsonb DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  auto_fix_attempted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can manage health checks" ON public.system_health_checks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage error logs" ON public.system_error_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role insert for edge functions
CREATE POLICY "Service can insert health checks" ON public.system_health_checks
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Service can insert error logs" ON public.system_error_logs
  FOR INSERT TO anon
  WITH CHECK (true);
