
-- Allow anonymous/unauthenticated lead inserts from Bewerbung form
CREATE POLICY "Public insert leads from bewerbung"
ON public.leads
FOR INSERT
TO anon
WITH CHECK (true);

-- Fix rooms sort_order duplicates
UPDATE public.rooms SET sort_order = 3 WHERE slug = 'closer-benefits';
UPDATE public.rooms SET sort_order = 4 WHERE slug = 'build-your-team';
UPDATE public.rooms SET sort_order = 5 WHERE slug = 'academy';

-- Fix Tools room visibility
UPDATE public.rooms
SET allowed_stages = ARRAY['setter','senior_associate','junior_manager','manager','senior_manager','director','partner']
WHERE slug = 'tools';

-- Document Mentor Space override logic
UPDATE public.rooms
SET description = 'Zugang über user_access_overrides — zugewiesen durch Head Trainer'
WHERE slug = 'mentor-space';

-- Fix existing threshold stage_scope alignment
UPDATE public.thresholds SET stage_scope = 'opener' WHERE stage_scope = 'opener' AND target_stage = 'setter';
UPDATE public.thresholds SET stage_scope = 'setter' WHERE stage_scope = 'setter' AND target_stage = 'placement';
UPDATE public.thresholds SET stage_scope = 'senior_associate' WHERE stage_scope = 'placement' AND target_stage = 'advanced_lab';

-- Insert 5 missing threshold rules using actual jsonb conditions format
INSERT INTO public.thresholds (name, stage_scope, target_stage, condition_type, conditions, outcomes, requires_manual_approval, active) VALUES
  ('Senior Associate → Junior Manager', 'senior_associate', 'junior_manager', 'all',
   '[{"type":"kpi_threshold","metric":"closing_rate","min":20},{"type":"kpi_threshold","metric":"revenue_closed","min":25000},{"type":"kpi_threshold","metric":"calls_handled","min":40}]'::jsonb,
   '[{"type":"change_stage","target_stage":"junior_manager"}]'::jsonb,
   true, true),

  ('Junior Manager → Manager', 'junior_manager', 'manager', 'all',
   '[{"type":"kpi_threshold","metric":"closing_rate","min":25},{"type":"kpi_threshold","metric":"revenue_closed","min":60000},{"type":"kpi_threshold","metric":"calls_handled","min":80}]'::jsonb,
   '[{"type":"change_stage","target_stage":"manager"}]'::jsonb,
   true, true),

  ('Manager → Senior Manager', 'manager', 'senior_manager', 'all',
   '[{"type":"kpi_threshold","metric":"closing_rate","min":30},{"type":"kpi_threshold","metric":"revenue_closed","min":120000},{"type":"kpi_threshold","metric":"calls_handled","min":150}]'::jsonb,
   '[{"type":"change_stage","target_stage":"senior_manager"}]'::jsonb,
   true, true),

  ('Senior Manager → Director', 'senior_manager', 'director', 'all',
   '[{"type":"kpi_threshold","metric":"closing_rate","min":35},{"type":"kpi_threshold","metric":"revenue_closed","min":250000},{"type":"kpi_threshold","metric":"calls_handled","min":250}]'::jsonb,
   '[{"type":"change_stage","target_stage":"director"}]'::jsonb,
   true, true),

  ('Director → Partner', 'director', 'partner', 'all',
   '[{"type":"kpi_threshold","metric":"closing_rate","min":40},{"type":"kpi_threshold","metric":"revenue_closed","min":500000},{"type":"kpi_threshold","metric":"calls_handled","min":400}]'::jsonb,
   '[{"type":"change_stage","target_stage":"partner"}]'::jsonb,
   true, true);
