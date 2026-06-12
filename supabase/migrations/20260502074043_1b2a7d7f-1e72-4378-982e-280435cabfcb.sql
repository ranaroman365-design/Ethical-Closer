
INSERT INTO public.pending_call_analyses (call_id, attempts, enqueued_at)
VALUES ('a1b2c3d4-0000-4000-a000-000000000001', 0, now())
ON CONFLICT DO NOTHING;
