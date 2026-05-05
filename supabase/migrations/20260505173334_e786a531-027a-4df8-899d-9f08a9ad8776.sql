
-- Allow authenticated users (e.g. testing as admin) to also insert responses to active surveys
CREATE POLICY "Authenticated users can insert responses"
ON public.survey_responses
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM surveys s WHERE s.id = survey_responses.survey_id AND s.status = 'active'::text
));
