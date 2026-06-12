INSERT INTO public.ab_slot_weights (slot, variant, weight) VALUES
  ('closer_now_hero_image', 'A', 0.25),
  ('closer_now_hero_image', 'B', 0.25),
  ('closer_now_hero_image', 'C', 0.25),
  ('closer_now_hero_image', 'D', 0.25),
  ('closer_now_proof_layout', 'grid', 0.5),
  ('closer_now_proof_layout', 'carousel', 0.5),
  ('closer_now_community_section', 'A', 0.5),
  ('closer_now_community_section', 'B', 0.5),
  ('closer_now_visual_density', 'standard', 0.5),
  ('closer_now_visual_density', 'dense', 0.5)
ON CONFLICT (slot, variant) DO NOTHING;