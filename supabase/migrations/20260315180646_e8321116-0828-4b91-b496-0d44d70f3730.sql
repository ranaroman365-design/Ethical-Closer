
-- Leads table for Sales OS
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  stage TEXT NOT NULL DEFAULT 'new',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_role TEXT, -- 'setter' or 'closer'
  setter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  qualification_checklist JSONB DEFAULT '{}',
  setter_notes TEXT,
  closer_notes TEXT,
  appointment_date TIMESTAMP WITH TIME ZONE,
  deal_value NUMERIC DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Lead transition log
CREATE TABLE public.lead_transitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  previous_stage TEXT NOT NULL,
  new_stage TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_transitions ENABLE ROW LEVEL SECURITY;

-- Leads: admins see all, setters/closers see assigned leads
CREATE POLICY "Admins manage all leads" ON public.leads
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users see own assigned leads" ON public.leads
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR setter_id = auth.uid() OR closer_id = auth.uid());

CREATE POLICY "Users update own assigned leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

-- Lead transitions: admins see all, users see own leads
CREATE POLICY "Admins manage transitions" ON public.lead_transitions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users see own lead transitions" ON public.lead_transitions
  FOR SELECT TO authenticated
  USING (changed_by = auth.uid());

CREATE POLICY "Users insert own transitions" ON public.lead_transitions
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());
