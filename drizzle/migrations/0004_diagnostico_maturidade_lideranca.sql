-- Diagnóstico de maturidade da liderança
--
-- Um questionário curto, por link aberto, que devolve na hora um relatório
-- individual para quem respondeu. Não é pesquisa de clima e por isso não mora
-- na tabela `surveys`:
--
-- 1. É IDENTIFICADO por natureza. Quem responde informa nome, e-mail, telefone
--    e empresa antes das perguntas, e recebe um relatório com o próprio nome.
--    A pesquisa de clima vive sob a promessa contrária — resposta sem dono —, e
--    misturar as duas na mesma tabela poria essa promessa a depender de um
--    filtro esquecido em alguma tela.
-- 2. Várias telas escolhem "a pesquisa mais recente da empresa" (o link aberto
--    /survey/:slug, o dashboard, Acompanhamento, Respostas, o relatório
--    público). Um diagnóstico criado na Grou como `survey` passaria a ser a
--    pesquisa mais recente e tomaria o lugar da pesquisa de clima em todas elas.
--
-- Duas tabelas: `diagnostics` (o questionário, por empresa) e
-- `diagnostic_submissions` (cada pessoa que respondeu). O anônimo não lê nem
-- grava a segunda diretamente: envia por `submit_diagnostic`, que valida e
-- calcula a pontuação no banco, e lê o próprio relatório por
-- `get_diagnostic_report`, com o token sorteado no envio.

-- ── Questionário ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diagnostics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  -- Qual leitura o relatório aplica (faixas, pilares, recomendações). Hoje só
  -- existe uma; o campo existe para a próxima não exigir outra tabela.
  model        TEXT NOT NULL DEFAULT 'maturidade_lideranca',
  title        TEXT NOT NULL,
  subtitle     TEXT,
  intro_text   TEXT,
  -- [{ "key": "q1", "text": "…", "dimension": "clareza" }, …]
  questions    JSONB NOT NULL,
  scale_min    INTEGER NOT NULL DEFAULT 0,
  scale_max    INTEGER NOT NULL DEFAULT 5,
  scale_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  opens_at     TIMESTAMPTZ,
  closes_at    TIMESTAMPTZ,
  -- Chamada no fim do relatório ("Conversar com a Grou"). Sem URL, não aparece.
  cta_label    TEXT,
  cta_url      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug),
  CHECK (scale_max > scale_min),
  CHECK (jsonb_typeof(questions) = 'array')
);

COMMENT ON TABLE public.diagnostics IS
  'Diagnóstico por link aberto, IDENTIFICADO, com relatório individual. Separado de surveys de propósito: ver a migração 20261001120000.';

-- ── Quem respondeu ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diagnostic_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostic_id UUID NOT NULL REFERENCES public.diagnostics(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  company_name  TEXT NOT NULL,
  -- { "q1": 3, "q2": 5, … } — as notas como foram dadas.
  answers       JSONB NOT NULL,
  -- Índice de 0 a 100 e faixa, calculados aqui no banco no momento do envio.
  score         INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  level         TEXT NOT NULL,
  -- Abre o relatório individual. Sorteado, não sequencial: quem tem o link vê
  -- aquele relatório e nenhum outro.
  report_token  UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  consent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_submissions_diag
  ON public.diagnostic_submissions(diagnostic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_submissions_email
  ON public.diagnostic_submissions(diagnostic_id, lower(email));

-- ── Acesso ──────────────────────────────────────────────────────────────────
ALTER TABLE public.diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage diagnostics" ON public.diagnostics;
CREATE POLICY "Super admins manage diagnostics" ON public.diagnostics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Company admins manage their diagnostics" ON public.diagnostics;
CREATE POLICY "Company admins manage their diagnostics" ON public.diagnostics
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- O questionário no ar é público: é o que a página do link aberto lê. Não há
-- nada sensível nele — são as perguntas.
DROP POLICY IF EXISTS "Anyone can view active diagnostics" ON public.diagnostics;
CREATE POLICY "Anyone can view active diagnostics" ON public.diagnostics
  FOR SELECT TO anon
  USING (status = 'active');

-- Respostas: só administradores leem. Nenhuma política para o anônimo — ele
-- grava e lê pelas duas funções abaixo, e só o que elas devolvem.
DROP POLICY IF EXISTS "Super admins read submissions" ON public.diagnostic_submissions;
CREATE POLICY "Super admins read submissions" ON public.diagnostic_submissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins delete submissions" ON public.diagnostic_submissions;
CREATE POLICY "Super admins delete submissions" ON public.diagnostic_submissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Company admins read their submissions" ON public.diagnostic_submissions;
CREATE POLICY "Company admins read their submissions" ON public.diagnostic_submissions
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- ── Faixa de maturidade ─────────────────────────────────────────────────────
-- As mesmas fronteiras de `levelFor()` em src/lib/diagnostic.ts. Mudou aqui,
-- muda lá — o teste de lá documenta as fronteiras.
CREATE OR REPLACE FUNCTION public.diagnostic_level(p_score INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score <= 20 THEN 'inicial'
    WHEN p_score <= 40 THEN 'reativa'
    WHEN p_score <= 60 THEN 'em_estruturacao'
    WHEN p_score <= 80 THEN 'estruturada'
    ELSE 'estrategica'
  END
$$;

-- ── Envio ───────────────────────────────────────────────────────────────────
-- Valida tudo que o formulário valida — o link é aberto, então o formulário não
-- é a única porta — e calcula a pontuação aqui, para que ninguém mande um
-- "score": 100 junto com as notas.
--
-- Clique duplo e reenvio pela rede caem no mesmo relatório: o mesmo e-mail com
-- as mesmas notas, no mesmo diagnóstico, nos últimos 10 minutos, devolve o
-- token já gerado em vez de gravar uma segunda linha.
CREATE OR REPLACE FUNCTION public.submit_diagnostic(
  p_diagnostic_id UUID,
  p_name          TEXT,
  p_email         TEXT,
  p_phone         TEXT,
  p_company       TEXT,
  p_answers       JSONB,
  p_consent       BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d        public.diagnostics%ROWTYPE;
  q        JSONB;
  v_key    TEXT;
  v_raw    JSONB;
  v_val    INTEGER;
  v_sum    INTEGER := 0;
  v_n      INTEGER := 0;
  v_clean  JSONB := '{}'::jsonb;
  v_score  INTEGER;
  v_name   TEXT := btrim(coalesce(p_name, ''));
  v_email  TEXT := lower(btrim(coalesce(p_email, '')));
  v_phone  TEXT := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_comp   TEXT := btrim(coalesce(p_company, ''));
  v_token  UUID;
BEGIN
  SELECT * INTO d FROM public.diagnostics WHERE id = p_diagnostic_id;
  IF NOT FOUND OR d.status <> 'active'
     OR (d.opens_at  IS NOT NULL AND d.opens_at  > now())
     OR (d.closes_at IS NOT NULL AND d.closes_at < now()) THEN
    RAISE EXCEPTION 'diagnostic_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF p_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'consent_required' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = 'P0001';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 200 THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = 'P0001';
  END IF;
  -- DDD + número (10 ou 11 dígitos), com ou sem o 55 do país.
  IF char_length(v_phone) < 10 OR char_length(v_phone) > 13 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_comp) < 1 OR char_length(v_comp) > 160 THEN
    RAISE EXCEPTION 'invalid_company' USING ERRCODE = 'P0001';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'invalid_answers' USING ERRCODE = 'P0001';
  END IF;

  -- Todas as perguntas do questionário, cada uma com uma nota inteira dentro
  -- da escala. Chaves a mais são ignoradas; a menos, recusadas.
  FOR q IN SELECT * FROM jsonb_array_elements(d.questions) LOOP
    v_key := q->>'key';
    v_raw := p_answers->v_key;
    IF v_raw IS NULL OR jsonb_typeof(v_raw) <> 'number' THEN
      RAISE EXCEPTION 'missing_answer:%', v_key USING ERRCODE = 'P0001';
    END IF;
    v_val := (v_raw#>>'{}')::numeric::integer;
    IF (v_raw#>>'{}')::numeric <> v_val OR v_val < d.scale_min OR v_val > d.scale_max THEN
      RAISE EXCEPTION 'invalid_answer:%', v_key USING ERRCODE = 'P0001';
    END IF;
    v_sum   := v_sum + (v_val - d.scale_min);
    v_n     := v_n + 1;
    v_clean := v_clean || jsonb_build_object(v_key, v_val);
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'empty_diagnostic' USING ERRCODE = 'P0001';
  END IF;

  -- Índice de 0 a 100: soma dos pontos sobre o máximo possível. Igual a
  -- `scoreFor()` em src/lib/diagnostic.ts.
  v_score := round(v_sum::numeric * 100 / (v_n * (d.scale_max - d.scale_min)));

  SELECT report_token INTO v_token
  FROM public.diagnostic_submissions
  WHERE diagnostic_id = d.id
    AND lower(email) = v_email
    AND answers = v_clean
    AND created_at > now() - interval '10 minutes'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  INSERT INTO public.diagnostic_submissions (
    diagnostic_id, company_id, name, email, phone, company_name,
    answers, score, level
  ) VALUES (
    d.id, d.company_id, v_name, v_email, v_phone, v_comp,
    v_clean, v_score, public.diagnostic_level(v_score)
  )
  RETURNING report_token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_diagnostic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_diagnostic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO anon, authenticated;

-- ── Relatório individual ────────────────────────────────────────────────────
-- Devolve o necessário para desenhar o relatório e nada além: nome, empresa,
-- data e notas. E-mail e telefone ficam de fora — o link do relatório pode ser
-- encaminhado, e não precisa levar o contato junto.
CREATE OR REPLACE FUNCTION public.get_diagnostic_report(p_token UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'submission', jsonb_build_object(
      'name', s.name,
      'company_name', s.company_name,
      'answers', s.answers,
      'score', s.score,
      'level', s.level,
      'created_at', s.created_at
    ),
    'diagnostic', jsonb_build_object(
      'title', d.title,
      'subtitle', d.subtitle,
      'model', d.model,
      'questions', d.questions,
      'scale_min', d.scale_min,
      'scale_max', d.scale_max,
      'scale_labels', d.scale_labels,
      'cta_label', d.cta_label,
      'cta_url', d.cta_url
    ),
    'company', jsonb_build_object(
      'name', c.name,
      'logo_url', c.logo_url,
      'primary_color', c.primary_color,
      'secondary_color', c.secondary_color
    )
  )
  FROM public.diagnostic_submissions s
  JOIN public.diagnostics d ON d.id = s.diagnostic_id
  JOIN public.companies   c ON c.id = s.company_id
  WHERE s.report_token = p_token
$$;

REVOKE ALL ON FUNCTION public.get_diagnostic_report(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_diagnostic_report(UUID) TO anon, authenticated;

-- ── O diagnóstico da Grou ───────────────────────────────────────────────────
-- Criado já no ar: o pedido é um link aberto pronto para circular. Para tirar
-- do ar, a aba Diagnóstico da empresa tem o botão. Idempotente.
INSERT INTO public.diagnostics (
  id, company_id, slug, model, title, subtitle, intro_text,
  questions, scale_min, scale_max, scale_labels, status
)
SELECT
  'd1a90000-0000-4000-8000-000000000001'::uuid,
  c.id,
  'maturidade-lideranca',
  'maturidade_lideranca',
  'Qual a maturidade da liderança da sua empresa?',
  '8 perguntas rápidas, de 0 a 5.',
  'Responda pensando em como a sua empresa funciona hoje, não em como gostaria que funcionasse. No fim você recebe um relatório com o nível de maturidade, os pilares mais fortes e por onde começar.',
  '[
    {"key": "q1", "text": "Temos clareza sobre o que esperamos de um líder.", "dimension": "clareza"},
    {"key": "q2", "text": "Sabemos quais competências diferenciam nossos melhores líderes.", "dimension": "clareza"},
    {"key": "q3", "text": "Avaliamos potencial antes de promover.", "dimension": "potencial"},
    {"key": "q4", "text": "Nossos líderes sabem adaptar sua gestão às diferentes pessoas.", "dimension": "pratica"},
    {"key": "q5", "text": "Existe rotina estruturada de feedback.", "dimension": "pratica"},
    {"key": "q6", "text": "Líderes desenvolvem sucessores.", "dimension": "potencial"},
    {"key": "q7", "text": "Decisões sobre pessoas são baseadas mais em evidências do que percepção.", "dimension": "evidencias"},
    {"key": "q8", "text": "Temos indicadores para avaliar a qualidade da liderança.", "dimension": "evidencias"}
  ]'::jsonb,
  0, 5,
  '["Discordo totalmente", "Discordo", "Discordo em parte", "Concordo em parte", "Concordo", "Concordo totalmente"]'::jsonb,
  'active'
FROM public.companies c
WHERE c.slug = 'grou'
ON CONFLICT (id) DO UPDATE
  SET title        = EXCLUDED.title,
      subtitle     = EXCLUDED.subtitle,
      intro_text   = EXCLUDED.intro_text,
      questions    = EXCLUDED.questions,
      scale_min    = EXCLUDED.scale_min,
      scale_max    = EXCLUDED.scale_max,
      scale_labels = EXCLUDED.scale_labels,
      updated_at   = now();
