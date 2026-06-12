-- Create mentor_suggestions table for the proposal workflow
CREATE TABLE public.mentor_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL,
  mentee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'reviewing', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, mentee_id)
);

-- Enable RLS
ALTER TABLE public.mentor_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can see suggestions they are part of
CREATE POLICY "Users can view own suggestions"
ON public.mentor_suggestions
FOR SELECT
TO authenticated
USING (auth.uid() = mentor_id OR auth.uid() = mentee_id);

-- Users can create suggestions where they are the mentor
CREATE POLICY "Users can suggest mentoring"
ON public.mentor_suggestions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = mentor_id);

-- Admins can view all suggestions
CREATE POLICY "Admins can view all suggestions"
ON public.mentor_suggestions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update suggestions (approve/reject)
CREATE POLICY "Admins can update suggestions"
ON public.mentor_suggestions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_mentor_suggestions_updated_at
BEFORE UPDATE ON public.mentor_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();