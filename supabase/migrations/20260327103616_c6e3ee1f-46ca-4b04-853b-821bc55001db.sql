
-- 1. ROLE DEFINITIONS
CREATE TABLE public.role_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code text UNIQUE NOT NULL,
  role_name text NOT NULL,
  role_order integer NOT NULL,
  next_level_code text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.role_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read role definitions" ON public.role_definitions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.role_definitions (level_code, role_name, role_order, next_level_code, description) VALUES
  ('L0', 'Bewerber', 0, 'L1', 'Applicant – potential candidate in evaluation'),
  ('L1', 'Opener', 1, 'L2', 'First contact and lead activation specialist'),
  ('L2', 'Associate Setter', 2, 'L3', 'Appointment booking and initial qualification'),
  ('L3', 'Senior Setter', 3, 'L4', 'Advanced qualification and closer-ready handoff'),
  ('L4', 'Junior Closer', 4, 'L5', 'Entry-level closing with structured support'),
  ('L5', 'Managing Closer', 5, 'L6', 'Mid-tier closer with team responsibilities'),
  ('L6', 'Senior Closer', 6, 'L7', 'High-performance closer with mentoring duties'),
  ('L7', 'Director', 7, 'L8', 'Operational lead with team and pipeline oversight'),
  ('L8', 'Partner', 8, NULL, 'Strategic partner with executive-level access');

-- 2. ROLE PERMISSIONS
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code text NOT NULL,
  section_key text NOT NULL,
  can_view boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_export boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(level_code, section_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.role_permissions (level_code, section_key, can_view, can_edit, can_export) VALUES
('L0', 'dashboard', true, false, false),
('L0', 'start_here', true, false, false),
('L1', 'dashboard', true, false, false),
('L1', 'start_here', true, false, false),
('L1', 'academy', true, false, false),
('L1', 'opener_workspace', true, true, false),
('L1', 'trainee_community', true, true, false),
('L1', 'practice', true, true, false),
('L2', 'dashboard', true, false, false),
('L2', 'start_here', true, false, false),
('L2', 'academy', true, false, false),
('L2', 'setter_workspace', true, true, false),
('L2', 'objection_handling', true, false, false),
('L2', 'trainee_community', true, true, false),
('L2', 'associate_community', true, true, false),
('L2', 'practice', true, true, false),
('L3', 'dashboard', true, false, false),
('L3', 'start_here', true, false, false),
('L3', 'academy', true, false, false),
('L3', 'setter_workspace', true, true, false),
('L3', 'objection_handling', true, false, false),
('L3', 'closing_questions', true, false, false),
('L3', 'trainee_community', true, true, false),
('L3', 'associate_community', true, true, false),
('L3', 'practice', true, true, false),
('L3', 'placement', true, false, false),
('L4', 'dashboard', true, false, true),
('L4', 'academy', true, false, false),
('L4', 'closer_workspace', true, true, false),
('L4', 'closer_framework', true, false, false),
('L4', 'call_framework', true, false, false),
('L4', 'objection_handling', true, false, false),
('L4', 'closing_questions', true, false, false),
('L4', 'closer_simulator', true, true, false),
('L4', 'certification', true, false, false),
('L4', 'placement', true, true, false),
('L4', 'closer_community', true, true, false),
('L4', 'practice', true, true, false),
('L5', 'dashboard', true, false, true),
('L5', 'academy', true, false, false),
('L5', 'closer_workspace', true, true, false),
('L5', 'closer_framework', true, false, false),
('L5', 'call_framework', true, false, false),
('L5', 'closer_simulator', true, true, false),
('L5', 'certification', true, false, true),
('L5', 'placement', true, true, true),
('L5', 'closer_community', true, true, false),
('L5', 'advanced_lab', true, false, false),
('L5', 'mentor_space', true, true, false),
('L5', 'build_your_team', true, false, false),
('L5', 'closer_benefits', true, false, false),
('L5', 'practice', true, true, false),
('L6', 'dashboard', true, false, true),
('L6', 'academy', true, false, false),
('L6', 'closer_workspace', true, true, false),
('L6', 'closer_framework', true, false, false),
('L6', 'call_framework', true, false, false),
('L6', 'closer_simulator', true, true, false),
('L6', 'certification', true, true, true),
('L6', 'placement', true, true, true),
('L6', 'closer_community', true, true, false),
('L6', 'advanced_lab', true, true, false),
('L6', 'mentor_space', true, true, false),
('L6', 'build_your_team', true, true, false),
('L6', 'closer_benefits', true, false, false),
('L6', 'pool', true, false, false),
('L6', 'radiant', true, false, false),
('L6', 'practice', true, true, false),
('L7', 'dashboard', true, true, true),
('L7', 'academy', true, true, false),
('L7', 'closer_workspace', true, true, false),
('L7', 'pool', true, true, true),
('L7', 'placement', true, true, true),
('L7', 'closer_community', true, true, false),
('L7', 'advanced_lab', true, true, false),
('L7', 'mentor_space', true, true, false),
('L7', 'inner_circle', true, true, false),
('L7', 'tools', true, true, false),
('L7', 'certification', true, true, true),
('L7', 'build_your_team', true, true, true),
('L7', 'closer_benefits', true, true, false),
('L7', 'radiant', true, true, false),
('L8', 'dashboard', true, true, true),
('L8', 'academy', true, true, true),
('L8', 'pool', true, true, true),
('L8', 'placement', true, true, true),
('L8', 'closer_community', true, true, false),
('L8', 'advanced_lab', true, true, true),
('L8', 'mentor_space', true, true, true),
('L8', 'inner_circle', true, true, true),
('L8', 'tools', true, true, true),
('L8', 'certification', true, true, true),
('L8', 'build_your_team', true, true, true),
('L8', 'closer_benefits', true, true, true),
('L8', 'radiant', true, true, true);

-- 3. KPI DEFINITIONS
CREATE TABLE public.kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code text NOT NULL,
  kpi_key text NOT NULL,
  kpi_name text NOT NULL,
  description text,
  unit_type text NOT NULL DEFAULT 'number',
  target_value numeric(12,2) NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(level_code, kpi_key)
);

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read kpi definitions" ON public.kpi_definitions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.kpi_definitions (level_code, kpi_key, kpi_name, description, unit_type, target_value, display_order) VALUES
('L1', 'leads_contacted', 'Leads kontaktiert', 'Anzahl kontaktierter Leads', 'count', 140, 1),
('L1', 'response_rate', 'Antwortquote', 'Prozent der Leads die antworten', 'percent', 45, 2),
('L1', 'booked_calls', 'Gebuchte Calls', 'Anzahl gebuchter Termine', 'count', 42, 3),
('L1', 'crm_quality', 'CRM Qualität', 'Datenqualität im CRM', 'percent', 95, 4),
('L2', 'calls_held', 'Calls gehalten', 'Setter-Calls durchgeführt', 'count', 32, 1),
('L2', 'qualified_leads', 'Qualifizierte Leads', 'Leads qualifiziert für Closer', 'count', 21, 2),
('L2', 'show_up_rate', 'Show-Up Rate', 'Erscheinungsrate zu Terminen', 'percent', 80, 3),
('L2', 'closer_ready_handoffs', 'Closer-Ready Übergaben', 'An Closer übergebene Leads', 'count', 18, 4),
('L3', 'calls_held', 'Calls gehalten', 'Setter-Calls durchgeführt', 'count', 55, 1),
('L3', 'qualified_leads', 'Qualifizierte Leads', 'Leads qualifiziert', 'count', 42, 2),
('L3', 'stronger_handoffs', 'Starke Übergaben', 'Hochqualitative Closer-Übergaben', 'count', 33, 3),
('L3', 'show_up_rate', 'Show-Up Rate', 'Erscheinungsrate', 'percent', 82, 4),
('L4', 'closing_calls', 'Closing Calls', 'Durchgeführte Closing-Calls', 'count', 28, 1),
('L4', 'closes', 'Abschlüsse', 'Erfolgreiche Abschlüsse', 'count', 8, 2),
('L4', 'close_rate', 'Close Rate', 'Abschlussquote', 'percent', 28, 3),
('L4', 'revenue_generated', 'Umsatz', 'Generierter Umsatz', 'currency', 22000, 4),
('L4', 'earnings_per_call', 'Earnings/Call', 'Umsatz pro Call', 'currency', 785, 5),
('L5', 'closing_calls', 'Closing Calls', 'Durchgeführte Closing-Calls', 'count', 45, 1),
('L5', 'closes', 'Abschlüsse', 'Erfolgreiche Abschlüsse', 'count', 13, 2),
('L5', 'close_rate', 'Close Rate', 'Abschlussquote', 'percent', 29, 3),
('L5', 'revenue_generated', 'Umsatz', 'Generierter Umsatz', 'currency', 45000, 4),
('L5', 'earnings_per_call', 'Earnings/Call', 'Umsatz pro Call', 'currency', 1000, 5),
('L6', 'closing_calls', 'Closing Calls', 'Durchgeführte Closing-Calls', 'count', 63, 1),
('L6', 'closes', 'Abschlüsse', 'Erfolgreiche Abschlüsse', 'count', 20, 2),
('L6', 'close_rate', 'Close Rate', 'Abschlussquote', 'percent', 31, 3),
('L6', 'revenue_generated', 'Umsatz', 'Generierter Umsatz', 'currency', 72000, 4),
('L6', 'earnings_per_call', 'Earnings/Call', 'Umsatz pro Call', 'currency', 1143, 5),
('L7', 'pipeline_health', 'Pipeline Gesundheit', 'Gesamtzustand der Pipeline', 'percent', 85, 1),
('L7', 'stage_conversion', 'Stage Conversion', 'Stufenkonversion gesamt', 'percent', 70, 2),
('L7', 'stuck_leads', 'Blockierte Leads', 'Leads >7 Tage ohne Fortschritt', 'count', 5, 3),
('L7', 'team_output', 'Team Output', 'Gesamt-Abschlüsse des Teams', 'count', 40, 4),
('L8', 'total_revenue', 'Gesamtumsatz', 'Aggregierter Umsatz', 'currency', 250000, 1),
('L8', 'funnel_health', 'Funnel Health', 'Gesamtqualität des Funnels', 'percent', 80, 2),
('L8', 'promotion_readiness', 'Promotion Readiness', 'Promotionsbereite User', 'count', 4, 3),
('L8', 'overall_conversion', 'Gesamtkonversion', 'Lead-to-Close Rate', 'percent', 18, 4);

-- 4. CERTIFICATION STATUS
CREATE TABLE public.certification_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  current_level text NOT NULL,
  certification_readiness_score numeric(5,2) NOT NULL DEFAULT 0,
  completed_modules_count integer DEFAULT 0,
  required_modules_count integer DEFAULT 0,
  eligible_for_next_level boolean DEFAULT false,
  missing_requirements jsonb DEFAULT '[]'::jsonb,
  pdf_export_available boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.certification_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own certification" ON public.certification_status
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System upsert certification" ON public.certification_status
  FOR ALL TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 5. LEAD EVENTS
CREATE TABLE public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_stage text,
  to_stage text,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_timestamp timestamptz DEFAULT now(),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own lead events" ON public.lead_events
  FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System insert lead events" ON public.lead_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_lead_events_lead_id ON public.lead_events(lead_id);
CREATE INDEX idx_lead_events_actor ON public.lead_events(actor_user_id);
CREATE INDEX idx_lead_events_type ON public.lead_events(event_type);
CREATE INDEX idx_lead_events_ts ON public.lead_events(event_timestamp);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_kpi_snap_uw ON public.kpi_snapshots(user_id, week_start);

-- 6. SQL VIEWS
CREATE OR REPLACE VIEW public.view_user_promotion_status AS
SELECT
  p.id AS user_id, p.full_name, p.business_stage,
  rd.level_code, rd.role_name, rd.next_level_code,
  cs.certification_readiness_score AS promotion_readiness_percent,
  cs.completed_modules_count, cs.required_modules_count,
  CASE WHEN cs.required_modules_count > 0
    THEN ROUND((cs.completed_modules_count::numeric / cs.required_modules_count) * 100, 1)
    ELSE 0 END AS content_completion_percent,
  cs.eligible_for_next_level, cs.missing_requirements
FROM profiles p
LEFT JOIN role_definitions rd ON rd.level_code = CASE p.business_stage
  WHEN 'prospect' THEN 'L0' WHEN 'opener' THEN 'L1'
  WHEN 'setter' THEN 'L2' WHEN 'associate_setter' THEN 'L2'
  WHEN 'senior_associate' THEN 'L3' WHEN 'junior_manager' THEN 'L4'
  WHEN 'manager' THEN 'L5' WHEN 'senior_manager' THEN 'L6'
  WHEN 'director' THEN 'L7' WHEN 'partner' THEN 'L8' ELSE 'L0' END
LEFT JOIN certification_status cs ON cs.user_id = p.id;

CREATE OR REPLACE VIEW public.view_lead_pipeline_summary AS
SELECT stage, COUNT(*) AS lead_count,
  COUNT(*) FILTER (WHERE stage = 'closed_won') AS won_count,
  COUNT(*) FILTER (WHERE stage = 'closed_lost') AS lost_count,
  COALESCE(AVG(deal_value) FILTER (WHERE deal_value > 0), 0) AS avg_revenue
FROM leads GROUP BY stage;

CREATE OR REPLACE VIEW public.view_director_team_kpis AS
SELECT p.id AS user_id, p.full_name, rd.role_name, rd.level_code,
  mk.closing_rate, mk.show_rate, mk.revenue_closed, mk.calls_handled,
  mk.follow_up_rate, mk.crm_hygiene_score, mk.storno_rate,
  cs.certification_readiness_score AS readiness
FROM profiles p
LEFT JOIN role_definitions rd ON rd.level_code = CASE p.business_stage
  WHEN 'prospect' THEN 'L0' WHEN 'opener' THEN 'L1'
  WHEN 'setter' THEN 'L2' WHEN 'associate_setter' THEN 'L2'
  WHEN 'senior_associate' THEN 'L3' WHEN 'junior_manager' THEN 'L4'
  WHEN 'manager' THEN 'L5' WHEN 'senior_manager' THEN 'L6'
  WHEN 'director' THEN 'L7' WHEN 'partner' THEN 'L8' ELSE 'L0' END
LEFT JOIN member_kpis mk ON mk.user_id = p.id
LEFT JOIN certification_status cs ON cs.user_id = p.id
WHERE p.business_stage NOT IN ('prospect')
ORDER BY rd.role_order;

CREATE OR REPLACE VIEW public.view_partner_summary AS
SELECT
  (SELECT COUNT(*) FROM leads) AS total_leads,
  (SELECT COUNT(*) FROM leads WHERE stage NOT IN ('closed_won','closed_lost','cancelled','recycled','converted_to_L1')) AS active_pipeline,
  (SELECT COUNT(*) FROM leads WHERE stage = 'closed_won') AS won_leads,
  (SELECT COUNT(*) FROM leads WHERE stage = 'closed_lost') AS lost_leads,
  (SELECT COALESCE(SUM(deal_value),0) FROM leads WHERE stage = 'closed_won') AS total_revenue,
  (SELECT ROUND(COUNT(*) FILTER (WHERE stage='closed_won')::numeric / NULLIF(COUNT(*) FILTER (WHERE stage IN ('closed_won','closed_lost')),0)*100,1) FROM leads) AS average_close_rate,
  (SELECT COUNT(*) FROM certification_status WHERE certification_readiness_score >= 85) AS users_near_promotion
