## Mudanças no relatório público

### 1. Filtrar comentários inválidos (edge function `public-report`)

Em `buildQuestionStats` (para perguntas do tipo `text`), além de deduplicar, descartar comentários cujo texto normalizado seja:
- `sem comentários` (com ou sem acento, qualquer caixa)
- `e`
- `.`

Lista de stopwords normalizada (`trim` + `collapse spaces` + `lowercase` + remoção de acentos): `["sem comentarios", "e", "."]`.

Resultado esperado em "Comentários sobre Credibilidade": 28 → **25 comentários únicos**, 3 descartados (1 "Sem Comentários" + 1 "e" + 1 "."), e os 2 duplicados que já eram removidos continuam contabilizados separadamente como possíveis resubmissões.

A diferença entre `raw_total` e `total` agora representa **descartados + duplicados**. Para manter a semântica nova ("duplicados = possíveis resubmissões"), exporei dois campos:
- `raw_total`: total bruto de comentários não-vazios
- `total`: comentários válidos únicos exibidos
- `duplicates_removed`: número de duplicatas exatas removidas (resubmissões)
- (descartes por stopword ficam implícitos — não precisam aparecer na UI)

### 2. Renomear a tag na UI (`src/pages/PublicReport.tsx`)

Trocar:
> `2 duplicados removidos`

por:
> `2 comentários podem ser de repreenchimentos/pesquisas refeitas`

Só aparece quando `duplicates_removed > 0`.

### Escopo

- Aplica a todas as categorias (Organizacional, Cid, Alexandre, Líder de Área) — o filtro de stopwords é universal.
- Sem mudanças no banco; tudo é feito em leitura na edge function.
- Sem mudanças no formulário ou nas demais telas.
