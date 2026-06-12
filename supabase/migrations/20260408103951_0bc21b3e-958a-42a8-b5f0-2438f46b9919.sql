
-- 1. Earn Mode Status — tracks eligibility per user
CREATE TABLE public.earn_mode_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  is_unlocked BOOLEAN NOT NULL DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  required_level TEXT NOT NULL DEFAULT 'L2',
  simulations_passed INTEGER NOT NULL DEFAULT 0,
  qualification_test_passed BOOLEAN NOT NULL DEFAULT false,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  max_concurrent_leads INTEGER NOT NULL DEFAULT 3,
  current_quality_score NUMERIC(4,2) DEFAULT 0,
  lead_flow_status TEXT NOT NULL DEFAULT 'paused',
  total_leads_assigned INTEGER NOT NULL DEFAULT 0,
  total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.earn_mode_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own earn status"
  ON public.earn_mode_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all earn statuses"
  ON public.earn_mode_status FOR ALL
  USING (public.has_role(auth.uid(), 'administrator'));

-- 2. Lead Assignments — tracks which leads are assigned to earning users
CREATE TABLE public.lead_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'assigned',
  lead_type TEXT NOT NULL DEFAULT 'simple',
  assignment_score NUMERIC(6,2) DEFAULT 0,
  call_completed_at TIMESTAMPTZ,
  outcome TEXT,
  outcome_score NUMERIC(4,2),
  feedback_text TEXT,
  deal_value NUMERIC(12,2),
  commission_earned NUMERIC(12,2),
  returned_at TIMESTAMPTZ,
  return_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lead assignments"
  ON public.lead_assignments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all lead assignments"
  ON public.lead_assignments FOR ALL
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE INDEX idx_lead_assignments_user_id ON public.lead_assignments(user_id);
CREATE INDEX idx_lead_assignments_status ON public.lead_assignments(status);
CREATE INDEX idx_lead_assignments_lead_id ON public.lead_assignments(lead_id);

-- 3. Earn Transactions — tracks all earnings
CREATE TABLE public.earn_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  assignment_id UUID REFERENCES public.lead_assignments(id),
  transaction_type TEXT NOT NULL DEFAULT 'commission',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  percentage_applied NUMERIC(5,2),
  deal_value NUMERIC(12,2),
  description TEXT,
  payout_status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.earn_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own earn transactions"
  ON public.earn_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all earn transactions"
  ON public.earn_transactions FOR ALL
  USING (public.has_role(auth.uid(), 'administrator'));

CREATE INDEX idx_earn_transactions_user_id ON public.earn_transactions(user_id);
CREATE INDEX idx_earn_transactions_payout ON public.earn_transactions(payout_status);

-- Triggers for updated_at
CREATE TRIGGER update_earn_mode_status_updated_at
  BEFORE UPDATE ON public.earn_mode_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_assignments_updated_at
  BEFORE UPDATE ON public.lead_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
