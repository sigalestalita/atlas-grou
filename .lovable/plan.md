## Objetivo

A versão "dinâmica" do relatório já existe em `/relatorio/:slug` (page `PublicReport.tsx` + edge function `public-report`). Hoje ela mostra **todos** os comentários, incluindo reenvios/duplicatas. Vou aplicar o mesmo critério de deduplicação que usei no PDF, direto na fonte de dados — assim o link público passa a refletir apenas comentários únicos por respondente.

## O que muda

### 1. Edge function `supabase/functions/public-report/index.ts`

Na função `buildQuestionStats`, ao processar perguntas de texto:
- Normalizar o texto (trim + colapsar espaços + lowercase) só para a chave de comparação.
- Manter o texto original (com capitalização e pontuação) para exibição.
- Remover duplicatas exatas dentro da mesma pergunta + categoria (a categoria já é aplicada antes, no filtro por `evaluated_leader`).
- Retornar também `raw_total` (total antes do dedupe) para podermos exibir "X duplicados removidos".

Importante: o dedupe acontece **por categoria** (Organizacional, Líder de Área, Cid, Alexandre) porque o filtro de `evaluated_leader` já segmenta as respostas antes de chegar no `buildQuestionStats`. Comentário idêntico endereçado a líderes diferentes continua aparecendo nas duas categorias — é o comportamento correto.

### 2. Página `src/pages/PublicReport.tsx`

Pequeno ajuste cosmético no `QuestionCard` das perguntas de texto:
- Quando `raw_total > total`, exibir uma chip discreta "N duplicado(s) removido(s)" ao lado da contagem de comentários únicos, para deixar transparente para quem ler o link que estamos filtrando reenvios.

### 3. Sem mudanças no banco

Nada é apagado. O dedupe é só na camada de leitura — os dados brutos continuam intactos em `survey_responses`.

## Impacto esperado (já confirmado pelos dados)

Comparando com o PDF que acabei de gerar:

| Categoria | Comentários brutos | Únicos (após dedupe) |
|---|---|---|
| Organizacional | ~450 | 409 |
| Líder de Área | ~17 | 15 |
| Cid | ~23 | 21 |
| Alexandre | ~25 | 23 |

A queda nas perguntas de escala (gráficos de barra) **não acontece** — escala continua somando todas as respostas, como hoje.

## Onde ver depois

Mesmo link de sempre: `https://atlas.grougp.com.br/relatorio/tectaris` (ou a URL equivalente no preview/published). A edge function é redeployada automaticamente.

## Observação

Esse comportamento será aplicado a **todas as empresas** que usam o relatório público — não só Tectaris. Acho razoável (dedupe de comentário idêntico é desejável em qualquer caso), mas se você quiser ligar isso só para Tectaris, me diga antes que eu coloco um flag.