## Novo dashboard: Acompanhamento em tempo real

Criar uma nova aba **"Acompanhamento"** (`/admin/tracking`) no painel da empresa, focada em métricas agregadas e atualizadas ao vivo. Diferente de `/admin/responses` (envios individuais) e `/admin/progress` (taxa por depto), esta tela é o **painel de controle** do RH durante a coleta — visão por **colaborador** e por **líder**.

### Cards no topo (KPIs em tempo real)

- **Envios completos** — total de submissões anônimas
- **Colaboradores que responderam** — X de Y (Y = total de respondentes cadastrados)
- **Lideranças avaliadas** — quantas distintas já receberam ≥1 avaliação, vs total cadastrado em `surveys.leaders`
- **Última resposta** — timestamp + badge "AO VIVO" pulsando ao receber nova resposta

### Seção 1 — Progresso geral

Barra grande com % e contagem (envios recebidos / colaboradores cadastrados).

### Seção 2 — Avaliados (lideranças, individual)

Tabela de **cada liderança cadastrada** no `surveys.leaders` (exceto `hidden:true`):

| Líder | Tipo (empresarial / departamento) | Avaliações recebidas | Barra |

Inclui lideranças com 0 avaliações para o RH ver quem ainda falta. Ordenada por nº de avaliações desc.

### Seção 3 — Avaliadores (colaboradores, individual)

Tabela de **cada colaborador** da lista `respondents` do survey ativo:

| Nome | Email | Departamento | Líder do depto | Status | Respondido em |

- **Status** calculado em tempo real: "Respondido" se `respondents.status='responded'` OU se existe `survey_responses` com a mesma combinação de `department + department_leadership` no mesmo timestamp. (Como a flag `responded` está pouco confiável — só 1 de 24 marcados na Tectaris — mostrar ambos os sinais e priorizar o realtime.)
- Busca por nome/email
- Filtro: todos / respondidos / pendentes

⚠️ **Anonimato preservado**: o cruzamento exibido é apenas "colaborador X aparenta ter respondido" baseado em metadata de grupo (depto + liderança), nunca vinculando a uma resposta específica. As respostas individuais continuam acessíveis só em `/admin/responses` sem identificação.

### Seção 4 — Linha do tempo (lateral)

Feed das últimas 15 submissões: hora + liderança avaliada + departamento. Atualiza por push.

### Realtime

Subscription única em `survey_responses` (INSERT) + `respondents` (UPDATE). A cada evento:
- Recalcula KPIs
- Atualiza linha do colaborador correspondente
- Adiciona ao feed
- Pulsa badge

### Detalhes técnicos

- **Novo arquivo**: `src/pages/admin/Tracking.tsx`
- **Rota** em `src/App.tsx`: `/admin/tracking` dentro de `AdminLayout`
- **Nav item** em `src/components/AdminLayout.tsx`: "Acompanhamento" com ícone `Activity` antes de "Respostas"
- Reutiliza `Card`, `Progress`, `Badge`, `Table`, `Input`, `Tabs` do design system
- Agregações client-side via `useMemo`
- Realtime já habilitado nas tabelas envolvidas

### O que NÃO muda

- `/admin/responses` continua (linha-a-linha das respostas anônimas)
- `/admin/progress` continua
- Schema do banco intocado