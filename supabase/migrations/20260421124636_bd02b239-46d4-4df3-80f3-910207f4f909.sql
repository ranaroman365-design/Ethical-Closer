-- Restrict payment_links public reads: drop overly permissive policy and add token-based RPC
DROP POLICY IF EXISTS "Public reads by token" ON public.payment_links;

-- Create a SECURITY DEFINER function to fetch a single payment link by token
CREATE OR REPLACE FUNCTION public.get_payment_link_by_token(p_token text)
RETURNS SETOF public.payment_links
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.payment_links WHERE token = p_token LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_link_by_token(text) TO anon, authenticated;

-- Allow updating status via token (restricted to status field via separate RPC)
CREATE OR REPLACE FUNCTION public.update_payment_link_status(p_token text, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('opened', 'paid', 'expired', 'pending') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.payment_links SET status = p_status WHERE token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_payment_link_status(text, text) TO anon, authenticated;