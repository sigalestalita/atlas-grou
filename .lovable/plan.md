## Problema

Após o login, há um "blip" alternando entre **Sem acesso** e a tela de **Empresas**. Causa:

`src/lib/auth.tsx` marca `loading = false` assim que a sessão chega, mas o fetch de `user_roles` é disparado via `setTimeout(..., 0)` e ainda não terminou. Nesse intervalo, `AdminIndex` vê `loading=false` + `roles=[]` e renderiza **Sem acesso**. Quando os roles chegam, o componente re-renderiza e redireciona para `/admin/companies` (super_admin) ou `/admin/dashboard` (company_admin).

O mesmo problema afeta `RequireAuth` em qualquer guarda baseada em role.

## Mudança

Adicionar um estado dedicado de carregamento de roles em `AuthContext` e fazer com que `loading` só seja `false` quando **sessão + roles** estiverem resolvidos.

### `src/lib/auth.tsx`
- Tornar `fetchRoles` retornar a Promise (sem `setTimeout`) e fazer `onAuthStateChange` aguardar — ou expor `rolesLoading` separado.
- Abordagem escolhida: manter `loading` como flag única que só vira `false` depois de:
  - `getSession()` resolver, e
  - se houver `user`, `fetchRoles(user.id)` resolver.
- No `onAuthStateChange`: setar `loading=true` ao entrar, aguardar `fetchRoles` (quando há sessão) e então `loading=false`. Continuar usando microtask (`queueMicrotask` ou `setTimeout 0`) só para evitar deadlock dentro do callback do Supabase, mas sem liberar `loading` antes do fetch.

### Consumidores
- `src/pages/admin/AdminIndex.tsx` e `src/components/RequireAuth.tsx` já consultam `loading` — ficam corretos automaticamente. Nenhuma mudança necessária além de confirmar que não há outra checagem de role sem respeitar `loading`.

## Validação
- Logar como super_admin → ir direto para `/admin/companies` sem flash de **Sem acesso**.
- Logar como company_admin → ir direto para `/admin/dashboard`.
- Usuário sem role → ver **Sem acesso** de forma estável (sem alternância).
