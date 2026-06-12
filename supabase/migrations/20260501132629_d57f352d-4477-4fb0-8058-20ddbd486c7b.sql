
-- Add level tracking to assignment history
ALTER TABLE public.appointment_assignment_history
  ADD COLUMN IF NOT EXISTS reassigned_by_level INT;

-- Replace get_assignable_operators with proper level-based hierarchy
CREATE OR REPLACE FUNCTION public.get_assignable_operators(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  email TEXT,
  current_phase INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT p.id, p.current_phase, p.director_id
    FROM profiles p
    WHERE p.id = p_user_id
  )
  SELECT DISTINCT prof.id, prof.full_name, prof.email, prof.current_phase
  FROM profiles prof, caller c
  WHERE prof.member_status IS DISTINCT FROM 'inactive'
    AND (
      CASE
        -- L8+ (Admin/Partner): see ALL active operators
        WHEN c.current_phase >= 8 THEN
          prof.current_phase >= 1

        -- L7 (Director): self + all users in director subtree (all L6 teams)
        WHEN c.current_phase = 7 THEN
          prof.id = c.id
          OR prof.director_id = c.id
          OR prof.director_id IN (
            SELECT sub.id FROM profiles sub WHERE sub.director_id = c.id
          )

        -- L6 (Senior Closer): self + same director tree up to L5
        WHEN c.current_phase = 6 THEN
          prof.id = c.id
          OR (
            c.director_id IS NOT NULL
            AND prof.director_id = c.director_id
            AND prof.current_phase < c.current_phase
          )
          OR (prof.director_id = c.id AND prof.current_phase <= 5)

        -- L5 (Managing Closer): self + same director tree up to L4
        WHEN c.current_phase = 5 THEN
          prof.id = c.id
          OR (
            c.director_id IS NOT NULL
            AND prof.director_id = c.director_id
            AND prof.current_phase < c.current_phase
          )
          OR (prof.director_id = c.id AND prof.current_phase <= 4)

        -- L4 (Junior Closer): self + same director tree up to L3
        WHEN c.current_phase = 4 THEN
          prof.id = c.id
          OR (
            c.director_id IS NOT NULL
            AND prof.director_id = c.director_id
            AND prof.current_phase < c.current_phase
          )
          OR (prof.director_id = c.id AND prof.current_phase <= 3)

        -- L1–L3: only self (no team assignment capability)
        ELSE
          prof.id = c.id
      END
    )
  ORDER BY prof.current_phase DESC, prof.full_name;
$$;
