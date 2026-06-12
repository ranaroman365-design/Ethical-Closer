
-- ============================================================
-- 1. Lead Distribution Config per Unit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_distribution_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.operator_units(id) ON DELETE CASCADE UNIQUE,
  mode text NOT NULL DEFAULT 'talent_score' CHECK (mode IN ('talent_score', 'equal', 'manual')),
  min_share_pct numeric NOT NULL DEFAULT 5 CHECK (min_share_pct >= 0 AND min_share_pct <= 100),
  max_share_pct numeric NOT NULL DEFAULT 60 CHECK (max_share_pct >= 0 AND max_share_pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.lead_distribution_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "L6+ and admin can view distribution config"
  ON public.lead_distribution_config FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "L6+ and admin can manage distribution config"
  ON public.lead_distribution_config FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- 2. Lead Distribution Log (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_distribution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.operator_units(id) ON DELETE SET NULL,
  assigned_member_id uuid,
  talent_score numeric,
  share_pct numeric,
  reason text, -- 'talent_weighted', 'equal', 'manual', 'fallback_operator'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_distribution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "L6+ can view distribution log"
  ON public.lead_distribution_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "System can insert distribution log"
  ON public.lead_distribution_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_distribution_log_unit ON public.lead_distribution_log(unit_id);
CREATE INDEX IF NOT EXISTS idx_distribution_log_member ON public.lead_distribution_log(assigned_member_id);
CREATE INDEX IF NOT EXISTS idx_distribution_log_created ON public.lead_distribution_log(created_at);

-- ============================================================
-- 3. get_lead_distribution(p_user_id) — master RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_lead_distribution(p_user_id uuid)
RETURNS TABLE(
  unit_id uuid,
  unit_name text,
  funnel_path text,
  member_id uuid,
  member_name text,
  team_role text,
  talent_score numeric,
  talent_category text,
  current_lead_count bigint,
  recommended_share_pct numeric,
  actual_share_pct numeric,
  delta_pct numeric,
  status text -- 'balanced', 'over_allocated', 'under_allocated'
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_level int;
  v_is_admin boolean;
BEGIN
  SELECT COALESCE(p.current_phase, 0) INTO v_level FROM profiles p WHERE p.id = p_user_id;
  SELECT public.has_role(p_user_id, 'admin') INTO v_is_admin;

  -- Must be L4+
  IF v_level < 4 AND NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH accessible_units AS (
    -- L6: own units, L7: director units, admin: all
    SELECT ou.id AS uid, ou.unit_name AS uname, ou.funnel_path AS fpath
    FROM operator_units ou
    WHERE ou.status = 'active'
      AND (
        v_is_admin
        OR ou.operator_id = p_user_id
        OR (v_level >= 7 AND ou.id IN (SELECT get_director_unit_ids(p_user_id)))
        OR (v_level >= 6 AND ou.id IN (SELECT get_user_unit_ids(p_user_id)))
      )
  ),
  members AS (
    SELECT
      au.uid, au.uname, au.fpath,
      tm.member_id AS mid,
      COALESCE(pr.full_name, 'Unknown') AS mname,
      tm.team_role AS trole
    FROM accessible_units au
    JOIN operator_team_members tm ON tm.unit_id = au.uid
    JOIN profiles pr ON pr.id = tm.member_id
  ),
  scores AS (
    SELECT ts.user_id AS sid, ts.talent_score AS tscore, ts.talent_category AS tcat
    FROM compute_talent_scores(30) ts
  ),
  member_scores AS (
    SELECT
      m.*,
      COALESCE(s.tscore, 0) AS tscore,
      COALESCE(s.tcat, 'unknown') AS tcat
    FROM members m
    LEFT JOIN scores s ON s.sid = m.mid
  ),
  -- Count current leads per member in last 30 days
  lead_counts AS (
    SELECT
      COALESCE(rl.owner_id, rl.setter_id, rl.closer_id) AS op_id,
      COUNT(*) AS lcnt
    FROM real_leads_view rl
    WHERE rl.created_at >= now() - interval '30 days'
    GROUP BY 1
  ),
  -- Distribution config per unit
  configs AS (
    SELECT dc.unit_id AS cuid, dc.mode, dc.min_share_pct, dc.max_share_pct
    FROM lead_distribution_config dc
  ),
  -- Calculate recommended share within each unit
  unit_totals AS (
    SELECT ms.uid,
      SUM(ms.tscore) AS total_score,
      COUNT(*) AS member_count
    FROM member_scores ms
    GROUP BY ms.uid
  ),
  recommended AS (
    SELECT
      ms.uid, ms.uname, ms.fpath, ms.mid, ms.mname, ms.trole, ms.tscore, ms.tcat,
      COALESCE(lc.lcnt, 0) AS lcnt,
      ut.total_score, ut.member_count,
      COALESCE(cfg.mode, 'talent_score') AS dist_mode,
      COALESCE(cfg.min_share_pct, 5) AS min_pct,
      COALESCE(cfg.max_share_pct, 60) AS max_pct,
      -- Recommended share
      CASE
        WHEN COALESCE(cfg.mode, 'talent_score') = 'equal' THEN
          ROUND(100.0 / GREATEST(ut.member_count, 1), 1)
        WHEN ut.total_score > 0 THEN
          GREATEST(
            COALESCE(cfg.min_share_pct, 5),
            LEAST(
              COALESCE(cfg.max_share_pct, 60),
              ROUND(ms.tscore / ut.total_score * 100, 1)
            )
          )
        ELSE
          ROUND(100.0 / GREATEST(ut.member_count, 1), 1)
      END AS rec_share
    FROM member_scores ms
    JOIN unit_totals ut ON ut.uid = ms.uid
    LEFT JOIN configs cfg ON cfg.cuid = ms.uid
    LEFT JOIN lead_counts lc ON lc.op_id = ms.mid
  ),
  -- Normalize so shares sum to 100 per unit
  unit_rec_totals AS (
    SELECT r.uid, SUM(r.rec_share) AS rec_total
    FROM recommended r GROUP BY r.uid
  ),
  normalized AS (
    SELECT r.*,
      ROUND(r.rec_share / GREATEST(urt.rec_total, 1) * 100, 1) AS norm_share
    FROM recommended r
    JOIN unit_rec_totals urt ON urt.uid = r.uid
  ),
  -- Actual share (current lead distribution)
  unit_lead_totals AS (
    SELECT n.uid, SUM(n.lcnt) AS total_leads
    FROM normalized n GROUP BY n.uid
  )
  SELECT
    n.uid,
    n.uname,
    n.fpath,
    n.mid,
    n.mname,
    n.trole,
    n.tscore,
    n.tcat,
    n.lcnt,
    n.norm_share,
    CASE WHEN COALESCE(ult.total_leads, 0) > 0
      THEN ROUND(n.lcnt::numeric / ult.total_leads * 100, 1)
      ELSE 0
    END,
    n.norm_share - CASE WHEN COALESCE(ult.total_leads, 0) > 0
      THEN ROUND(n.lcnt::numeric / ult.total_leads * 100, 1)
      ELSE 0
    END,
    CASE
      WHEN ABS(n.norm_share - CASE WHEN COALESCE(ult.total_leads, 0) > 0
        THEN ROUND(n.lcnt::numeric / ult.total_leads * 100, 1) ELSE 0 END) < 5 THEN 'balanced'
      WHEN n.norm_share > CASE WHEN COALESCE(ult.total_leads, 0) > 0
        THEN ROUND(n.lcnt::numeric / ult.total_leads * 100, 1) ELSE 0 END THEN 'under_allocated'
      ELSE 'over_allocated'
    END
  FROM normalized n
  LEFT JOIN unit_lead_totals ult ON ult.uid = n.uid
  ORDER BY n.uid, n.norm_share DESC;
END;
$$;

-- ============================================================
-- 4. Updated route_lead_to_unit — talent-weighted member assignment
-- ============================================================
CREATE OR REPLACE FUNCTION public.route_lead_to_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit record;
  v_funnel text;
  v_member record;
  v_dist_mode text;
  v_total_score numeric;
  v_rand numeric;
  v_cumulative numeric;
BEGIN
  v_funnel := CASE
    WHEN NEW.source ILIKE '%apply%'            THEN '/apply'
    WHEN NEW.source ILIKE '%qualify%'           THEN '/qualify'
    WHEN NEW.source ILIKE '%high-income%'
      OR NEW.source ILIKE '%his%'              THEN '/high-income-skill'
    WHEN NEW.source ILIKE '%partner%'           THEN '/partners'
    ELSE NULL
  END;

  IF v_funnel IS NOT NULL THEN
    SELECT id, operator_id INTO v_unit
    FROM operator_units
    WHERE funnel_path = v_funnel AND status = 'active'
    LIMIT 1;

    IF v_unit.id IS NOT NULL THEN
      NEW.unit_id := v_unit.id;

      -- Get distribution mode
      SELECT COALESCE(dc.mode, 'talent_score') INTO v_dist_mode
      FROM lead_distribution_config dc WHERE dc.unit_id = v_unit.id;

      IF v_dist_mode IS NULL THEN
        v_dist_mode := 'talent_score';
      END IF;

      -- Try talent-weighted assignment among team members
      IF v_dist_mode = 'talent_score' THEN
        -- Get total talent score for unit members
        SELECT COALESCE(SUM(ts.talent_score), 0) INTO v_total_score
        FROM operator_team_members otm
        JOIN compute_talent_scores(30) ts ON ts.user_id = otm.member_id
        WHERE otm.unit_id = v_unit.id;

        IF v_total_score > 0 THEN
          -- Weighted random selection
          v_rand := random() * v_total_score;
          v_cumulative := 0;

          FOR v_member IN
            SELECT otm.member_id, COALESCE(ts.talent_score, 0) AS tscore
            FROM operator_team_members otm
            LEFT JOIN compute_talent_scores(30) ts ON ts.user_id = otm.member_id
            WHERE otm.unit_id = v_unit.id
            ORDER BY COALESCE(ts.talent_score, 0) DESC
          LOOP
            v_cumulative := v_cumulative + v_member.tscore;
            IF v_cumulative >= v_rand THEN
              NEW.assigned_operator_id := v_member.member_id;

              -- Log the assignment
              INSERT INTO lead_distribution_log (lead_id, unit_id, assigned_member_id, talent_score, share_pct, reason)
              VALUES (NEW.id, v_unit.id, v_member.member_id, v_member.tscore,
                      ROUND(v_member.tscore / v_total_score * 100, 1), 'talent_weighted');
              EXIT;
            END IF;
          END LOOP;
        END IF;

      ELSIF v_dist_mode = 'equal' THEN
        -- Round-robin: pick the member with fewest recent leads
        SELECT otm.member_id INTO v_member
        FROM operator_team_members otm
        LEFT JOIN (
          SELECT assigned_operator_id, COUNT(*) AS cnt
          FROM leads
          WHERE created_at >= now() - interval '7 days'
          GROUP BY 1
        ) lc ON lc.assigned_operator_id = otm.member_id
        WHERE otm.unit_id = v_unit.id
        ORDER BY COALESCE(lc.cnt, 0), random()
        LIMIT 1;

        IF v_member IS NOT NULL THEN
          NEW.assigned_operator_id := v_member.member_id;
          INSERT INTO lead_distribution_log (lead_id, unit_id, assigned_member_id, talent_score, share_pct, reason)
          VALUES (NEW.id, v_unit.id, v_member.member_id, 0, 0, 'equal');
        END IF;
      END IF;

      -- Fallback: operator owns the lead if no member was assigned
      IF NEW.assigned_operator_id IS NULL THEN
        NEW.assigned_operator_id := v_unit.operator_id;
        INSERT INTO lead_distribution_log (lead_id, unit_id, assigned_member_id, talent_score, share_pct, reason)
        VALUES (NEW.id, v_unit.id, v_unit.operator_id, 0, 0, 'fallback_operator');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
