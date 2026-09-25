-- Pesquisa 360: cada pessoa avalia um conjunto de pares e a si mesma.
--
-- O Atlas já tinha a tabela `evaluation_assignments` e uma tela para preenchê-la
-- ("Quem avalia quem"), mas nada lia essas atribuições: a pesquisa montava as
-- etapas a partir da lista de lideranças, então a matriz era uma tela que não
-- produzia efeito nenhum. Esta migração dá o suporte que faltava no banco e o
-- código passa a ler as atribuições.

-- ── Modo da pesquisa ────────────────────────────────────────────────────────
-- 'climate' é a pesquisa de clima de sempre; '360' monta as etapas a partir das
-- atribuições, com uma etapa por pessoa avaliada e uma para a autoavaliação.
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS survey_mode TEXT NOT NULL DEFAULT 'climate'
    CHECK (survey_mode IN ('climate', '360'));

-- ── Pesquisa identificada ───────────────────────────────────────────────────
-- O padrão do produto é anonimato: a resposta não tem dono. Num 360 conduzido
-- entre pares que já se conhecem, a organização às vezes decide o contrário —
-- que a coordenação precisa saber quem escreveu o quê. Isso é uma exceção
-- deliberada, declarada pesquisa a pesquisa, nunca um padrão.
--
-- Quando esta coluna é falsa, o vínculo abaixo é apagado na entrada por um
-- gatilho: não adianta um erro de código tentar gravar o respondente numa
-- pesquisa anônima, o banco recusa o vínculo.
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS identified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.surveys.identified IS
  'Quando true, a resposta guarda quem respondeu e a tela avisa o respondente disso ANTES de ele escrever. Fora daqui, respostas são anônimas.';

-- ── Vínculo com quem respondeu (só em pesquisa identificada) ────────────────
ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS respondent_id UUID REFERENCES public.respondents(id) ON DELETE SET NULL;

-- Quem está sendo avaliado nesta resposta já vive em `evaluated_leader`.
-- Isto marca a autoavaliação, que precisa ficar fora da média dos pares: a
-- comparação entre como a pessoa se vê e como os pares a veem é o que dá
-- sentido ao 360, e misturar as duas apaga justamente essa diferença.
ALTER TABLE public.survey_responses
  ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_survey_responses_evaluatee
  ON public.survey_responses(survey_id, evaluated_leader);

-- O guarda: numa pesquisa que não se declarou identificada, o vínculo com o
-- respondente é descartado na entrada, aconteça o que acontecer no cliente.
CREATE OR REPLACE FUNCTION public.enforce_anonymous_responses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = NEW.survey_id AND s.identified
    ) THEN
      NEW.respondent_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS survey_responses_enforce_anonymous ON public.survey_responses;
CREATE TRIGGER survey_responses_enforce_anonymous
  BEFORE INSERT OR UPDATE ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_anonymous_responses();

-- ── Atribuições ─────────────────────────────────────────────────────────────
-- A matriz já existia; faltava saber quando a linha é a autoavaliação. Dá para
-- deduzir comparando os dois nomes, mas guardar explícito evita depender de
-- grafia idêntica na hora de ler.
ALTER TABLE public.evaluation_assignments
  ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT false;

UPDATE public.evaluation_assignments
SET is_self = true
WHERE lower(btrim(evaluator_name)) = lower(btrim(evaluatee_name))
  AND NOT is_self;

-- O respondente precisa ler as próprias atribuições para saber quem avaliar. A
-- política que existia liberava a leitura para qualquer pesquisa ativa, o que
-- entrega a lista inteira de quem avalia quem para quem tiver a chave pública.
-- Continua liberada apenas dentro da janela da pesquisa, mas o cliente sempre
-- filtra pelo próprio nome.
DROP POLICY IF EXISTS "Anon can view assignments for active surveys" ON public.evaluation_assignments;
CREATE POLICY "Anon can view assignments for active surveys"
ON public.evaluation_assignments
FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.surveys s
  WHERE s.id = evaluation_assignments.survey_id
    AND s.status = 'active'
    AND (s.opens_at  IS NULL OR s.opens_at  <= now())
    AND (s.closes_at IS NULL OR s.closes_at >= now())
));

-- O cargo de quem está sendo avaliado, para a pesquisa poder dizer
-- "Hugo de Oliveira Muller · Presidente" na abertura da etapa. Vive aqui porque
-- quem responde precisa do cargo de OUTRA pessoa, e a pesquisa só carrega o
-- próprio registro de quem está respondendo.
ALTER TABLE public.evaluation_assignments
  ADD COLUMN IF NOT EXISTS evaluatee_role TEXT;
