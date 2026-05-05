
-- Create evaluation assignments table
CREATE TABLE public.evaluation_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  evaluator_name TEXT NOT NULL,
  evaluatee_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(survey_id, evaluator_name, evaluatee_name)
);

-- Enable RLS
ALTER TABLE public.evaluation_assignments ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "Super admins can do everything with evaluation_assignments"
ON public.evaluation_assignments
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Company admins can manage their assignments
CREATE POLICY "Company admins can manage their evaluation assignments"
ON public.evaluation_assignments
FOR ALL
TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

-- Anon users can view assignments for active surveys
CREATE POLICY "Anon can view assignments for active surveys"
ON public.evaluation_assignments
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM surveys s
  WHERE s.id = evaluation_assignments.survey_id
  AND s.status = 'active'
));

-- Index for fast lookups
CREATE INDEX idx_eval_assignments_survey ON public.evaluation_assignments(survey_id);
CREATE INDEX idx_eval_assignments_evaluator ON public.evaluation_assignments(survey_id, evaluator_name);
