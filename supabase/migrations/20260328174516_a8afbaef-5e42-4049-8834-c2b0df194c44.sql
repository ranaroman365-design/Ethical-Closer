
-- Add lifecycle status to product_config
ALTER TABLE public.product_config ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.product_config ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.product_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add payout_status to commissions
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS paid_at timestamptz;
