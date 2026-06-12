-- Re-create mismatch view with security_invoker so RLS of caller applies.
DROP VIEW IF EXISTS public.v_community_access_mismatches;

CREATE VIEW public.v_community_access_mismatches
WITH (security_invoker = true) AS
SELECT
  p.id              AS user_id,
  p.email,
  p.full_name,
  p.current_phase,
  COALESCE(p.community_access, false) AS community_access,
  CASE
    WHEN p.current_phase >= 1 AND COALESCE(p.community_access, false) = false
      THEN 'phase_no_access'
    WHEN COALESCE(p.current_phase, 0) = 0 AND COALESCE(p.community_access, false) = true
      THEN 'access_no_phase'
    ELSE 'ok'
  END AS mismatch_type,
  p.updated_at
FROM public.profiles p
WHERE
     (p.current_phase >= 1 AND COALESCE(p.community_access, false) = false)
  OR (COALESCE(p.current_phase, 0) = 0 AND COALESCE(p.community_access, false) = true);
