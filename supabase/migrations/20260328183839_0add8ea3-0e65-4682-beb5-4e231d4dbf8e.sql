
CREATE OR REPLACE FUNCTION public.get_user_community_types(p_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.has_role(p_user_id, 'admin'::app_role) THEN ARRAY['trainee','opener','setter','closer','manager','partner','director']
    ELSE (
      SELECT CASE p.business_stage
        WHEN 'prospect' THEN ARRAY['trainee']
        WHEN 'opener' THEN ARRAY['trainee','opener']
        WHEN 'setter' THEN ARRAY['trainee','setter']
        WHEN 'associate_setter' THEN ARRAY['trainee','setter']
        WHEN 'senior_associate' THEN ARRAY['trainee','setter']
        WHEN 'junior_manager' THEN ARRAY['trainee','setter','closer']
        WHEN 'manager' THEN ARRAY['trainee','setter','closer']
        WHEN 'senior_manager' THEN ARRAY['trainee','setter','closer']
        WHEN 'director' THEN ARRAY['trainee','setter','closer','manager','director']
        WHEN 'partner' THEN ARRAY['trainee','setter','closer','manager','partner']
        ELSE ARRAY['trainee']
      END
      FROM profiles p WHERE p.id = p_user_id
    )
  END;
$$;
