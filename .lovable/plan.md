## Problema

Em `supabase/functions/public-report/index.ts`, a função `pairSessions` retorna `paired` contendo **todas** as sessões do bucket, em vez de apenas as que foram efetivamente pareadas a um respondent. Para o bucket Organizacional, isso faz com que a soma da distribuição por pergunta seja 30 (sessões brutas) mesmo com `respondent_count = 23` (respondentes únicos).

## Mudança

Em `pairSessions`, retornar como `paired` o set de sessões que foram realmente associadas a algum respondent (atualmente rastreado pela variável `used`), em vez de `new Set(sessions)`.

Isso faz com que `filterActive` em `buildBucket` exclua sessões duplicadas/órfãs também no nível de pergunta, alinhando a soma da distribuição com o `respondent_count` do bucket.

Para os buckets de líder (Cid, Alexandre, Líder de Área), o `COUNT_OVERRIDES` + `dedupSessionsToTarget` continua sobrescrevendo `activeSessions` quando aplicável — comportamento atual preservado.

## Validação

Recarregar `/relatorio/tectaris` e conferir que a soma da distribuição em cada pergunta bate com o pill da categoria:
- Organizacional: 23 (era 30)
- Líder de Área: 13
- Cid: 19
- Alexandre: 21
