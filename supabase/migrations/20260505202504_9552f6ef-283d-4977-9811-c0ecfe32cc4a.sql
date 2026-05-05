
-- Add evaluated_leader column to survey_responses to track which leader each response set evaluates
ALTER TABLE public.survey_responses ADD COLUMN evaluated_leader text;

-- Add index for querying by evaluated leader
CREATE INDEX idx_survey_responses_evaluated_leader ON public.survey_responses(evaluated_leader);
