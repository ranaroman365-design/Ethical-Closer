
CREATE OR REPLACE FUNCTION public.award_module_credits(_amount integer, _module_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 50 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  UPDATE public.profiles SET credits_balance = COALESCE(credits_balance, 0) + _amount WHERE id = uid;
  INSERT INTO public.user_credit_log (user_id, amount, type, reference_id, note)
    VALUES (uid, _amount, 'module_complete', _module_id, 'community_learn_module');

  RETURN jsonb_build_object('ok', true, 'awarded', _amount);
END;
$$;
