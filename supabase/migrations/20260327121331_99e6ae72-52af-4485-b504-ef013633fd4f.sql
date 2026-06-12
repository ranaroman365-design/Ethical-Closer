-- Add commission and attribution columns to member_kpis
ALTER TABLE public.member_kpis 
  ADD COLUMN IF NOT EXISTS commission_earned numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setter_influenced_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closer_direct_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_assigned integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_qualified integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_won integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handover_rate numeric DEFAULT 0;