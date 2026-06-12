CREATE OR REPLACE FUNCTION public.get_function_source(fn_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT prosrc
  FROM pg_proc
  WHERE proname = fn_name
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_function_source(text) TO authenticated;