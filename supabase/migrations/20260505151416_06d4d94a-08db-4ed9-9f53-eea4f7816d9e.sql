
-- Revoke anon execute on security definer functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(UUID) FROM anon;

-- Restrict to authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_company_id(UUID) TO authenticated;

-- Fix the overly permissive anonymous insert policy
DROP POLICY "Anonymous users can insert responses" ON public.survey_responses;
CREATE POLICY "Anonymous users can insert responses" ON public.survey_responses
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id AND s.status = 'active'
    )
  );
