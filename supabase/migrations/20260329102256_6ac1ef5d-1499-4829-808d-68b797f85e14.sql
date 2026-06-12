
-- Sprint 5a: Seed member_progress
DO $body$
DECLARE
  v_module_ids uuid[];
  v_user_id uuid;
  v_i int;
BEGIN
  SELECT array_agg(id ORDER BY sort_order) INTO v_module_ids FROM modules LIMIT 20;

  v_user_id := 'e37a93c6-46d7-4aa3-a581-73bfbe299ce3';
  FOR v_i IN 1..8 LOOP
    INSERT INTO member_progress (user_id, module_id, completed, completed_at)
    VALUES (v_user_id, v_module_ids[v_i], true, now() - (20-v_i) * interval '1 day')
    ON CONFLICT (user_id, module_id) DO UPDATE SET completed = true, completed_at = now();
  END LOOP;

  v_user_id := '5ca9b064-9f21-4a1f-ad12-e2f8cc47ae1d';
  FOR v_i IN 1..10 LOOP
    INSERT INTO member_progress (user_id, module_id, completed, completed_at)
    VALUES (v_user_id, v_module_ids[v_i], true, now() - (25-v_i) * interval '1 day')
    ON CONFLICT (user_id, module_id) DO UPDATE SET completed = true, completed_at = now();
  END LOOP;

  v_user_id := '15c91e19-1659-4832-9c43-52fa1ae8b91e';
  FOR v_i IN 1..12 LOOP
    INSERT INTO member_progress (user_id, module_id, completed, completed_at)
    VALUES (v_user_id, v_module_ids[v_i], true, now() - (30-v_i) * interval '1 day')
    ON CONFLICT (user_id, module_id) DO UPDATE SET completed = true, completed_at = now();
  END LOOP;

  FOR v_user_id IN 
    SELECT unnest(ARRAY['81d315c5-0f47-488c-9dac-b004e08e7544'::uuid, '53df5aed-eab8-463a-9cee-0ba6ffa17d4b'::uuid, '59bd8374-5aee-48c0-92a7-dd51ea661e42'::uuid])
  LOOP
    FOR v_i IN 1..4 LOOP
      INSERT INTO member_progress (user_id, module_id, completed, completed_at)
      VALUES (v_user_id, v_module_ids[v_i], true, now() - (15-v_i) * interval '1 day')
      ON CONFLICT (user_id, module_id) DO UPDATE SET completed = true, completed_at = now();
    END LOOP;
  END LOOP;
END;
$body$;
