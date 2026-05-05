
-- Add open_access flag to surveys
ALTER TABLE public.surveys ADD COLUMN open_access boolean NOT NULL DEFAULT false;

-- Allow anon to view active open-access surveys
CREATE POLICY "Anyone can view active open-access surveys"
ON public.surveys
FOR SELECT
TO anon
USING (status = 'active' AND open_access = true);
