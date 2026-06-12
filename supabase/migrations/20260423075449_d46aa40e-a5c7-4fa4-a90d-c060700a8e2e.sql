CREATE OR REPLACE FUNCTION public.fn_cpp_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.last_activity_at := now();
  RETURN NEW;
END;
$$;