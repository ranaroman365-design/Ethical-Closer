-- Notify referrer (in-app + email) when a referral auto-confirms (status -> 'closed')
-- Triggered AFTER UPDATE on public.referrals.

CREATE OR REPLACE FUNCTION public.notify_referral_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_referrer_email     text;
  v_referrer_name      text;
  v_referred_name      text;
  v_total_confirmed    numeric;
  v_payload            jsonb;
  v_supabase_url       text := 'https://pjufhxzjgdnhvuuvltjn.supabase.co';
  v_anon_key           text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA';
BEGIN
  -- Only fire when status transitions INTO 'closed'
  IF NEW.status IS DISTINCT FROM 'closed' OR OLD.status = 'closed' THEN
    RETURN NEW;
  END IF;

  -- Resolve referrer info
  SELECT email, full_name
    INTO v_referrer_email, v_referrer_name
    FROM public.profiles
   WHERE id = NEW.referrer_id;

  -- Resolve referred user name (fallback to email)
  IF NEW.referred_user_id IS NOT NULL THEN
    SELECT COALESCE(full_name, email)
      INTO v_referred_name
      FROM public.profiles
     WHERE id = NEW.referred_user_id;
  END IF;
  v_referred_name := COALESCE(v_referred_name, NEW.referred_email);

  -- Aggregate confirmed earnings so far (including this row)
  SELECT COALESCE(SUM(payout_amount), 0)
    INTO v_total_confirmed
    FROM public.referrals
   WHERE referrer_id = NEW.referrer_id
     AND status IN ('closed', 'paid');

  -- 1) IN-APP NOTIFICATION
  BEGIN
    INSERT INTO public.notifications (recipient_id, type, title, message, link_path, metadata)
    VALUES (
      NEW.referrer_id,
      'success',
      'Empfehlung bestätigt — Provision freigegeben',
      format(
        '%s hat Closer-Level erreicht. %s€ wurden für deine Empfehlung #%s freigegeben.',
        v_referred_name,
        COALESCE(NEW.payout_amount, 0)::int,
        COALESCE(NEW.referral_index::text, '?')
      ),
      '/members/dashboard',
      jsonb_build_object(
        'referral_id', NEW.id,
        'referral_index', NEW.referral_index,
        'payout_amount', NEW.payout_amount,
        'referred_user_id', NEW.referred_user_id,
        'event', 'referral_confirmed'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_referral_confirmed: notification insert failed: %', SQLERRM;
  END;

  -- 2) EMAIL via send-transactional-email edge function (queued + retried)
  IF v_referrer_email IS NOT NULL AND v_referrer_email <> '' THEN
    v_payload := jsonb_build_object(
      'templateName', 'referral-confirmed',
      'recipientEmail', v_referrer_email,
      'idempotencyKey', 'referral-confirmed-' || NEW.id::text,
      'templateData', jsonb_build_object(
        'referrerName', v_referrer_name,
        'referredName', v_referred_name,
        'payoutAmount', COALESCE(NEW.payout_amount, 0),
        'referralIndex', NEW.referral_index,
        'totalConfirmedEarnings', v_total_confirmed
      )
    );

    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/send-transactional-email',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body    := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_referral_confirmed: email dispatch failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_referral_confirmed ON public.referrals;
CREATE TRIGGER trg_notify_referral_confirmed
AFTER UPDATE OF status ON public.referrals
FOR EACH ROW
WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
EXECUTE FUNCTION public.notify_referral_confirmed();