
# Plataforma de Pesquisa de Clima Organizacional

Plataforma white-label, multi-tenant, para criação, distribuição e análise de pesquisas de clima organizacional com anonimato real, links únicos por colaborador e dashboards analíticos.

---

## Fase 1 — Estrutura de Banco de Dados (Lovable Cloud)

### Tabelas principais

1. **companies** — Empresas (tenants)
   - nome, slug, logo_url, cor primária/secundária, configurações (escala, anonimato)

2. **user_roles** — Papéis de usuários autenticados
   - user_id (ref auth.users), role (super_admin / company_admin), company_id

3. **surveys** — Pesquisas
   - company_id, título, descrição, status (rascunho/ativa/encerrada), tipo de escala (1-5, 1-10, custom), is_template

4. **survey_sections** — Seções da pesquisa
   - survey_id, título, ordem (ex: "Liderança Empresarial", "Liderança de Departamento")

5. **survey_questions** — Perguntas
   - section_id, texto, ordem

6. **respondents** — Colaboradores (tabela de tracking)
   - company_id, survey_id, nome, email, departamento, liderança empresarial, liderança de departamento, token (único), status (pendente/respondido), responded_at

7. **survey_responses** — Respostas (ANÔNIMAS, sem vínculo com respondent)
   - survey_id, question_id, valor (numérico), departamento, liderança empresarial, liderança de departamento, timestamp
   - Metadados agregáveis copiados no momento da resposta, sem ID do respondente

### Segurança
- RLS com isolamento por company_id para admins de empresa
- Super admins acessam tudo via função security definer `has_role()`
- Tabela de respostas com acesso público para INSERT (via token validado em edge function) e SELECT restrito a admins
- Regra de anonimato: grupos com menos de 3 pessoas bloqueiam visualização detalhada

---

## Fase 2 — Autenticação e Roles

- Login por email/senha + Google (para admins Grou e admins de empresa)
- Tela de login com redirecionamento baseado no role
- Super Admin → painel de gestão de empresas
- Admin Empresa → dashboard da sua empresa
- Colaboradores NÃO fazem login (acessam via link único)

---

## Fase 3 — Painel Super Admin (Grou)

### Páginas:
1. **Lista de Empresas** — criar, editar, duplicar empresas com logo e cores
2. **Templates de Pesquisa** — criar pesquisas-base reutilizáveis (seções + perguntas)
3. **Visão de Empresa** — acessar dashboard de qualquer empresa
4. **Gestão de Admins** — convidar admins por empresa

---

## Fase 4 — Painel Admin Empresa

### Páginas:
1. **Configurar Pesquisa** — selecionar template ou criar pesquisa, definir escala, editar seções/perguntas
2. **Colaboradores** — upload de planilha Excel/CSV (nome, email, departamento, lideranças), geração automática de tokens
3. **Links** — exportar CSV com nome + link individual por colaborador
4. **Dashboard Analítico**:
   - Taxa de resposta (respondidos vs pendentes)
   - Score geral de clima (0-100)
   - Média por pergunta (gráfico de barras)
   - Média por departamento, liderança empresarial, liderança de departamento
   - Heatmap de seções x grupos
   - Comparação entre lideranças
   - Indicador visual de risco (pontos críticos em vermelho)
   - Insights automáticos: destaques de pontos fortes e fracos
   - Bloqueio de visualização para grupos < 3 pessoas
5. **Exportação** — download Excel/CSV com dados agregados por grupo (nunca vinculado a nomes)
6. **Progresso** — acompanhamento em tempo real de quem respondeu (sem ver respostas)

---

## Fase 5 — Interface do Respondente (White-Label)

### Rota: `/survey/:slug/:token`

- Validação do token via edge function
- Se token já usado → mensagem "Você já respondeu"
- Se válido → exibir pesquisa

### UX estilo Typeform:
- Uma pergunta por vez com transição suave
- Barra de progresso
- Tempo estimado no início
- Escala visual (botões/slider conforme configuração)
- Cores e logo da empresa (white-label completo, sem menção à Grou)
- Mobile-first, responsivo
- Tela de agradecimento ao concluir

### Fluxo de submissão:
1. Edge function recebe respostas + token
2. Marca respondent como "respondido" (tracking)
3. Insere respostas na tabela anônima com metadados agregáveis (departamento, liderança) — sem ID do colaborador
4. Invalida o token para reuso

---

## Fase 6 — Edge Functions

1. **validate-token** — valida token, retorna pesquisa com perguntas e branding da empresa
2. **submit-response** — recebe respostas, separa tracking de dados anônimos, invalida token
3. **import-respondents** — processa upload de planilha, gera tokens, retorna lista
4. **export-results** — gera CSV/Excel com dados agregados respeitando regra de anonimato (min. 3 por grupo)

---

## Fase 7 — Componentes Visuais do Dashboard

- Gráficos com Recharts (barras, heatmaps, comparativos)
- Cards de KPI (taxa de resposta, score geral, indicadores de risco)
- Tabelas com filtros por departamento/liderança
- Indicadores visuais: verde (forte), amarelo (atenção), vermelho (crítico)

---

## Detalhes Técnicos

- **Frontend**: React + TypeScript + Tailwind + shadcn/ui + Recharts
- **Backend**: Lovable Cloud (Supabase) — banco, auth, edge functions, storage (logos)
- **Parsing Excel**: SheetJS (xlsx) no frontend para import de colaboradores
- **White-label**: CSS variables dinâmicas carregadas por empresa
- **Rotas protegidas**: middleware de auth com verificação de role
- **RLS**: isolamento total por company_id em todas as tabelas
