
-- 1. Create canonical_role function
CREATE OR REPLACE FUNCTION public.canonical_role(p_level integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_level
    WHEN 1 THEN 'trainee'
    WHEN 2 THEN 'associate_setter'
    WHEN 3 THEN 'senior_setter'
    WHEN 4 THEN 'junior_closer'
    WHEN 5 THEN 'managing_closer'
    WHEN 6 THEN 'senior_closer'
    WHEN 7 THEN 'director'
    WHEN 8 THEN 'admin'
    ELSE 'trainee'
  END;
$$;

-- 2. Fix any non-canonical values BEFORE re-adding constraint
UPDATE public.appointments
SET current_owner_role = 'closer'
WHERE current_owner_role IS NOT NULL
  AND current_owner_role NOT IN (
    'trainee','associate_setter','senior_setter',
    'junior_closer','managing_closer','senior_closer',
    'director','admin','setter','closer'
  );

UPDATE public.appointments
SET original_owner_role = 'closer'
WHERE original_owner_role IS NOT NULL
  AND original_owner_role NOT IN (
    'trainee','associate_setter','senior_setter',
    'junior_closer','managing_closer','senior_closer',
    'director','admin','setter','closer'
  );

-- 3. Drop old constraint and replace with canonical values
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_current_owner_role_check;

ALTER TABLE public.appointments ADD CONSTRAINT appointments_current_owner_role_check
  CHECK (current_owner_role IS NULL OR current_owner_role = ANY (ARRAY[
    'trainee','associate_setter','senior_setter',
    'junior_closer','managing_closer','senior_closer',
    'director','admin',
    'setter','closer'
  ]));
