
-- Insert simulation call for end-to-end pipeline test
INSERT INTO public.calls (
  id, user_id, status, call_type, funnel_stage, offer_type, price_point,
  awareness_level, emotional_state, lead_source, objection_type,
  is_simulation, simulation_batch_id, result,
  booked_at, showed_at, created_at
) VALUES (
  'a1b2c3d4-0000-4000-a000-000000000001',
  '366e7808-35c7-4329-bd36-323f0f58361e',
  'completed',
  'closing_call',
  'decision',
  'closer',
  4400,
  'solution_aware',
  'interested',
  'instagram',
  'price',
  true,
  'pipeline-test-2026-05-02',
  'won',
  now(), now(), now()
);
