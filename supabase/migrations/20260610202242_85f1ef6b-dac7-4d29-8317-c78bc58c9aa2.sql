INSERT INTO public.ab_slot_weights (slot, variant, weight) VALUES
  ('closer_now_headline', 'A', 0.25),
  ('closer_now_headline', 'B', 0.25),
  ('closer_now_headline', 'C', 0.25),
  ('closer_now_headline', 'D', 0.25),
  ('closer_now_subheadline', 'A', 1.0),
  ('closer_now_cta', 'A', 1.0),
  ('closer_now_process', 'A', 1.0),
  ('closer_now_disqualifier', 'A', 1.0),
  ('closer_now_final_cta', 'A', 1.0)
ON CONFLICT (slot, variant) DO NOTHING;