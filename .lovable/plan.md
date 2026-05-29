## Distribuição por pergunta = exatamente 23 respondentes (Organizacional)

Hoje as barras de cada pergunta organizacional somam **30** porque o banco contém todas as submissões — incluindo as resubmissões (algumas pessoas responderam mais de uma vez).

A categoria Organizacional já mostra **23 respondentes** porque é contada direto da tabela `respondents` (status `responded`). Falta aplicar a mesma lógica de pareamento para que as **distribuições por pergunta** também reflitam apenas essas 23 sessões.

### Implementação (edge function `public-report`)

Adicionar um passo que, para a categoria Organizacional, selecione **uma sessão de submissão por respondente**:

1. Coletar todas as sessões de respostas organizacionais → conjunto de `submitted_at` distintos.
2. Para cada `respondent.responded_at` (23 itens), encontrar a sessão mais próxima dentro de uma janela tolerante (`-6h ≤ Δ ≤ +30min`) e escolher **a mais recente** dentro dessa janela. Cada sessão só pode ser usada por um respondente.
3. Sessões que ficarem fora do pareamento (ou seja, resubmissões antigas/duplicadas) são **descartadas**.
4. Filtrar `survey_responses` organizacionais para manter apenas as sessões pareadas e usar esse subconjunto em `buildQuestionStats` (distribuição da escala + comentários únicos).

Resultado esperado para "A empresa é bem administrada":
- antes: 17 + 11 + 1 + 1 + 0 = 30
- depois: soma = 23 (mantendo as respostas mais recentes de cada um dos 23 respondentes)

### Escopo

- **Apenas Organizacional**. Categorias de líder (Cid, Alexandre, Líder de Área) continuam contando sessões distintas com asterisco — não dá para parear respondentes lá com confiança porque cada líder tem seu próprio número e estamos fora da tabela `respondents`.
- **Sem mudanças no banco**: dedupe é feito em leitura.
- **Sem mudanças no formulário** nem no resto do app.
- Os totais por pergunta passam a refletir 23; o badge "N comentários podem ser de repreenchimentos" continua medindo a duplicação textual original (não muda).
