-- Add email_provider routing column to lead_activation_templates
-- Values: 'lovable' (built-in Lovable email), 'external' (external provider e.g. GHL/SMTP), 'auto' (system decides based on availability)
ALTER TABLE public.lead_activation_templates
ADD COLUMN email_provider text NOT NULL DEFAULT 'lovable'
CHECK (email_provider IN ('lovable', 'external', 'auto'));

-- Also add to dispatch matrix config table if it exists for Layer 48
COMMENT ON COLUMN public.lead_activation_templates.email_provider IS 'Email routing: lovable=built-in, external=GHL/SMTP, auto=system decides';