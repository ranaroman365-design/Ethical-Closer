
-- 1. Update profiles: migrate old stage names to new 8-level system
UPDATE public.profiles SET business_stage = 'opener' WHERE business_stage = 'trainee';
UPDATE public.profiles SET business_stage = 'setter' WHERE business_stage = 'associate';
UPDATE public.profiles SET business_stage = 'closer' WHERE business_stage IN ('senior_associate');
UPDATE public.profiles SET business_stage = 'placement' WHERE business_stage IN ('junior_manager', 'manager');
UPDATE public.profiles SET business_stage = 'advanced_lab' WHERE business_stage IN ('senior_manager', 'director');
UPDATE public.profiles SET business_stage = 'inner_circle' WHERE business_stage = 'partner';

-- 2. Update default
ALTER TABLE public.profiles ALTER COLUMN business_stage SET DEFAULT 'opener';

-- 3. Update rooms allowed_stages
UPDATE public.rooms SET allowed_stages = array_replace(allowed_stages, 'trainee', 'opener');
UPDATE public.rooms SET allowed_stages = array_replace(allowed_stages, 'associate', 'setter');
UPDATE public.rooms SET allowed_stages = array_replace(allowed_stages, 'senior_associate', 'closer');
UPDATE public.rooms SET allowed_stages = array_replace(allowed_stages, 'junior_manager', 'placement');
UPDATE public.rooms SET allowed_stages = array_replace(allowed_stages, 'senior_manager', 'advanced_lab');
UPDATE public.rooms SET allowed_stages = array_replace(allowed_stages, 'partner', 'inner_circle');

-- Also add community, scaling stages to relevant rooms
UPDATE public.rooms SET allowed_stages = allowed_stages || '{community,scaling,inner_circle}'
  WHERE slug IN ('dashboard', 'help', 'profile', 'radiant');
UPDATE public.rooms SET allowed_stages = allowed_stages || '{community,scaling}'
  WHERE slug IN ('closer-community', 'placement', 'advanced-lab');

-- 4. Update thresholds
UPDATE public.thresholds SET stage_scope = 'opener' WHERE stage_scope = 'trainee';
UPDATE public.thresholds SET stage_scope = 'setter' WHERE stage_scope = 'associate';
UPDATE public.thresholds SET stage_scope = 'closer' WHERE stage_scope = 'senior_associate';
UPDATE public.thresholds SET stage_scope = 'placement' WHERE stage_scope IN ('junior_manager', 'manager');
UPDATE public.thresholds SET stage_scope = 'advanced_lab' WHERE stage_scope IN ('senior_manager', 'director');
UPDATE public.thresholds SET target_stage = 'opener' WHERE target_stage = 'trainee';
UPDATE public.thresholds SET target_stage = 'setter' WHERE target_stage = 'associate';
UPDATE public.thresholds SET target_stage = 'closer' WHERE target_stage = 'senior_associate';
UPDATE public.thresholds SET target_stage = 'placement' WHERE target_stage IN ('junior_manager', 'manager');
UPDATE public.thresholds SET target_stage = 'advanced_lab' WHERE target_stage IN ('senior_manager', 'director');
UPDATE public.thresholds SET target_stage = 'inner_circle' WHERE target_stage = 'partner';

-- 5. Update invite_tokens default
ALTER TABLE public.invite_tokens ALTER COLUMN initial_stage SET DEFAULT 'opener';
UPDATE public.invite_tokens SET initial_stage = 'opener' WHERE initial_stage = 'trainee';
