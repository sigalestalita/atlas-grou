-- Deixa a rodada 360 do IEE pronta para rodar.
--
-- Três coisas, todas idempotentes.

-- ── 1. A pesquisa vai ao ar ─────────────────────────────────────────────────
-- O seed a criou como rascunho para que a hora de abrir fosse uma decisão de
-- quem conduz. Foi decidida: os sete links passam a valer a partir daqui.
-- Sem prazo de fechamento — dá para definir um em Pesquisa › Fecha em.
UPDATE public.surveys
SET status = 'active'
WHERE id = 'e1e00000-0000-4000-8000-000000000002'::uuid
  AND status <> 'active';

-- ── 2. Um número de duração só na tela ──────────────────────────────────────
-- O texto de abertura dizia "cerca de 15 minutos" e a tela calcula o tempo por
-- conta própria, logo abaixo. Dois números diferentes na mesma tela fazem quem
-- lê desconfiar dos dois.
UPDATE public.surveys
SET intro_text = 'Cada pessoa da diretoria avalia todos os colegas e também a si mesma. São três perguntas por avaliação: uma nota e dois campos abertos. Dá para parar e voltar depois — o que você escreveu fica guardado.'
WHERE id = 'e1e00000-0000-4000-8000-000000000002'::uuid;

-- ── 3. O relatório do IEE deixa de ser público ──────────────────────────────
-- O relatório em /relatorio/<empresa> só pede código quando a empresa tem ao
-- menos um código ativo. O IEE não tinha nenhum, então o endereço abriria para
-- qualquer pessoa — e, numa rodada 360, o que está lá é avaliação franca sobre
-- diretores identificados pelo nome. Este código fecha a porta.
INSERT INTO public.report_access_codes (company_id, code, label, is_active)
SELECT
  'e1e00000-0000-4000-8000-000000000001'::uuid,
  '3PKG-7JUB',
  'Coordenação da rodada 2026.2',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.report_access_codes
  WHERE company_id = 'e1e00000-0000-4000-8000-000000000001'::uuid
);
