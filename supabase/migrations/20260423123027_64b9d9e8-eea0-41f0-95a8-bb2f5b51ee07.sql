-- ============================================================
-- AUTO-HEAL: profiles.community_access for L1+ users
-- Closes the only real gap from Prompt 9-11: when a profile
-- is at current_phase >= 1, community_access must be true.
-- Idempotent. Writes a single audit row when it fires.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_profiles_autoheal_community_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_email text;
BEGIN
  -- Only act when the user is L1+ (current_phase >= 1) AND access is not yet granted.
  IF COALESCE(NEW.current_phase, 0) >= 1
     AND COALESCE(NEW.community_access, false) = false THEN

    NEW.community_access := true;

    v_target_email := COALESCE(NEW.email, '(unknown)');

    -- Audit only on real state change (avoid double-logging when nothing changed)
    IF (TG_OP = 'INSERT')
       OR (TG_OP = 'UPDATE' AND COALESCE(OLD.community_access, false) = false) THEN
      BEGIN
        INSERT INTO public.community_access_audit (
          actor_user_id, actor_email, action,
          target_user_id, target_email,
          previous_state, new_state, reason
        ) VALUES (
          NEW.id, v_target_email, 'autoheal_grant',
          NEW.id, v_target_email,
          COALESCE(OLD.community_access, false), true,
          'auto-heal: current_phase=' || COALESCE(NEW.current_phase, 0)::text || ' >=1'
        );
      EXCEPTION WHEN OTHERS THEN
        -- audit failure must never block profile write
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_autoheal_access ON public.profiles;
CREATE TRIGGER trg_profiles_autoheal_access
  BEFORE INSERT OR UPDATE OF current_phase, community_access ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_profiles_autoheal_community_access();

-- ============================================================
-- BACKFILL: heal existing mismatches in one pass.
-- The trigger above will fire for each row and write audit entries.
-- ============================================================

UPDATE public.profiles
SET community_access = true
WHERE current_phase >= 1
  AND COALESCE(community_access, false) = false;

-- ============================================================
-- HELPER VIEW: mismatch detection for the admin panel.
-- Read-only. RLS on underlying profiles still applies.
-- ============================================================

CREATE OR REPLACE VIEW public.v_community_access_mismatches AS
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
