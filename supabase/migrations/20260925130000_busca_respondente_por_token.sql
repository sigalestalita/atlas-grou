-- Conserta a busca do respondente pelo token.
--
-- A migração anterior tirou `token` e `email` do alcance do anônimo com
-- privilégio por coluna, para acabar com a enumeração de credenciais. Só que no
-- Postgres o privilégio de coluna vale para QUALQUER referência a ela,
-- inclusive no WHERE: sem poder ler `token`, o anônimo também não pode
-- filtrar por `token` — que é exatamente como a pesquisa encontra a pessoa.
--
-- Resultado: todo link individual passou a responder "Link inválido". O link
-- aberto continuou funcionando porque não usa token, o que escondeu o problema.
--
-- A correção é a que deveria ter sido feita de saída: a leitura direta some e o
-- acesso passa por uma função que recebe o token e devolve uma linha só. Quem
-- não tem o token não encontra nada, e o token nunca sai do banco.

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

-- Com a função no lugar, a leitura direta da tabela deixa de ser necessária —
-- e enquanto existir, é superfície de ataque à toa: dava para listar nome, área
-- e liderança de todos os colaboradores de todas as empresas clientes.
DROP POLICY IF EXISTS "Anon can look up respondent by token" ON public.respondents;
DROP POLICY IF EXISTS "Anon can view respondent by token" ON public.respondents;
REVOKE SELECT ON public.respondents FROM anon;
