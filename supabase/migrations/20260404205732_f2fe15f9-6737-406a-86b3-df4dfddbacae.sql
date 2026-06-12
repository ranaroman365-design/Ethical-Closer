
-- Add pricing fields to appointments
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS priority_price integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pricing_tier text DEFAULT NULL;

-- Create pricing config table
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key text NOT NULL UNIQUE,
  price_cents integer NOT NULL,
  slot_threshold integer NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read pricing (needed for frontend price display)
CREATE POLICY "Anyone can view pricing config"
ON public.pricing_config FOR SELECT
USING (true);

-- Only admins can modify pricing
CREATE POLICY "Admins can manage pricing config"
ON public.pricing_config FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default pricing tiers
INSERT INTO public.pricing_config (tier_key, price_cents, slot_threshold, label, sort_order) VALUES
  ('low', 2700, 10, 'Standard', 1),
  ('medium', 4900, 5, 'Erhöhte Nachfrage', 2),
  ('high', 7900, 2, 'Hohe Nachfrage', 3),
  ('extreme', 9700, 0, 'Letzte Plätze', 4)
ON CONFLICT (tier_key) DO NOTHING;

-- Create function to calculate current priority price
CREATE OR REPLACE FUNCTION public.get_priority_pricing()
RETURNS TABLE(tier_key text, price_cents integer, label text, is_current boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available_count integer;
BEGIN
  -- Count currently bookable priority slots
  SELECT count(*) INTO available_count
  FROM public.availability_slots
  WHERE slot_type = 'priority'
    AND is_active = true
    AND starts_at > now()
    AND current_bookings < max_bookings;

  RETURN QUERY
  SELECT 
    pc.tier_key,
    pc.price_cents,
    pc.label,
    -- Determine which tier is active based on slot count
    CASE 
      WHEN available_count > (SELECT MAX(p2.slot_threshold) FROM public.pricing_config p2 WHERE p2.is_active) 
        THEN pc.tier_key = 'low'
      ELSE pc.slot_threshold = (
        SELECT MAX(p3.slot_threshold) 
        FROM public.pricing_config p3 
        WHERE p3.is_active AND p3.slot_threshold <= available_count
      )
    END as is_current
  FROM public.pricing_config pc
  WHERE pc.is_active = true
  ORDER BY pc.sort_order;
END;
$$;
