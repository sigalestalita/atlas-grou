## Objetivo

Nas categorias direcionadas a lideranças (Líder de Área, Cid, Alexandre), exibir cada comentário agrupado pelo líder a quem ele se refere — para que seja possível saber sobre quem cada comentário foi escrito.

Hoje, perguntas de texto nessas categorias mostram apenas a lista de comentários sem indicar o líder avaliado. Na categoria "Líder de Área" isso é especialmente problemático, pois mistura comentários sobre líderes diferentes.

## Backend — `supabase/functions/public-report/index.ts`

Em `buildQuestionStats`, para perguntas do tipo `text` em buckets de liderança, anexar o `evaluated_leader` em cada comentário ao invés de retornar apenas strings.

- Mudar o shape de `comments` quando o bucket é de liderança: `Array<{ text: string; leader: string }>` em vez de `string[]`.
- Manter dedupe por texto normalizado, mas preservar o `evaluated_leader` da primeira ocorrência.
- Adicionar no payload da pergunta um `comments_by_leader: Array<{ leader: string; comments: string[] }>`, ordenado por nome do líder, com os comentários agrupados.
- Para o bucket Organizacional (sem líder), manter o formato atual (`comments: string[]`).

Sinalizar isso passando uma flag `groupByLeader` ao `buildQuestionStats` via `buildBucket` (true para `lider-area`, `cid`, `alexandre`; false para `organizacional`).

## Frontend — `src/pages/PublicReport.tsx`

- Estender o tipo `Question` com `comments_by_leader?: Array<{ leader: string; comments: string[] }>`.
- No `QuestionCard`, quando `comments_by_leader` existir e não estiver vazio:
  - Renderizar uma seção por líder, com o nome do líder como cabeçalho discreto (chip ou subtítulo) acima das blockquotes daquele líder.
  - Manter o mesmo estilo visual das blockquotes atuais.
- Fallback: se `comments_by_leader` estiver ausente (categoria Organizacional), manter o render atual.

## Observações

- Não muda contagens, distribuições nem o pareamento de sessões — somente o agrupamento visual dos comentários de texto nas categorias de liderança.
- Para Cid e Alexandre, todos os comentários ficarão sob o nome do próprio líder (é coerente e confirma o filtro). Posso, alternativamente, ocultar o cabeçalho quando houver apenas um líder no bucket — me avise se preferir.

## Validação

Recarregar `/relatorio/tectaris`:
- "Líder de Área" → comentários agrupados por nome do líder de área avaliado.
- "Cid" / "Alexandre" → comentários agrupados sob o próprio nome (ou sem cabeçalho, conforme decisão acima).
- "Organizacional" → inalterado.
