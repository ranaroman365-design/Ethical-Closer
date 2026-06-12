
-- KPI weekly snapshots for trend tracking
CREATE TABLE public.kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  closing_rate numeric DEFAULT 0,
  calls_per_week numeric DEFAULT 0,
  show_rate numeric DEFAULT 0,
  follow_up_rate numeric DEFAULT 0,
  crm_hygiene_score numeric DEFAULT 0,
  storno_rate numeric DEFAULT 0,
  revenue_closed numeric DEFAULT 0,
  calls_handled integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own snapshots" ON public.kpi_snapshots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service insert snapshots" ON public.kpi_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Enable realtime for profiles (for stage change notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
