# Atlas: Pesquisa de Clima Organizacional

Crie uma plataforma web white-label de Pesquisa de Clima Organizacional, multiempresa (multi-tenant), com foco em anonimato, escalabilidade e usabilidade.

O sistema deve permitir que a Grou (administradora da plataforma) crie e gerencie múltiplas pesquisas para diferentes empresas (ex: Tectaris), cada uma com sua própria identidade, estrutura e dados isolados.

---

## 🎯 OBJETIVO

Permitir a criação, distribuição e análise de pesquisas de clima organizacional com:

- Respostas anônimas

- Links individuais únicos por colaborador

- Dashboard analítico avançado

- Estrutura replicável para múltiplas empresas

---

## 🏢 ARQUITETURA MULTI-TENANT

Criar estrutura com isolamento total por empresa:

### Entidade: Empresa

- Nome

- Logo

- Cores (primary, secondary)

- Nome da pesquisa ativa

- Configurações (ex: anonimato, tipo de escala)

Cada empresa terá:

- Seus colaboradores (não autenticados)

- Suas lideranças

- Sua pesquisa

- Seus resultados

---

## 👤 TIPOS DE USUÁRIO

### 1. Admin Grou (Super Admin)

- Cria e gerencia empresas

- Cria pesquisas base (templates)

- Acompanha todas as empresas

- Pode acessar qualquer dashboard

### 2. Admin da Empresa (ex: consultoria RH / Tectaris)

- Gerencia apenas sua empresa

- Configura pesquisa

- Importa colaboradores

- Acompanha resultados

### ❗ IMPORTANTE:

Colaboradores NÃO têm login

---

## 🔗 SISTEMA DE RESPOSTA (ANÔNIMO)

### Modelo:

- Cada colaborador recebe um link único e individual

- Exemplo:

  /survey/tectaris/{token_unico}

### Regras:

- Token único por colaborador

- Token permite:

  - Apenas 1 resposta

- Não exigir login

- Não armazenar nome junto com respostas (anonimato real)

### ⚠️ ANONIMATO CONTROLADO:

- O sistema sabe quem respondeu (para controle de taxa de resposta)

- Mas NÃO vincula identidade às respostas no banco analítico

Separar:

- Tabela de envio (tracking)

- Tabela de respostas (anonimizada)

---

## 📩 DISTRIBUIÇÃO

- Upload de planilha com colaboradores

- Sistema gera automaticamente:

  - Tokens únicos

  - Links individuais

- Opções:

  - Exportar lista com links

  - (Opcional) Disparo de email via sistema

---

## 🧩 ESTRUTURA DE DADOS

### Colaboradores (tracking apenas)

- ID

- Nome

- Email

- Departamento

- Liderança empresarial

- Liderança de departamento

- Token único

- Status (respondeu / não respondeu)

### Respostas (ANÔNIMAS)

- ID

- Empresa

- Pergunta

- Resposta (escala)

- Timestamp

- Metadados agregáveis (ex: departamento, liderança) → SEM identificação pessoal

---

## 📋 PESQUISA

### Estrutura

- Seções:

  - Liderança Empresarial

  - Liderança de Departamento

- Perguntas:

  - Inseridas manualmente ou via importação

  - Tipo escala (definida pelo admin)

### UX do Respondente:

- Interface limpa estilo Typeform

- Uma pergunta por vez (ou blocos leves)

- Barra de progresso

- Tempo estimado

- Feedback ao concluir

---

## 🎨 WHITE-LABEL (CRÍTICO)

Cada empresa deve ter:

- Logo próprio

- Cores personalizadas

- Nome da pesquisa

- URL customizada (ex: /tectaris)

Sem qualquer menção à Grou na interface final (modo white-label completo)

---

## 📊 DASHBOARD (ADMIN EMPRESA)

### Visão Geral

- Taxa de resposta (%)

- Total respondido vs pendente

### Análises

- Média por pergunta

- Média por:

  - Liderança empresarial

  - Liderança de departamento

  - Departamento

### Visualizações

- Gráficos de barras

- Heatmaps

- Comparações entre lideranças

### Insights automáticos

- Destacar pontos críticos (baixa pontuação)

- Destacar pontos fortes

---

## 📤 EXPORTAÇÃO

- Excel / CSV com:

  - Dados agregados

  - Dados por grupo (departamento/liderança)

- Nunca exportar resposta vinculada a nome

---

## ⚙️ FUNCIONALIDADES ADMIN

- Criar/editar empresas

- Duplicar pesquisa (template)

- Importar colaboradores via Excel

- Gerar links automaticamente

- Acompanhar progresso em tempo real

- Encerrar pesquisa

---

## 🔒 REGRAS DE ANONIMATO

- Nunca exibir respostas individuais identificáveis

- Bloquear visualização quando grupos < 3 pessoas (anti identificação)

- Separação lógica no banco:

  - Tracking (quem respondeu)

  - Respostas (anônimas)

---

## 📱 RESPONSIVIDADE

- Mobile-first

- Experiência fluida em celular (principal canal de resposta)

---

## 🚀 DIFERENCIAIS

- Score geral de clima (0–100)

- Benchmark interno entre lideranças

- Indicador visual de risco organizacional

- Sistema preparado para múltiplas pesquisas simultâneas

---

## 📌 RESULTADO ESPERADO

Uma plataforma white-label de pesquisas de clima, escalável, pronta para:

- Reutilização para múltiplos clientes 


Com:

- Alta taxa de resposta (UX otimizada)

- Segurança de anonimato

- Forte capacidade analítica

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://atlas-grou.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/37f28f3c-431d-4248-b63c-086ac955bceb).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
