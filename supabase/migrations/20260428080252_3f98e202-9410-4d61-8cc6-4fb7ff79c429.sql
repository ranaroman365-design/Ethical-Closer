-- Layer 38 — Seed Objection Handling Deep Scripts (10 categories, DE/EN)
-- Each: validate → reframe → lead to booking. Stored in message_library, channel='whatsapp'.

INSERT INTO message_library
  (template_key, phase, trigger_event, channel, scope, variant_key, variant_weight,
   timing, body_de, body_en, cta_label_de, cta_label_en, cta_link_var, active, notes)
VALUES
  ('wa_obj_no_time', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Alles gut – genau deshalb macht es Sinn, das einmal kurz sauber zu klären. Sonst bleibt es im Hinterkopf. Was passt dir besser – kurz morgen oder eher Ende der Woche?',
   'All good — that''s exactly why it makes sense to clear this up briefly. Otherwise it stays on your mind. What works better — quick tomorrow or later this week?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: no time. Validate→reframe→two-option close.'),

  ('wa_obj_no_interest', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Alles gut 👍 Ist es grundsätzlich kein Thema für dich oder gerade einfach nicht der richtige Zeitpunkt?',
   'All good 👍 Is it not a topic for you in general, or just not the right moment right now?',
   NULL, NULL, NULL, true,
   'L38 Objection: no interest. Soft probe to separate timing from fit.'),

  ('wa_obj_too_expensive', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Verstehe ich. Genau deshalb macht ein kurzer Call Sinn – dann kannst du einschätzen, ob es sich überhaupt lohnt. Wann passt es dir?',
   'Understood. That''s exactly why a short call makes sense — so you can judge if it''s even worth it. When works for you?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: too expensive / price uncertainty.'),

  ('wa_obj_think_about_it', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Genau dafür ist der Termin da. Danach weißt du sicher, ob es Sinn macht oder nicht. Wann passt dir kurz?',
   'That''s exactly what the call is for. After that you''ll know for sure. When works briefly?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: need to think about it.'),

  ('wa_obj_send_info', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Klar, kann ich machen. Frage ist nur, ob es überhaupt relevant für dich ist – das klären wir am schnellsten im Call. Wann passt dir kurz?',
   'Sure, I can. The question is whether it''s actually relevant for you — fastest way to clarify is a short call. When works?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: send info / avoid effort.'),

  ('wa_obj_not_now', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Alles gut. Dann lass uns einfach einen Zeitpunkt festlegen, der besser passt – dann ist es aus dem Kopf. Wann wäre entspannter für dich?',
   'All good. Let''s just pick a time that works better — then it''s off your mind. When would be more relaxed for you?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: not now.'),

  ('wa_obj_who_are_you', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Gute Frage. Kurz gesagt: wir helfen Leuten dabei, ein planbares High-Income-Skill aufzubauen. Macht aber nur Sinn, wenn es für dich gerade relevant ist. Ist das ein Thema für dich?',
   'Good question. Short version: we help people build a predictable high-income skill. Only makes sense if it''s relevant for you right now. Is that a topic for you?',
   NULL, NULL, NULL, true,
   'L38 Objection: who are you / what is this.'),

  ('wa_obj_have_solution', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Perfekt. Dann geht es eher darum zu schauen, ob es noch besser geht oder ob du schon optimal aufgestellt bist. Lass uns das kurz vergleichen – wann passt dir?',
   'Perfect. Then it''s about checking if there''s room to improve or if you''re already optimally set up. Quick compare — when works?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: already have a solution.'),

  ('wa_obj_too_complicated', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Verstehe ich. Genau deshalb machen wir es im Call einfach und klar. Danach weißt du genau, ob es Sinn macht. Wann passt dir?',
   'Understood. That''s exactly why we keep the call simple and clear. After that you''ll know for sure. When works?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: too complicated.'),

  ('wa_obj_ghosting', 'pre_booking', 'inactivity', 'whatsapp', 'global', 'A', 100, 'immediate',
   'Hey {{name}}, kurze Frage: Sollen wir das Thema einfach abhaken oder passt ein kurzer Termin noch für dich?',
   'Hey {{name}}, quick one: should we close this off, or does a short slot still work for you?',
   'Termin wählen', 'Pick a slot', 'booking_link', true,
   'L38 Objection: silent / ghosting reactivation nudge.')
ON CONFLICT (template_key, variant_key, scope, scope_operator_id, scope_funnel_key) DO UPDATE
SET body_de = EXCLUDED.body_de,
    body_en = EXCLUDED.body_en,
    cta_label_de = EXCLUDED.cta_label_de,
    cta_label_en = EXCLUDED.cta_label_en,
    cta_link_var = EXCLUDED.cta_link_var,
    notes = EXCLUDED.notes,
    active = true,
    updated_at = now();