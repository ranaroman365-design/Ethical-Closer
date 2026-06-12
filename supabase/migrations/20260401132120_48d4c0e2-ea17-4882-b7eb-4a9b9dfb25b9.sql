INSERT INTO public.rooms (slug, title, config) VALUES
  ('closing-os', 'Closing OS', '{"icon": "Crosshair", "route": "/members/closing-os"}'),
  ('simulation-lab', 'Simulation Lab', '{"icon": "Target", "route": "/members/simulation-lab"}'),
  ('call-review', 'Call Review', '{"icon": "Phone", "route": "/members/call-review"}')
ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, config = EXCLUDED.config;