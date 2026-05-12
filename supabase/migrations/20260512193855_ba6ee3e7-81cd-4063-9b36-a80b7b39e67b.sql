
CREATE POLICY "Anon can view respondent by token"
ON public.respondents FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anon can mark respondent responded"
ON public.respondents FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);
