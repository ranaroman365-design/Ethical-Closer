CREATE OR REPLACE FUNCTION public.traffic_owner_mappings_validate_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level int;
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id required';
  END IF;

  SELECT NULLIF(regexp_replace(current_level::text, '\D', '', 'g'), '')::int
    INTO v_level
    FROM public.certification_status
   WHERE user_id = NEW.owner_user_id;

  IF v_level IS NULL THEN
    RAISE EXCEPTION 'owner_user_id % has no certification_status record',
                    NEW.owner_user_id;
  END IF;

  IF v_level < 6 THEN
    RAISE EXCEPTION 'owner_user_id % is L%, must be L6+ operator',
                    NEW.owner_user_id, v_level;
  END IF;

  RETURN NEW;
END;
$$;