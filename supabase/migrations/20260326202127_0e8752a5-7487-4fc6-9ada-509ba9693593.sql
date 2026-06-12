
ALTER TABLE public.member_kpis
  ADD COLUMN IF NOT EXISTS arrival_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS context_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS friction_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awareness_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ownership_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ethical_alignment_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pressure_index numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_awareness_created numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resistance_spikes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_conversion_rate numeric DEFAULT 0;
