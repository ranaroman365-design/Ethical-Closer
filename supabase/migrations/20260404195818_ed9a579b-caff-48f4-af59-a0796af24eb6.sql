
-- 1. Daily Tasks
CREATE TABLE public.daily_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  task_type TEXT NOT NULL,
  task_title TEXT NOT NULL,
  task_description TEXT,
  task_status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 5,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  related_id UUID,
  related_table TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_daily_tasks_user_date ON public.daily_tasks (user_id, due_date);
CREATE INDEX idx_daily_tasks_status ON public.daily_tasks (task_status);

CREATE POLICY "Users can view own tasks" ON public.daily_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own tasks" ON public.daily_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON public.daily_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all tasks" ON public.daily_tasks FOR SELECT USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'ops_admin') OR public.has_role(auth.uid(), 'support_admin'));

-- 2. Call Outcomes
CREATE TABLE public.call_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  call_id UUID REFERENCES public.calls(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  deal_value NUMERIC DEFAULT 0,
  sold_offer TEXT,
  lost_reason TEXT,
  comment TEXT,
  reschedule_planned BOOLEAN,
  self_rating INTEGER,
  improvement_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.call_outcomes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_call_outcomes_user ON public.call_outcomes (user_id);
CREATE INDEX idx_call_outcomes_call ON public.call_outcomes (call_id);

CREATE POLICY "Users can view own outcomes" ON public.call_outcomes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own outcomes" ON public.call_outcomes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own outcomes" ON public.call_outcomes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all outcomes" ON public.call_outcomes FOR SELECT USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'ops_admin'));

-- 3. Daily Reflections
CREATE TABLE public.daily_reflections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reflection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  worked_well TEXT NOT NULL DEFAULT '',
  did_not_work TEXT NOT NULL DEFAULT '',
  improve_tomorrow TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, reflection_date)
);
ALTER TABLE public.daily_reflections ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_daily_reflections_user ON public.daily_reflections (user_id, reflection_date);

CREATE POLICY "Users can view own reflections" ON public.daily_reflections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own reflections" ON public.daily_reflections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reflections" ON public.daily_reflections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all reflections" ON public.daily_reflections FOR SELECT USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'ops_admin') OR public.has_role(auth.uid(), 'support_admin'));

-- 4. Qualification Checks
CREATE TABLE public.qualification_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID,
  appointment_id UUID,
  need_confirmed BOOLEAN NOT NULL DEFAULT false,
  budget_confirmed BOOLEAN NOT NULL DEFAULT false,
  timing_confirmed BOOLEAN NOT NULL DEFAULT false,
  decision_maker_confirmed BOOLEAN NOT NULL DEFAULT false,
  purpose_clear BOOLEAN NOT NULL DEFAULT false,
  appointment_confirmed BOOLEAN NOT NULL DEFAULT false,
  qualification_score INTEGER GENERATED ALWAYS AS (
    (CASE WHEN need_confirmed THEN 1 ELSE 0 END) +
    (CASE WHEN budget_confirmed THEN 1 ELSE 0 END) +
    (CASE WHEN timing_confirmed THEN 1 ELSE 0 END) +
    (CASE WHEN decision_maker_confirmed THEN 1 ELSE 0 END) +
    (CASE WHEN purpose_clear THEN 1 ELSE 0 END) +
    (CASE WHEN appointment_confirmed THEN 1 ELSE 0 END)
  ) STORED,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.qualification_checks ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_qualification_checks_user ON public.qualification_checks (user_id);

CREATE POLICY "Users can view own checks" ON public.qualification_checks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own checks" ON public.qualification_checks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own checks" ON public.qualification_checks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all checks" ON public.qualification_checks FOR SELECT USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'ops_admin'));
