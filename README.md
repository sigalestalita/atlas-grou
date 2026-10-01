# Atlas — Pesquisa de Clima Organizacional

Plataforma white-label de pesquisa de clima, multiempresa. A Grou administra; cada
empresa cliente tem a própria pesquisa, os próprios dados e a própria identidade.

**App**: https://atlas-grou.lovable.app · **Editor**: [Lovable](https://lovable.dev/projects/37f28f3c-431d-4248-b63c-086ac955bceb)

---

## A regra que manda em tudo

O colaborador responde sob promessa de anonimato. Isso não é um recurso da
plataforma, é a condição para ela funcionar: sem essa confiança as respostas
viram o que a pessoa acha que o chefe quer ler, e a pesquisa inteira perde o
sentido.

Na prática:

- **Duas tabelas separadas.** `respondents` guarda quem foi convidado e se já
  respondeu. `survey_responses` guarda as respostas, sem nenhuma referência ao
  respondente. Não existe chave ligando as duas.
- **Mínimo de 3 pessoas por recorte.** Área, liderança ou categoria com menos de
  três respondentes não aparece separada em lugar nenhum — nem na tela, nem na
  planilha, nem no relatório do cliente. A constante é `MIN_GROUP`, em
  `src/lib/climate.ts`.
  O corte conta **pessoas**, não linhas de resposta: uma pesquisa de dez
  perguntas transforma um respondente em dez linhas, e contar linhas deixava
  passar o grupo de uma pessoa só.
- **Nada exportado com nome.** Não há, e não deve voltar a haver, exportação que
  ligue respostas a uma pessoa. Uma funcionalidade dessas existiu e foi removida:
  ela adivinhava a autoria por proximidade de horário, o que além de quebrar a
  promessa dava errado — duas pessoas da mesma área respondendo perto uma da
  outra saíam com as respostas trocadas.
- **Envios sem horário na tela de Respostas.** Ordenar os envios por horário
  permitiria cruzá-los com a lista de quem já respondeu, em Acompanhamento, e
  descobrir de quem é cada resposta. Por isso a tela mostra só a data e embaralha
  os envios dentro do dia.

Qualquer mudança que mexa nisso merece uma conversa antes de ser feita.

---

## Como o sistema se organiza

### Quem usa

| Perfil | O que enxerga |
|---|---|
| **Super admin** | Todas as empresas, os templates e os outros administradores |
| **Admin de empresa** | Só a empresa dele |
| **Colaborador** | Só a pesquisa. Não tem login — entra por um link |

### O ciclo de uma pesquisa

1. **Montar** — questionário a partir de um template, lideranças avaliadas, prazo
2. **Distribuir** — importar a lista e gerar um link por pessoa, ou usar um link aberto
3. **Acompanhar** — quem respondeu, quem parou no meio, quem nem abriu
4. **Ler** — dashboard, relatório do cliente e planilha

### Como o colaborador responde

Uma pergunta por tela, mobile-first — o telefone é o canal principal. O rascunho
é salvo no navegador a cada resposta, então dá para fechar e voltar depois.

A pesquisa acontece em **etapas**: primeiro as perguntas sobre a organização,
depois uma rodada por liderança avaliada. Quem lidera uma área avalia a liderança
acima; quem é liderança empresarial não avalia ninguém.

Cada etapa é enviada assim que termina, e a lista de etapas concluídas fica em
`respondents.completed_rounds`. É isso que permite retomar de outro aparelho sem
refazer — e sem gravar o mesmo voto duas vezes.

### Dois modos de distribuição

| | Link individual | Link aberto |
|---|---|---|
| Cadastro | Necessário | Nenhum |
| Taxa de resposta | Sim | Não há denominador |
| Lembrete por pessoa | Sim | Não |
| Uma resposta por pessoa | Garantido pelo token | Não garantido |

---

## Como ler os números

Tudo passa por `src/lib/climate.ts` e `src/lib/useSurveyAnalytics.ts`, para que a
tela, o relatório e a planilha contem a mesma história.

- **Score de clima (0–100)** — a média da escala normalizada, levando em conta o
  mínimo: numa escala de 1 a 5, a pior avaliação possível é 0, não 20.
  As faixas vão de *Crítico* a *Muito saudável*, cada uma com uma leitura em
  `climateBand()`.
- **eNPS** — promotores (9–10) menos detratores (0–6), como manda a métrica.
  Fica **fora** do score geral: uma escala de 0 a 10 misturada numa de 1 a 5
  empurraria o resultado para cima.
- **Concordância** — quanto o grupo respondeu parecido, de 0 a 100. Uma média 3
  pode ser "todo mundo achou regular" ou "metade amou, metade odiou", e as duas
  pedem ações opostas. O dashboard usa isso para a seção *Temas que dividem o time*.

---

## Diagnóstico por link aberto

Além da pesquisa de clima, o Atlas roda **diagnósticos**: questionários curtos,
por link aberto, em que a pessoa se identifica e recebe na hora um relatório
individual. O primeiro é o de **maturidade da liderança**, da Grou
(`/diagnostico/grou/maturidade-lideranca`).

É a exceção declarada à regra do anonimato, e por isso não divide nada com a
pesquisa de clima:

- **Tabelas próprias.** `diagnostics` (o questionário) e `diagnostic_submissions`
  (quem respondeu, com nome, e-mail, telefone e empresa). Nada em `surveys` nem
  em `survey_responses` — as telas que pegam "a pesquisa mais recente da
  empresa" continuam vendo só a pesquisa de clima.
- **Consentimento antes das perguntas.** A pessoa informa os dados e concorda
  com o uso deles; sem isso o banco recusa o envio.
- **O anônimo não toca na tabela de respostas.** Envia por `submit_diagnostic`,
  que valida os campos e as notas e calcula o índice no banco, e lê o próprio
  relatório por `get_diagnostic_report`, com o token sorteado no envio. O
  relatório não devolve e-mail nem telefone.
- **Quem vê os contatos:** super admin e o admin da própria empresa, na aba
  *Diagnóstico*, com exportação para planilha.

### Como o relatório é calculado

Tudo em `src/lib/diagnostic.ts`, com as fronteiras repetidas em
`diagnostic_level()` no banco (o teste fixa as duas).

- **Índice (0–100)** — pontos obtidos sobre o máximo possível. Oito afirmações
  de 0 a 5: 40 pontos valem 100.
- **Nível** — Inicial (0–20), Reativa (21–40), Em estruturação (41–60),
  Estruturada (61–80), Estratégica (81–100). Cada um traz o que significa e o
  movimento para o seguinte.
- **Pilares** — as afirmações se agrupam duas a duas: *Clareza do papel* (1, 2),
  *Potencial e sucessão* (3, 6), *Gestão no dia a dia* (4, 5) e *Decisões por
  evidência* (7, 8). Mesmo índice, por pilar, desenhado num radar.
- **Por afirmação** — 0–1 *ausente*, 2–3 *em desenvolvimento*, 4–5 *consolidado*.
- **O que sustenta** — notas a partir de 4, maiores primeiro, até três.
- **Onde agir primeiro** — notas até 3, menores primeiro, até três, cada uma com
  uma recomendação concreta. Empate segue a ordem do questionário.

---

## Stack

React 18 · TypeScript · Vite · Tailwind · shadcn/ui · Supabase (Postgres, Auth,
Storage, Edge Functions) · Recharts · ExcelJS

### Identidade visual

Segue o design system do Sales Coach: navy `#071A34`, azul `#15498D`, glow
`#4F8BF0`, tipografia Poppins. Os tokens estão em `src/index.css`.

A pesquisa que o colaborador responde e o relatório do cliente são **white-label**:
herdam logo e cores da empresa por `--c-primary` / `--c-secondary`, e não trazem
nenhuma marca da Grou. O layout é o mesmo do resto da plataforma.

---

## Rodando localmente

```sh
npm install
npm run dev      # http://localhost:8080
npm test         # vitest
npm run build
```

As variáveis de ambiente do Supabase ficam em `.env`.

### Primeiro acesso

`/setup` cria o super admin inicial. Só funciona enquanto não existir nenhum —
depois disso, novos administradores saem de **Administradores**, dentro do painel.

### Banco

As migrações ficam em `supabase/migrations/`. O Lovable aplica as novas ao
sincronizar; para aplicar à mão, use a CLI do Supabase.

A migração `20260922120000` acrescenta:

- `survey_responses.submission_id` — agrupa as linhas de um mesmo envio sem
  identificar quem enviou. É o que torna o corte de anonimato uma contagem de
  pessoas.
- `surveys.opens_at` / `closes_at` / `wave_label` — janela de resposta e nome da
  rodada, para comparar ciclos.
- `respondents.started_at` / `completed_rounds` / `last_reminder_at` —
  acompanhamento de quem começou e não terminou, e retomada segura.
- `user_roles.email` — preenchido por gatilho, para a tela de administradores
  dizer de quem é cada permissão.

O front funciona com ou sem essa migração aplicada: onde a coluna nova pode não
existir, há um caminho alternativo.

---

## Mapa do código

```
src/
  lib/
    climate.ts              Score, faixas, eNPS, concordância, corte de anonimato
    useSurveyAnalytics.ts   Carrega e agrega uma pesquisa inteira, uma vez só
    auth.tsx                Sessão e papéis
  components/
    AdminLayout.tsx         Casca do painel: menu navy flutuante
    AtlasMark.tsx           Monograma em SVG, herda a cor de onde estiver
    StatCard.tsx            Cartão de indicador e anel de score
    PageHeader.tsx          Cabeçalho, estado vazio e aviso de anonimato
  pages/
    SurveyPage.tsx          A pesquisa que o colaborador responde (white-label)
    PublicReport.tsx        O relatório entregue ao cliente (white-label)
    admin/                  O painel
supabase/
  functions/public-report/  Agrega o relatório público, com código de acesso
  functions/create-admin/   Cria administrador (exige super admin, salvo no bootstrap)
```
