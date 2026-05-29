## Objetivo

Cruzar os 23 respondentes da Tectaris marcados como "respondido" com as respostas reais no banco, e dizer **quais completaram 100%** das perguntas que o sistema deveria ter mostrado para cada um, com base no perfil (colaborador / líder de área).

## Como vou determinar o "esperado"

Pela lógica de `SurveyPage.tsx` e pela config da pesquisa (48 perguntas organizacionais + 6 perguntas por líder avaliado):

| Perfil | Esperado |
|---|---|
| Líder de área (8 nomes: Cezar, Elizangela, Gustavo, Silvia, Stephany, Tarcisio, Eduardo, Mariana) | 48 org + 2×6 (Cid + Alexandre) = **60** |
| Colaborador (15 demais) | 48 org + 1×6 (1 líder de área escolhido) + 2×6 (Cid + Alexandre) = **66** |

Cid e Alexandre não aparecem na lista de respondentes (líderes empresariais não respondem nada nesta pesquisa — saem direto no `no_evaluation`).

## Como vou ligar respondente ↔ submissão

Como as respostas são anônimas (sem `respondent_id`), o vínculo é feito por:
1. Agrupar as linhas de `survey_responses` em "envios" usando `submitted_at` (janela de 5 min + mesma combinação de líderes avaliados), igual ao `Export.tsx` já faz.
2. Para cada respondente, encontrar o envio com `submitted_at` mais próximo do `responded_at` dele.
3. Contar quantas perguntas distintas esse envio cobriu e comparar com o esperado.

Observação: como existem 30 envios no banco e 23 respondentes marcados, alguns respondentes podem casar com mais de um envio (reenvio); nesse caso somo as perguntas únicas respondidas pelo mesmo respondente.

## Entrega

Um PDF curto em `/mnt/documents/tectaris_completude_por_link.pdf` com:

1. **Resumo** — X de 23 completaram 100%, Y completaram só a parte organizacional (48), Z ficaram em algum ponto intermediário.
2. **Tabela** com uma linha por respondente:
   - Nome
   - Perfil (Colaborador / Líder de área)
   - Perguntas respondidas / esperadas (ex.: 48/66)
   - % completo
   - Status: ✅ 100% | ⚠️ só organizacional | ⚠️ parcial | ❌ sem envio identificado
   - Data/hora do envio
3. **Nota metodológica** explicando o método de pareamento por timestamp e suas limitações (envio anônimo, casamento por proximidade temporal — margem de erro pequena mas não-zero).

Se preferir Excel em vez de PDF, me diga antes de eu rodar.

## Detalhes técnicos

- Query base: `survey_responses` + `respondents` + `survey_questions` (filtrar `question_type != 'open_text'` para contagem de obrigatórias, mas vou também contar as abertas separadamente).
- Script Python com `psycopg`/CSV → `reportlab` para o PDF, mesmo padrão dos outros entregáveis Tectaris.
- Sem alterações no app/código do Atlas.
