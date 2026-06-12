CREATE OR REPLACE FUNCTION public.segment_for_score(_score int)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _score <= 10 THEN 'observer'
    WHEN _score <= 25 THEN 'participant'
    WHEN _score <= 45 THEN 'engaged'
    WHEN _score <= 70 THEN 'builder'
    ELSE 'a_player'
  END;
$$;