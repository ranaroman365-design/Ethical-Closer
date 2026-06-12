-- 1. Revenue activation: add payment fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS product_access boolean NOT NULL DEFAULT false;

-- 2. Partner revenue share: add fields to commissions
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS level_depth integer NOT NULL DEFAULT 0;

-- 3. Add referred_by to profiles for partner tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id);

-- 4. Create index for partner lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_source_type ON public.commissions(source_type);
