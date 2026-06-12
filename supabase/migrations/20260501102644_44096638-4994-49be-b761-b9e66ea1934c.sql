
-- Add preferred_calendar to leads table (for funnel/booking users)
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS preferred_calendar text DEFAULT NULL;

-- Add preferred_calendar to profiles table (for authenticated members)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS preferred_calendar text DEFAULT NULL;

-- Add check constraint for valid values
ALTER TABLE public.leads 
ADD CONSTRAINT leads_preferred_calendar_check 
CHECK (preferred_calendar IS NULL OR preferred_calendar IN ('google', 'outlook', 'apple', 'ics'));

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_preferred_calendar_check 
CHECK (preferred_calendar IS NULL OR preferred_calendar IN ('google', 'outlook', 'apple', 'ics'));
