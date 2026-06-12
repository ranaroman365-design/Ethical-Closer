INSERT INTO public.ab_slot_weights (slot, variant, weight) VALUES
  ('closer_now_hero_headline', 'A_mehr_vom_leben', 0.25),
  ('closer_now_hero_headline', 'B_kannst_du', 0.25),
  ('closer_now_hero_headline', 'C_90_sekunden', 0.25),
  ('closer_now_hero_headline', 'D_ungeeignet', 0.25),
  ('closer_now_cta', 'A_potenzial', 0.25),
  ('closer_now_cta', 'B_pruefen', 0.25),
  ('closer_now_cta', 'C_jetzt_testen', 0.25),
  ('closer_now_cta', 'D_starten', 0.25),
  ('closer_now_process_block', 'A_steps', 0.34),
  ('closer_now_process_block', 'B_journey', 0.33),
  ('closer_now_process_block', 'C_path', 0.33),
  ('closer_now_disqualifier_copy', 'A_klar', 0.34),
  ('closer_now_disqualifier_copy', 'B_direkt', 0.33),
  ('closer_now_disqualifier_copy', 'C_ehrlich', 0.33),
  ('closer_now_final_cta', 'A_potenzial', 0.34),
  ('closer_now_final_cta', 'B_klarheit', 0.33),
  ('closer_now_final_cta', 'C_entscheidung', 0.33)
ON CONFLICT (slot, variant) DO NOTHING;