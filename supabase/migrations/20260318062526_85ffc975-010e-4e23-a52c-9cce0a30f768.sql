-- Add Radiant Dashboard and Advanced Lab rooms
INSERT INTO public.rooms (slug, title, sort_order, allowed_stages, config, status)
VALUES 
  ('radiant', 'Radiant', 85, ARRAY['trainee','associate','senior_associate','junior_manager','senior_manager','partner'], '{"icon":"Sparkles","route":"/members/radiant"}', 'active'),
  ('advanced-lab', 'Advanced Lab', 70, ARRAY['senior_manager','partner'], '{"icon":"Microscope","route":"/members/advanced-lab"}', 'active')
ON CONFLICT (slug) DO UPDATE SET 
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  allowed_stages = EXCLUDED.allowed_stages,
  config = EXCLUDED.config;