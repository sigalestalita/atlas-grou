/**
 * Leitura do diagnóstico de maturidade da liderança.
 *
 * O índice e a faixa são calculados no banco no momento do envio
 * (`submit_diagnostic`) e gravados junto com as notas; o relatório os recebe
 * prontos. As funções daqui refazem a mesma conta para desenhar o relatório —
 * pilares, pontos fortes, prioridades — e são a referência que o teste fixa.
 * Mudou uma fronteira aqui, muda `diagnostic_level()` na migração 20261001120000.
 */

export interface DiagnosticQuestion {
  key: string;
  text: string;
  dimension: DimensionKey;
}

export type DimensionKey = "clareza" | "potencial" | "pratica" | "evidencias";
export type LevelKey = "inicial" | "reativa" | "em_estruturacao" | "estruturada" | "estrategica";
export type ItemBand = "critico" | "desenvolvimento" | "forte";

export type Answers = Record<string, number>;

// ── Pilares ──────────────────────────────────────────────────────────────────
// As oito afirmações se agrupam duas a duas. O pilar é o que o relatório mostra
// no radar: oito eixos com uma nota cada dizem pouco de relance, quatro dizem
// onde está o buraco.

export const DIMENSIONS: Record<DimensionKey, { label: string; short: string; description: string }> = {
  clareza: {
    label: "Clareza do papel",
    short: "Clareza",
    description: "Saber o que se espera de um líder e o que separa os melhores dos demais.",
  },
  potencial: {
    label: "Potencial e sucessão",
    short: "Sucessão",
    description: "Promover por potencial, e não só por desempenho, e formar quem vem depois.",
  },
  pratica: {
    label: "Gestão no dia a dia",
    short: "Prática",
    description: "Adaptar a gestão a cada pessoa e manter o feedback como rotina.",
  },
  evidencias: {
    label: "Decisões por evidência",
    short: "Evidência",
    description: "Decidir sobre pessoas com dados e medir a qualidade da liderança.",
  },
};

export const DIMENSION_ORDER: DimensionKey[] = ["clareza", "potencial", "pratica", "evidencias"];

// ── Faixas de maturidade ─────────────────────────────────────────────────────

export interface LevelInfo {
  key: LevelKey;
  label: string;
  /** Posição na régua, de 1 a 5 — "Nível 3 de 5". */
  step: number;
  /** Faixa do índice, inclusiva, para a régua do relatório. */
  range: [number, number];
  color: string;
  /** Como a liderança funciona nesse estágio. */
  meaning: string;
  /** O movimento que leva ao estágio seguinte. */
  next: string;
}

export const LEVELS: LevelInfo[] = [
  {
    key: "inicial", label: "Inicial", step: 1, range: [0, 20],
    color: "hsl(var(--climate-critical))",
    meaning: "A liderança acontece por intuição. O que se espera de um líder, como ele é escolhido e como dá retorno ao time depende de cada pessoa — não há um padrão da empresa.",
    next: "O primeiro passo é escrever o que a empresa espera de um líder. Sem essa referência, nenhuma das outras práticas tem contra o que ser medida.",
  },
  {
    key: "reativa", label: "Reativa", step: 2, range: [21, 40],
    color: "hsl(var(--climate-low))",
    meaning: "Existem práticas, mas aparecem quando um problema obriga: o feedback vem depois do erro, a promoção vem quando alguém sai. A liderança responde ao que acontece em vez de se antecipar.",
    next: "Transformar as práticas isoladas em rotina: um ciclo de feedback com data marcada e critérios definidos antes da próxima promoção.",
  },
  {
    key: "em_estruturacao", label: "Em estruturação", step: 3, range: [41, 60],
    color: "hsl(var(--climate-mid))",
    meaning: "Os fundamentos estão de pé, mas funcionam de forma desigual entre áreas e líderes. Parte do time de liderança opera com método; outra parte, ainda no instinto.",
    next: "Dar consistência: o mesmo critério de avaliação para todos os líderes e os primeiros indicadores para saber se está funcionando.",
  },
  {
    key: "estruturada", label: "Estruturada", step: 4, range: [61, 80],
    color: "hsl(var(--climate-good))",
    meaning: "A liderança é tratada como um sistema: há critério, rotina e acompanhamento. O desafio deixa de ser criar as práticas e passa a ser mantê-las vivas e conectadas à estratégia.",
    next: "Usar os dados que já existem para antecipar decisões — quem está pronto para crescer, onde a sucessão está descoberta.",
  },
  {
    key: "estrategica", label: "Estratégica", step: 5, range: [81, 100],
    color: "hsl(var(--climate-high))",
    meaning: "Liderança é vantagem competitiva. As decisões sobre pessoas se apoiam em evidência, a sucessão está mapeada e os líderes se desenvolvem de forma contínua.",
    next: "Proteger o que funciona: revisar periodicamente o modelo de liderança para que acompanhe a estratégia, e não o contrário.",
  },
];

/** Faixa do índice de 0 a 100. As mesmas fronteiras de `diagnostic_level()`. */
export function levelFor(score: number): LevelInfo {
  if (score <= 20) return LEVELS[0];
  if (score <= 40) return LEVELS[1];
  if (score <= 60) return LEVELS[2];
  if (score <= 80) return LEVELS[3];
  return LEVELS[4];
}

export function levelByKey(key: string): LevelInfo {
  return LEVELS.find((l) => l.key === key) ?? LEVELS[0];
}

// ── Pontuação ────────────────────────────────────────────────────────────────

/**
 * Índice de 0 a 100: pontos obtidos sobre o máximo possível.
 *
 * Considera o mínimo da escala — numa de 0 a 5 isso não muda nada, mas o
 * diagnóstico guarda a escala no banco, e a conta precisa continuar certa se
 * um dia ela for de 1 a 5. Igual à conta de `submit_diagnostic`.
 */
export function scoreFor(values: number[], scaleMin: number, scaleMax: number): number {
  const span = scaleMax - scaleMin;
  if (values.length === 0 || span <= 0) return 0;
  const points = values.reduce((sum, v) => sum + (v - scaleMin), 0);
  return Math.round((points * 100) / (values.length * span));
}

/** Leitura de uma nota isolada, de 0 a 5. */
export function itemBand(value: number, scaleMin = 0, scaleMax = 5): { band: ItemBand; label: string; color: string } {
  const pct = scoreFor([value], scaleMin, scaleMax);
  if (pct <= 20) return { band: "critico", label: "Ausente", color: "hsl(var(--climate-critical))" };
  if (pct <= 60) return { band: "desenvolvimento", label: "Em desenvolvimento", color: "hsl(var(--climate-mid))" };
  return { band: "forte", label: "Consolidado", color: "hsl(var(--climate-good))" };
}

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  short: string;
  description: string;
  score: number;
  level: LevelInfo;
}

/** Índice de 0 a 100 de cada pilar, na ordem do radar. */
export function dimensionScores(
  questions: DiagnosticQuestion[], answers: Answers, scaleMin: number, scaleMax: number,
): DimensionScore[] {
  return DIMENSION_ORDER
    .map((key) => {
      const values = questions
        .filter((q) => q.dimension === key && typeof answers[q.key] === "number")
        .map((q) => answers[q.key]);
      if (values.length === 0) return null;
      const score = scoreFor(values, scaleMin, scaleMax);
      return { key, ...DIMENSIONS[key], score, level: levelFor(score) };
    })
    .filter((d): d is DimensionScore => d !== null);
}

// ── Pontos fortes e prioridades ──────────────────────────────────────────────

export interface ItemRead {
  key: string;
  text: string;
  dimension: DimensionKey;
  value: number;
  /** Posição no questionário, para desempate estável. */
  order: number;
}

function reads(questions: DiagnosticQuestion[], answers: Answers): ItemRead[] {
  return questions
    .map((q, order) => ({ key: q.key, text: q.text, dimension: q.dimension, value: answers[q.key], order }))
    .filter((r): r is ItemRead => typeof r.value === "number");
}

/**
 * O que já sustenta a liderança: notas a partir de 4 (Concordo), as mais altas
 * primeiro, até três. Nota 3 ainda é "em parte" — não entra como força.
 */
export function strengths(questions: DiagnosticQuestion[], answers: Answers, limit = 3): ItemRead[] {
  return reads(questions, answers)
    .filter((r) => r.value >= 4)
    .sort((a, b) => b.value - a.value || a.order - b.order)
    .slice(0, limit);
}

/**
 * Onde agir primeiro: notas até 3, as mais baixas primeiro, até três. Empate
 * fica na ordem do questionário, que segue a lógica de construção — clareza
 * antes de sucessão, prática antes de indicador —, então o desempate já sugere
 * a sequência certa.
 */
export function priorities(questions: DiagnosticQuestion[], answers: Answers, limit = 3): ItemRead[] {
  return reads(questions, answers)
    .filter((r) => r.value <= 3)
    .sort((a, b) => a.value - b.value || a.order - b.order)
    .slice(0, limit);
}

/** O que fazer quando a afirmação está fraca. Uma ação concreta por pergunta. */
export const RECOMMENDATIONS: Record<string, string> = {
  q1: "Escreva o perfil de liderança da empresa: três a cinco comportamentos esperados, com exemplos do que é e do que não é. É a régua de todas as outras práticas.",
  q2: "Compare os líderes com melhores resultados com os demais e identifique o que fazem diferente. Um mapeamento comportamental torna essa diferença mensurável.",
  q3: "Antes da próxima promoção, defina critérios de potencial — capacidade de aprender, de liderar pessoas, de lidar com ambiguidade — e avalie cada candidato contra eles, além do desempenho atual.",
  q4: "Dê aos líderes leitura do perfil de cada pessoa do time. Saber como cada um se motiva e reage sob pressão é o que permite ajustar a gestão sem adivinhar.",
  q5: "Coloque o feedback na agenda: conversas individuais com periodicidade fixa e um roteiro simples. Feedback que só aparece depois do problema vira cobrança.",
  q6: "Peça a cada líder que identifique quem poderia substituí-lo e monte com essa pessoa um plano de desenvolvimento. Cargo crítico sem sucessor é risco do negócio.",
  q7: "Troque o \"acho que\" por evidência nas decisões de pessoas: avaliações estruturadas, histórico de entregas e dados comportamentais nas promoções e movimentações.",
  q8: "Escolha de dois a três indicadores de liderança — rotatividade do time, engajamento, prontidão de sucessores — e acompanhe por trimestre.",
};

/** Resumo de uma resposta para a tela do admin e para a planilha. */
export function summarize(questions: DiagnosticQuestion[], answers: Answers, scaleMin: number, scaleMax: number) {
  const values = questions.map((q) => answers[q.key]).filter((v): v is number => typeof v === "number");
  const score = scoreFor(values, scaleMin, scaleMax);
  return {
    score,
    level: levelFor(score),
    dimensions: dimensionScores(questions, answers, scaleMin, scaleMax),
  };
}

// ── Validação do formulário ─────────────────────────────────────────────────
// As mesmas regras de `submit_diagnostic`. Aqui servem para avisar antes de
// enviar; o banco é quem garante.

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function validateLead(lead: { name: string; email: string; phone: string; company: string }) {
  const errors: Partial<Record<keyof typeof lead, string>> = {};
  const name = lead.name.trim();
  if (name.length < 2) errors.name = "Informe seu nome.";
  else if (name.length > 120) errors.name = "Nome longo demais.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email.trim())) errors.email = "Confira o e-mail.";
  const digits = onlyDigits(lead.phone);
  if (digits.length < 10 || digits.length > 13) errors.phone = "Informe DDD e número.";
  if (lead.company.trim().length < 1) errors.company = "Informe a empresa.";
  else if (lead.company.trim().length > 160) errors.company = "Nome longo demais.";
  return errors;
}

/** (51) 99999-9999 enquanto a pessoa digita. */
export function formatPhone(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Mensagem legível para os erros que `submit_diagnostic` levanta. */
export function submitErrorMessage(raw: string | undefined): string {
  const code = (raw || "").split(":")[0];
  switch (code) {
    case "diagnostic_unavailable": return "Este diagnóstico não está mais recebendo respostas.";
    case "consent_required": return "Para ver o resultado, é preciso concordar com o uso dos dados.";
    case "invalid_name": return "Confira o nome informado.";
    case "invalid_email": return "Confira o e-mail informado.";
    case "invalid_phone": return "Confira o telefone: DDD e número.";
    case "invalid_company": return "Confira o nome da empresa.";
    case "missing_answer":
    case "invalid_answer": return "Alguma pergunta ficou sem resposta. Volte e confira.";
    default: return "Não foi possível enviar agora. Verifique a conexão e tente de novo.";
  }
}
