## Problema

Usuários relatam **telas brancas** durante a pesquisa que resultam em dados perdidos. Investigando `src/pages/SurveyPage.tsx` identifiquei três causas:

1. **Sem ErrorBoundary** — qualquer erro de renderização deixa a tela 100% branca, sem feedback nem recuperação.
2. **`submitRound` frágil** — não tem try/catch real, sem retry, sem mensagem de erro visível. Se a rede falhar ou a chamada travar, o botão fica em "Enviando…" e o usuário acha que sumiu tudo.
3. **Sem aviso ao sair** — fechar/recarregar a aba durante o preenchimento descarta o que está em memória (o draft em localStorage ajuda, mas o usuário não sabe).

## Solução

### 1. ErrorBoundary global na página da pesquisa
Novo arquivo `src/components/SurveyErrorBoundary.tsx`. Envolver `<SurveyPage>` em `src/App.tsx` (ou dentro do próprio componente). Em caso de crash mostra:
- Mensagem amigável ("Algo deu errado, mas suas respostas estão salvas")
- Botão "Tentar novamente" (recarrega mantendo o token na URL → o draft do localStorage restaura tudo)
- Botão "Copiar detalhes do erro" para suporte

### 2. Submissão robusta com retry e feedback
Refatorar `submitRound`:
- `try/catch` cobrindo a chamada Supabase + a marcação do respondente
- **Retry automático** com backoff (3 tentativas: 0s, 2s, 5s) para erros de rede
- Toast de erro visível ("Não foi possível enviar agora — tentando novamente…") e estado de erro persistente que mostra um banner com botão "Tentar enviar de novo" caso falhe definitivamente
- Manter o draft no localStorage até confirmação de sucesso (já está OK, mas garantir que NÃO seja apagado em caso de erro)
- Timeout explícito de 30s na chamada (`AbortController`) para não ficar pendurado

### 3. Aviso `beforeunload`
Quando houver respostas não enviadas (`Object.keys(answers).length > 0` e status não-final), adicionar listener `beforeunload` que dispara o prompt nativo do browser ("Você tem alterações não salvas, sair mesmo assim?").

### 4. Proteção extra de renderização
- Trocar acessos como `currentRound?.leaderName` para garantir fallbacks consistentes
- Validar que `currentIndex` e `currentRoundIndex` restaurados do draft estão dentro dos limites antes de aplicar

## Arquivos afetados

- **novo**: `src/components/SurveyErrorBoundary.tsx`
- **editado**: `src/pages/SurveyPage.tsx` — refatorar `submitRound`, adicionar `useEffect` de `beforeunload`, validar índices restaurados, envolver render em `<SurveyErrorBoundary>`

## Detalhes técnicos

```text
submitRound flow:
  setStatus('submitting')
  for attempt in 1..3:
    try (com AbortController, timeout 30s):
      insert survey_responses
      if respondent.id: update respondents
      remove draft, setStatus('done'/'round_done')
      return
    catch:
      if attempt < 3: aguarda backoff e tenta de novo
      else: setStatus('ready'); setSubmitError(msg)
  banner persistente com botão "Reenviar"
```

Sem mudanças de schema, sem novos endpoints, sem mudar regras de anonimato.
