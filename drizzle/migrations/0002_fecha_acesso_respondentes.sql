-- Fecha a leitura e a escrita abertas na tabela de respondentes.
--
-- A política chamava-se "Anon can view respondent by token", mas a regra era
-- `USING (true)`: qualquer pessoa de posse da chave pública do aplicativo — que
-- por definição viaja no navegador de quem abre a pesquisa — conseguia listar
-- TODOS os respondentes de TODAS as empresas, com nome, e-mail e token.
--
-- Duas consequências, ambas sérias:
--
--  1. O token é a credencial da pesquisa. Com a lista em mãos, dá para
--     responder no lugar de qualquer pessoa, em qualquer empresa.
--  2. A lista de nomes e e-mails dos colaboradores de cada empresa cliente
--     ficava exposta, o que é justamente o tipo de dado que essas empresas
--     confiam à plataforma.
--
-- Havia ainda um `FOR UPDATE ... USING (true)`, que permitia alterar qualquer
-- linha: marcar todo mundo como respondido, ou trocar área e liderança — campos
-- que entram na apuração como recorte.
--
-- A correção tem duas camadas. Primeiro, privilégio por coluna: o anônimo passa
-- a enxergar apenas o que a tela da pesquisa realmente usa, e token e e-mail
-- saem do alcance. Depois, a escrita deixa de ser direta e passa por funções
-- que exigem o token — sem o token não há o que alterar.

-- ── Leitura: só as colunas que a pesquisa usa ───────────────────────────────
REVOKE SELECT ON public.respondents FROM anon;
GRANT SELECT (
  id, survey_id, company_id, name, department,
  company_leadership, department_leadership,
  status, responded_at, started_at, completed_rounds
) ON public.respondents TO anon;

-- A política de linha continua permitindo a busca pelo token; o que muda é que
-- o token não pode mais ser LIDO, então não há como enumerar credencial.
DROP POLICY IF EXISTS "Anon can view respondent by token" ON public.respondents;
DROP POLICY IF EXISTS "Anon can look up respondent by token" ON public.respondents;
CREATE POLICY "Anon can look up respondent by token"
ON public.respondents FOR SELECT TO anon
USING (true);

-- ── Escrita: some, e volta como função que exige o token ────────────────────
DROP POLICY IF EXISTS "Anon can mark respondent responded" ON public.respondents;
DROP POLICY IF EXISTS "Anonymous users can update own respondent" ON public.respondents;
REVOKE UPDATE ON public.respondents FROM anon;

/** Registra que a pessoa abriu a pesquisa. Alimenta o "começou e não terminou". */
CREATE OR REPLACE FUNCTION public.respondent_start(p_token TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.respondents
  SET started_at = COALESCE(started_at, now())
  WHERE token = p_token
    AND status <> 'responded';
$$;

/**
 * Guarda as etapas já enviadas e, quando a última fecha, marca a pesquisa como
 * respondida. É o que permite retomar de outro aparelho sem gravar o mesmo voto
 * duas vezes.
 */
CREATE OR REPLACE FUNCTION public.respondent_progress(
  p_token TEXT,
  p_rounds JSONB,
  p_finished BOOLEAN
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.respondents
  SET completed_rounds = COALESCE(p_rounds, completed_rounds),
      status        = CASE WHEN p_finished THEN 'responded' ELSE status END,
      responded_at  = CASE WHEN p_finished THEN COALESCE(responded_at, now()) ELSE responded_at END
  WHERE token = p_token;
$$;

REVOKE ALL ON FUNCTION public.respondent_start(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respondent_progress(TEXT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respondent_start(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respondent_progress(TEXT, JSONB, BOOLEAN) TO anon, authenticated;

COMMENT ON FUNCTION public.respondent_start(TEXT) IS
  'Chamada pela pesquisa anônima. Exige o token: sem ele não há linha a alterar.';
COMMENT ON FUNCTION public.respondent_progress(TEXT, JSONB, BOOLEAN) IS
  'Chamada pela pesquisa anônima ao fim de cada etapa. Exige o token.';