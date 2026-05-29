## Link público do relatório: `atlas.grougp.com.br/result-tectaris`

Hoje o relatório existe em `/relatorio/:slug`. O usuário quer um link mais limpo para enviar ao cliente: `atlas.grougp.com.br/result-tectaris` (onde `tectaris` é o slug da empresa).

### Implementação

**Adicionar uma rota em `src/App.tsx`** que casa com `/result-:slug` e renderiza o `PublicReport` já existente:

```tsx
<Route path="/result-:slug" element={<PublicReport />} />
```

A rota `/relatorio/:slug` continua funcionando (compatibilidade), e o `PublicReport` já lê `useParams().slug` — vai pegar `"tectaris"` automaticamente.

### Por que já é público

- O `PublicReport` chama a edge function `public-report` com a chave anon — sem login.
- A edge function usa a service role internamente, então não depende de RLS.
- A rota é montada **fora** do `RequireAuth`, igual à `/relatorio/:slug`.

### Visibilidade da publicação

O domínio custom já está apontando para o app publicado. Para o link funcionar para o cliente sem login na Lovable, a publicação precisa estar com visibilidade **pública** (não "private workspace"). Vou checar isso e, se estiver privado, alertar você para ajustar em Publish settings antes de enviar.

### Escopo

- Apenas adiciona uma rota.
- Sem mudanças no banco, na edge function ou na UI do relatório.
