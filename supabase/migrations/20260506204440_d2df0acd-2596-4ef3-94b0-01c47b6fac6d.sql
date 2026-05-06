CREATE POLICY "Anyone can view companies for survey access"
ON public.companies
FOR SELECT
TO anon
USING (true);