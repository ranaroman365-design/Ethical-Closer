
-- Add setter qualification fields to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS setter_budget_readiness text,
  ADD COLUMN IF NOT EXISTS setter_decision_readiness text,
  ADD COLUMN IF NOT EXISTS setter_problem_clarity text,
  ADD COLUMN IF NOT EXISTS setter_recommendation text,
  ADD COLUMN IF NOT EXISTS setter_qualification_score integer,
  ADD COLUMN IF NOT EXISTS setter_call_outcome text,
  ADD COLUMN IF NOT EXISTS setter_follow_up_date date,
  ADD COLUMN IF NOT EXISTS setter_call_completed_at timestamptz;
