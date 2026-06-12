-- Allow admins to update phases (for inline content editing)
CREATE POLICY "Admins update phases"
ON public.phases
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert phases"
ON public.phases
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));