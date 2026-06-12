INSERT INTO public.ab_slot_weights (slot, variant, weight) VALUES
  ('closer_now_avatar_filter', 'on', 1),
  ('closer_now_avatar_filter', 'off', 1),
  ('closer_now_disqualifier', 'strict', 1),
  ('closer_now_disqualifier', 'soft', 1),
  ('closer_now_investment_mindset', 'on', 1),
  ('closer_now_investment_mindset', 'off', 1),
  ('closer_now_growth_positioning', 'A', 1),
  ('closer_now_growth_positioning', 'B', 1),
  ('closer_now_growth_positioning', 'C', 1),
  ('closer_now_soft_prequalifier', 'on', 1),
  ('closer_now_soft_prequalifier', 'off', 1)
ON CONFLICT (slot, variant) DO NOTHING;