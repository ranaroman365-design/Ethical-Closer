-- Create table for playbook download requests
CREATE TABLE public.resource_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  resource_name TEXT NOT NULL DEFAULT 'ethical-closing-playbook',
  source TEXT NOT NULL DEFAULT 'masterofsales',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resource_downloads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous/public inserts
CREATE POLICY "Anyone can request a resource download"
ON public.resource_downloads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only authenticated users can view (admin/team access)
CREATE POLICY "Authenticated users can view resource downloads"
ON public.resource_downloads
FOR SELECT
TO authenticated
USING (true);