
-- Phase 9: Integration & Next Level
INSERT INTO phases (id, name, description, sort_order)
VALUES (9, 'Integration & Next Level', 'Alles Gelernte integrieren, Perspektiven erkennen und den nächsten Karriereschritt planen.', 9);

-- Phase 9 modules
INSERT INTO modules (id, phase_id, title, description, content_type, sort_order) VALUES
  (gen_random_uuid(), 9, 'Deine Journey im Überblick', 'Opener → Setter → Closer: Die wichtigsten Skills und typischen Fehler je Phase.', 'video', 1),
  (gen_random_uuid(), 9, 'Standortbestimmung', 'Wo stehst du aktuell? Deine KPIs, deine Stärken, deine Entwicklungsfelder.', 'video', 2),
  (gen_random_uuid(), 9, 'Was einen Ethical Top Closer unterscheidet', 'Der Unterschied zwischen normalem Closer, Top Closer und Ethical Top Closer.', 'video', 3),
  (gen_random_uuid(), 9, 'Realistische Perspektiven', 'Einkommen, Entwicklung, Verantwortung und deine Rolle im System.', 'video', 4),
  (gen_random_uuid(), 9, 'Nächste Entwicklungsfelder', 'Skill, Mindset oder Struktur — wo liegt dein größtes Wachstumspotenzial?', 'video', 5),
  (gen_random_uuid(), 9, 'Dein Weg nach der Academy', 'Advanced Lab, Quarterly Crossing, Radiant und weitere Möglichkeiten.', 'video', 6);
