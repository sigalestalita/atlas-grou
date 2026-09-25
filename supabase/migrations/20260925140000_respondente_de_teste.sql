-- Um respondente de teste, que percorre a pesquisa inteira sem contar em nada.
--
-- Testar a pesquisa abrindo o link de uma pessoa real deixa rastro: marca que
-- ela começou a responder, e se o teste chegar ao fim de uma etapa, grava
-- avaliação de verdade na média de quem foi avaliado. Foi o que aconteceu na
-- conferência desta rodada, e a limpeza teve que ser feita à mão.
--
-- A garantia aqui é a mais forte possível: o respondente marcado como teste
-- NÃO GRAVA RESPOSTA. Não é "grava e depois filtra" — não chega a existir
-- linha. Assim nenhum relatório, média ou exportação pode contá-lo, nem os que
-- rodam fora do aplicativo, como a função do relatório público.
--
-- O que ainda precisa ser filtrado é a própria existência dele: sem isso, a
-- taxa de participação passaria a ser sobre oito pessoas em vez de sete.

ALTER TABLE public.respondents
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.respondents.is_test IS
  'Respondente de ensaio. Percorre a pesquisa sem gravar resposta e fica fora de toda contagem.';

-- As atribuições dele também ficam de fora: senão cada pessoa avaliada
-- passaria a esperar uma avaliação a mais do que realmente vai receber.
ALTER TABLE public.evaluation_assignments
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- ── O respondente ───────────────────────────────────────────────────────────
INSERT INTO public.respondents
  (id, company_id, survey_id, name, email, department, token, is_test)
VALUES (
  'e1e00000-0000-4000-8000-00000000000f'::uuid,
  'e1e00000-0000-4000-8000-000000000001'::uuid,
  'e1e00000-0000-4000-8000-000000000002'::uuid,
  'Ensaio (não conta)',
  NULL,
  'Acesso de teste',
  '7e57e7e5700000112233445566778899aabbccddeeff0011',
  true
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, department = EXCLUDED.department, is_test = true;

-- ── O que ele avalia ────────────────────────────────────────────────────────
-- Os sete de verdade, mais a autoavaliação: assim o ensaio percorre exatamente
-- as mesmas telas que a diretoria vai ver, inclusive a última etapa.
INSERT INTO public.evaluation_assignments
  (survey_id, company_id, evaluator_name, evaluatee_name, evaluatee_role, is_self, is_test)
SELECT
  'e1e00000-0000-4000-8000-000000000002'::uuid,
  'e1e00000-0000-4000-8000-000000000001'::uuid,
  'Ensaio (não conta)',
  alvo.name,
  alvo.department,
  alvo.is_test,
  true
FROM public.respondents alvo
WHERE alvo.survey_id = 'e1e00000-0000-4000-8000-000000000002'::uuid
ON CONFLICT (survey_id, evaluator_name, evaluatee_name) DO UPDATE
  SET evaluatee_role = EXCLUDED.evaluatee_role,
      is_self        = EXCLUDED.is_self,
      is_test        = true;

-- ── A busca pelo token passa a dizer que é ensaio ───────────────────────────
-- É o que faz a pesquisa entrar em modo de ensaio; sem isso o cliente não teria
-- como saber, e gravaria normalmente.
DROP FUNCTION IF EXISTS public.respondent_by_token(TEXT);
CREATE FUNCTION public.respondent_by_token(p_token TEXT)
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
  completed_rounds      JSONB,
  is_test               BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.survey_id, r.company_id, r.name, r.department,
         r.company_leadership, r.department_leadership,
         r.status, r.responded_at, r.started_at, r.completed_rounds, r.is_test
  FROM public.respondents r
  WHERE r.token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.respondent_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respondent_by_token(TEXT) TO anon, authenticated;

-- ── Cinto e suspensório ─────────────────────────────────────────────────────
-- O cliente não grava nada em modo de ensaio, mas um erro de código não pode
-- virar dado sujo na avaliação de alguém: o banco recusa a resposta que venha
-- de um respondente de teste.
CREATE OR REPLACE FUNCTION public.block_test_responses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondent_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.respondents r
                 WHERE r.id = NEW.respondent_id AND r.is_test) THEN
    RETURN NULL;   -- descarta a linha, sem erro: o ensaio segue normalmente
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS survey_responses_block_test ON public.survey_responses;
CREATE TRIGGER survey_responses_block_test
  BEFORE INSERT ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.block_test_responses();

-- As funções de progresso ignoram o respondente de teste, para ele não aparecer
-- no acompanhamento como quem começou ou terminou.
CREATE OR REPLACE FUNCTION public.respondent_start(p_token TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.respondents
  SET started_at = COALESCE(started_at, now())
  WHERE token = p_token AND status <> 'responded' AND NOT is_test;
$$;

CREATE OR REPLACE FUNCTION public.respondent_progress(
  p_token TEXT, p_rounds JSONB, p_finished BOOLEAN
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.respondents
  SET completed_rounds = COALESCE(p_rounds, completed_rounds),
      status       = CASE WHEN p_finished THEN 'responded' ELSE status END,
      responded_at = CASE WHEN p_finished THEN COALESCE(responded_at, now()) ELSE responded_at END
  WHERE token = p_token AND NOT is_test;
$$;
