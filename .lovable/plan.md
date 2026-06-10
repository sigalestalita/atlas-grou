## Objetivo

Na categoria Organizacional, exibir **todos** os comentários crus (sem dedupe por texto e sem remover stopwords como "Sem comentários"), para que o usuário possa decidir manualmente quais manter.

As categorias de liderança (Líder de Área, Cid, Alexandre) continuam com o comportamento atual.

## Backend — `supabase/functions/public-report/index.ts`

1. Adicionar parâmetro `keepAllComments: boolean` ao `buildQuestionStats` (ou reusar uma flag já no `BucketSpec`).
2. Quando `keepAllComments === true` e a pergunta for `text`:
   - Não aplicar dedupe por `normalize(text)`.
   - Não filtrar `STOPWORDS`.
   - `comments` = todos os textos não-vazios, na ordem original.
   - `total = comments.length`, `duplicates_removed = 0`.
3. No `BucketSpec` do bucket `organizacional`, setar `keepAllComments: true`. Demais buckets ficam como estão.

## Frontend

Sem alteração — `QuestionCard` já renderiza a lista `comments` como veio.

## Validação

Recarregar `/relatorio/tectaris` → Categoria Organizacional:
- Cada pergunta aberta e cada pergunta de comentário de subcategoria exibe todos os comentários enviados (até 23, ou o que houver de sessões ativas no bucket), incluindo repetições e "Sem comentários".
- Categorias de liderança permanecem inalteradas.
