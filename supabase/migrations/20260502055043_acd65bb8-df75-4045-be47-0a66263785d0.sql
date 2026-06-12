
-- Health check results table
CREATE TABLE public.health_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  domain text NOT NULL CHECK (domain IN ('messaging','call_intelligence','automation','system')),
  status text NOT NULL CHECK (status IN ('ok','warning','critical')),
  metric_value numeric DEFAULT 0,
  threshold numeric DEFAULT 0,
  message text,
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_check_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view health check results"
ON public.health_check_results FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_health_check_results_domain ON public.health_check_results (domain, checked_at DESC);
CREATE INDEX idx_health_check_results_status ON public.health_check_results (status, checked_at DESC);

-- Health check alerts table
CREATE TABLE public.health_check_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_result_id uuid REFERENCES public.health_check_results(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  domain text NOT NULL,
  check_name text NOT NULL,
  message text NOT NULL,
  acknowledged boolean DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_check_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view health check alerts"
ON public.health_check_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can acknowledge alerts"
ON public.health_check_alerts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_health_check_alerts_unack ON public.health_check_alerts (acknowledged, created_at DESC);

-- Cleanup: keep only 30 days of health check data
CREATE OR REPLACE FUNCTION public.cleanup_old_health_checks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.health_check_results WHERE checked_at < now() - interval '30 days';
  DELETE FROM public.health_check_alerts WHERE created_at < now() - interval '30 days';
$$;
