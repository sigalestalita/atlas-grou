
-- Add question type and metadata to survey_questions
ALTER TABLE public.survey_questions
  ADD COLUMN question_type text NOT NULL DEFAULT 'scale',
  ADD COLUMN scale_type text DEFAULT 'avaliacao',
  ADD COLUMN options jsonb DEFAULT NULL,
  ADD COLUMN has_justification boolean NOT NULL DEFAULT false,
  ADD COLUMN justification_prompt text DEFAULT NULL;

-- Add text_value to survey_responses and make value nullable
ALTER TABLE public.survey_responses
  ADD COLUMN text_value text DEFAULT NULL;

ALTER TABLE public.survey_responses
  ALTER COLUMN value DROP NOT NULL;
