# Plano

Vou corrigir o relatório público para que ele mostre todas as respostas/comentários organizacionais da Tectaris.

## O que vou fazer

1. Revisar a função `public-report` para corrigir a leitura paginada de `survey_responses`.
2. Garantir que a função busque todos os registros da pesquisa, não apenas o lote inicial retornado pela API.
3. Validar que os totais do relatório batem com o banco para as perguntas organizacionais com comentário.
4. Confirmar no relatório que contagens como 18, 17 e 15 passem a refletir o total real carregado.

## Causa identificada

O banco tem 30 respostas para cada pergunta de comentário organizacional da Tectaris, mas o relatório mostra menos porque a função pública está recebendo apenas parte das `survey_responses` no fetch atual. Isso faz os cards exibirem uma amostra parcial em vez do conjunto completo.

## Resultado esperado

- As perguntas organizacionais com comentário passam a mostrar o total real disponível.
- O relatório deixa de cortar comentários por limite implícito da consulta.
- A visualização fica consistente com os dados do banco.

## Detalhes técnicos

- Arquivo principal: `supabase/functions/public-report/index.ts`
- Ajuste provável: paginação explícita ou loop de leitura até esgotar `survey_responses`
- Validação: comparar o JSON retornado pela função com consultas de contagem no banco para a pesquisa da Tectaris