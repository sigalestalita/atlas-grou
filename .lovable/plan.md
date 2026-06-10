## Diagnóstico

1. **Por que aparece "0/0" em todas as categorias**: a edge function `public-report` pareia cada sessão de resposta a um registro em `respondents` (com `status='responded'`) usando timestamps. A pesquisa JA tem **0 respondents cadastrados** e 18 sessions com respostas, então o pareamento devolve 0 → nenhuma sessão "ativa" → nenhuma resposta é exibida.
2. **Por que aparecem Cid e Alexandre nas abas**: esses líderes são fixos no código apenas para Tectaris (`isTectaris`). Pode ser que a edge function ainda não tenha sido reimplantada após a última mudança — uma nova deploy resolve. Independente disso, os líderes reais da JA são: Aline Néglia, Elaine Boening, Karina Leira, Marcelo Bassani.
3. **14 vs 7 colaboradores**: aparece 14 porque o denominador soma sessões distintas em vez de usar o número real de colaboradores. Para JA são 7.
4. **Ordenação por categoria**: as questions já vêm ordenadas por `sort_order`, mas precisam ser estáveis por `(section.sort_order, question.sort_order)` para que o agrupamento por seção (no front) mantenha a ordem correta.
5. **% e quantidade por pergunta**: o `QuestionCard` já renderiza distribuição com % e contagem para perguntas de escala — funcionará automaticamente assim que as respostas voltarem a aparecer.
6. **Análise do print ("Média por Pergunta")**: vive em `src/pages/admin/Export.tsx` (relatório XLSX exportável) e **não será alterada**.

## Mudanças

### `supabase/functions/public-report/index.ts`

a. **Fallback de pareamento**: dentro de `pairSessions`, se `respTimes.length === 0`, considerar **todas as sessões distintas como pareadas** (uma sessão = um respondente). Isso restaura o comportamento para a pesquisa JA (e qualquer outra sem `respondents` cadastrados).

b. **Ordenação por categoria/seção**: ao montar `orgQuestions` e `leaderQuestions`, ordenar pelos pares `(section.sort_order, question.sort_order)` para garantir que a UI agrupe as perguntas na ordem correta das seções.

c. **Overrides para a JA** (`survey.id = b0000000-0000-0000-0000-000000000001`):
   - `organizacional`: `total = 7` (7 colaboradores).
   - `lider`: `total = 7`.
   - `count`: usar as sessões reais distintas (sem forçar).

d. **Confirmar as 2 abas para JA**: o ramo "não-Tectaris" já produz apenas `Organização` e `Líder` (Cid/Alexandre só existem em Tectaris). Após nova deploy as abas extras somem.

### Frontend
Sem mudanças. `PublicReport.tsx` já:
- Mostra distribuição com % e contagem por valor.
- Agrupa por `section_title` na ordem em que as perguntas chegam.
- Renderiza `comments` (Organização — todos os comentários) e `comments_by_leader` (Líder — comentários agrupados por líder).

### Export XLSX
Sem mudanças. "Média por Pergunta" e demais análises do relatório exportável permanecem como estão.

## Validação

1. Recarregar `/relatorio/ja-poa`.
2. Verificar apenas duas abas: **Organização** e **Líder**.
3. Contagem de cada categoria deve mostrar `n/7`.
4. Cada pergunta de escala deve exibir % e quantidade por opção (1–5).
5. Perguntas agrupadas e ordenadas por seção.
6. Aba **Líder** mostra estatísticas e comentários separados por: Aline Néglia, Elaine Boening, Karina Leira, Marcelo Bassani.
7. Página de Export continua gerando o XLSX com "Média por Pergunta".
