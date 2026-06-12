
-- Admin-only credit award (arbitrary type, no daily cap, idempotent on (user, type, reference))
CREATE OR REPLACE FUNCTION public.admin_award_credits(
  _user_id UUID,
  _amount INTEGER,
  _type TEXT,
  _note TEXT DEFAULT NULL,
  _reference UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  new_balance INTEGER;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Idempotency guard when reference is provided
  IF _reference IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_credit_log
       WHERE user_id = _user_id AND type = _type AND reference_id = _reference
    ) THEN
      SELECT credits_balance INTO new_balance FROM public.profiles WHERE id = _user_id;
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'new_balance', new_balance);
    END IF;
  END IF;

  UPDATE public.profiles
     SET credits_balance = COALESCE(credits_balance, 0) + _amount
   WHERE id = _user_id
   RETURNING credits_balance INTO new_balance;

  IF new_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.user_credit_log (user_id, amount, type, reference_id, note)
    VALUES (_user_id, _amount, _type, _reference, _note);

  RETURN jsonb_build_object('ok', true, 'awarded', _amount, 'new_balance', new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_award_credits(UUID,INTEGER,TEXT,TEXT,UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_award_credits(UUID,INTEGER,TEXT,TEXT,UUID) TO authenticated;

-- Placement opportunities: read for any authenticated; admin write
CREATE POLICY "auth_read_placements" ON public.placement_opportunities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_insert_placements" ON public.placement_opportunities
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_update_placements" ON public.placement_opportunities
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Placement applications: each user reads/inserts their own; admin reads/updates all
CREATE POLICY "own_read_placement_apps" ON public.placement_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert_placement_apps" ON public.placement_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_read_placement_apps" ON public.placement_applications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_update_placement_apps" ON public.placement_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Live events: admin write
CREATE POLICY "admin_insert_events" ON public.live_events
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_update_events" ON public.live_events
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Challenge submissions: admin can read all and update status
CREATE POLICY "admin_read_subs" ON public.challenge_submissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_update_subs" ON public.challenge_submissions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- A-player applications: admin update
CREATE POLICY "admin_update_aplayer" ON public.aplayer_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Atomic increment helper for applications_count
CREATE OR REPLACE FUNCTION public.increment_placement_app_count(_opportunity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.placement_opportunities
     SET applications_count = COALESCE(applications_count, 0) + 1
   WHERE id = _opportunity_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_placement_app_count(UUID) TO authenticated;
