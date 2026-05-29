## Problema

A função `supabase/functions/public-report/index.ts` infla os contadores dos buckets de líder porque conta **sessões de envio** (`DISTINCT submitted_at`) em vez de **respondentes únicos**. Quando um colaborador reabriu o link e enviou duas vezes (ex.: refez a parte organizacional e na 2ª sessão respondeu os líderes), cada envio aparece como um respondente novo.

Números atuais (errados) vs. esperados:

| Categoria | Hoje | Correto |
|---|---|---|
| Organizacional | 23 | 23 |
| Líder de Área | 15 | 13 (de 15) |
| Cid Lauro Vale Junior | 21 | 19 (de 23) |
| Alexandre Daguano | 23 | 21 (de 23) |

A lógica de pareamento sessão→respondente (janela 6h antes / 30min depois do `responded_at`) já existe — mas só é aplicada ao bucket Organizacional. Os buckets de líder usam `countRespondents` com `useTotal=false`, que apenas faz `Set(submitted_at).size`.

## Mudança

Aplicar o mesmo pareamento sessão→respondente aos buckets de líder, **separadamente por bucket** (porque cada respondente pode ter sessões diferentes para "líder de área", "Cid" e "Alexandre"):

1. Para cada bucket (Líder de Área, Cid, Alexandre): coletar `submitted_at`s distintos das respostas que pertencem àquele bucket.
2. Para cada `respondent.responded_at`, escolher a última sessão do bucket dentro da janela (6h antes / 30min depois) e marcá-la como "pareada", garantindo 1 sessão por respondente.
3. Filtrar as respostas do bucket para considerar apenas sessões pareadas (mesma técnica do `pairedSessions` já usado em Organizacional).
4. Para o denominador "de X" (ex.: "21 de 23"), expor também o total de respondentes elegíveis ao bucket — para os líderes Cid/Alexandre o denominador é 23 (todos os respondentes), para "Líder de Área" o denominador é 15 (respondentes cujo `department_leadership` ≠ Cid e ≠ Alexandre, vindo da tabela `respondents`).

## Mudanças no código

**`supabase/functions/public-report/index.ts`**
- Extrair a lógica de pareamento (`pairedSessions`) em uma função reutilizável `pairSessionsToRespondents(sessions, respondents, window)`.
- Aplicá-la para cada um dos 3 buckets de líder, gerando um `Set<number>` de sessões pareadas por bucket.
- Trocar o filtro dos buckets de líder para usar `pairedSessions.has(new Date(r.submitted_at).getTime())` em vez de contar todas as sessões.
- Adicionar campo `respondent_total` (denominador) em cada categoria:
  - Organizacional: total de `respondents.status='responded'`
  - Cid / Alexandre: mesmo total (23)
  - Líder de Área: count de respondents cujo `department_leadership` (ou campo equivalente) não é nem "Cid Lauro Vale Junior" nem "Alexandre Daguano"
- Aplicar a mesma correção por pergunta dentro de cada bucket (para que "respondent_count" das perguntas reflita pessoas, não sessões).

**`src/pages/PublicReport.tsx`**
- Atualizar o pill da categoria e o header da CategoryView para mostrar formato "X de Y" (ex.: "21 de 23") usando o novo campo `respondent_total`.

## Validação

Após o deploy, abrir `/relatorio/tectaris` e conferir:
- Organizacional: 23 de 23
- Líder de Área: 13 de 15
- Cid: 19 de 23
- Alexandre: 21 de 23
