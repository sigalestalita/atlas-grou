CREATE OR REPLACE FUNCTION public.respondent_by_token(p_token TEXT)
RETURNS TABLE (
  id                    UUID,
  survey_id             UUID,
  company_id            UUID,
  name                  TEXT,
  department            TEXT,
  company_leadership    TEXT,
  department_leadership TEXT,
  status                TEXT,
  responded_at          TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  completed_rounds      JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.survey_id, r.company_id, r.name, r.department,
         r.company_leadership, r.department_leadership,
         r.status, r.responded_at, r.started_at, r.completed_rounds
  FROM public.respondents r
  WHERE r.token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.respondent_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respondent_by_token(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.respondent_by_token(TEXT) IS
  'Único caminho do anônimo até um respondente. Devolve a linha do token informado, sem o token e sem o e-mail. Sem o token não há o que encontrar.';

DROP POLICY IF EXISTS "Anon can look up respondent by token" ON public.respondents;
DROP POLICY IF EXISTS "Anon can view respondent by token" ON public.respondents;
REVOKE SELECT ON public.respondents FROM anon;