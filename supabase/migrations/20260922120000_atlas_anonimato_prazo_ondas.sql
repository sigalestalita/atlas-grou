-- Atlas — anonimato por pessoa, prazo de pesquisa e comparação entre ondas.
--
-- 1. submission_id
--    A regra de anonimato do produto é "não mostrar grupo com menos de 3 pessoas".
--    Até aqui o filtro contava LINHAS de resposta, não pessoas: uma pesquisa de
--    10 perguntas fazia UMA pessoa virar 10 linhas e passar folgado pelo mínimo
--    de 3 — ou seja, o departamento com um único respondente aparecia no
--    dashboard. Este id é sorteado no navegador a cada envio e não tem vínculo
--    nenhum com o respondente; serve só para agrupar as linhas de um mesmo
--    envio e contar gente de verdade.
--
-- 2. prazo e ondas
--    A pesquisa não tinha data de encerramento nem identidade de rodada, então
--    não dava para fechar automaticamente nem comparar o clima de um ciclo com
--    o do anterior.

ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS submission_id UUID;

CREATE INDEX IF NOT EXISTS idx_survey_responses_submission
  ON public.survey_responses(survey_id, submission_id);

-- Preenche o histórico: antes desta coluna, as linhas de um mesmo envio
-- compartilhavam o timestamp da transação (now() é o instante do INSERT inteiro)
-- e o líder avaliado. É exatamente a chave de agrupamento que já se usava para
-- contar envios em pesquisas de link aberto.
UPDATE public.survey_responses r
SET submission_id = g.sid
FROM (
  SELECT survey_id,
         submitted_at,
         COALESCE(evaluated_leader, '') AS leader,
         gen_random_uuid() AS sid
  FROM public.survey_responses
  WHERE submission_id IS NULL
  GROUP BY survey_id, submitted_at, COALESCE(evaluated_leader, '')
) g
WHERE r.submission_id IS NULL
  AND r.survey_id = g.survey_id
  AND r.submitted_at = g.submitted_at
  AND COALESCE(r.evaluated_leader, '') = g.leader;

-- Prazo e rodada da pesquisa.
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS opens_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wave_label TEXT;

COMMENT ON COLUMN public.surveys.closes_at IS
  'Quando a pesquisa para de aceitar respostas. Vazio = sem prazo.';
COMMENT ON COLUMN public.surveys.wave_label IS
  'Rótulo da rodada (ex.: "2026.1"), usado para comparar ondas da mesma empresa.';

-- Respondentes: marcar quem começou e não terminou, e quando o lembrete saiu.
ALTER TABLE public.respondents
  ADD COLUMN IF NOT EXISTS started_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count    INTEGER NOT NULL DEFAULT 0;

-- O respondente anônimo precisa poder registrar que começou e que terminou.
-- A política de UPDATE existente cobre 'responded'; esta troca por uma que
-- também aceita 'started_at', sem abrir mais nada.
DROP POLICY IF EXISTS "Anonymous users can update own respondent" ON public.respondents;
CREATE POLICY "Anonymous users can update own respondent"
  ON public.respondents
  FOR UPDATE TO anon
  USING (EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = respondents.survey_id AND s.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = respondents.survey_id AND s.status = 'active'
  ));

-- A pesquisa só aceita resposta dentro do prazo. Vale para anônimo e logado.
DROP POLICY IF EXISTS "Anonymous users can insert responses" ON public.survey_responses;
CREATE POLICY "Anonymous users can insert responses"
  ON public.survey_responses
  FOR INSERT TO anon
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id
      AND s.status = 'active'
      AND (s.opens_at  IS NULL OR s.opens_at  <= now())
      AND (s.closes_at IS NULL OR s.closes_at >= now())
  ));
