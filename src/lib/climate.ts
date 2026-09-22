/**
 * Leitura de clima: score, faixas, eNPS e agrupamento anônimo.
 *
 * Tudo que o dashboard, o relatório público e a exportação mostram passa por
 * aqui, para que os três contem a mesma história com os mesmos números.
 */

/** Mínimo de PESSOAS num recorte para ele poder aparecer. */
export const MIN_GROUP = 3;

export interface ResponseRow {
  question_id: string;
  value: number | null;
  text_value?: string | null;
  department: string | null;
  company_leadership: string | null;
  department_leadership: string | null;
  evaluated_leader: string | null;
  submitted_at: string;
  /** Sorteado por envio. Ausente nas respostas anteriores à migração. */
  submission_id?: string | null;
}

/**
 * Identifica o envio a que a linha pertence, sem identificar a pessoa.
 *
 * Usa `submission_id` quando existe. Para as respostas gravadas antes dessa
 * coluna, cai no par (instante do envio, líder avaliado): as linhas de um mesmo
 * INSERT compartilham o timestamp da transação, então o par separa envios
 * distintos igualmente bem.
 */
export function submissionKey(r: ResponseRow): string {
  return r.submission_id || `${r.submitted_at}|${r.evaluated_leader ?? ""}`;
}

/** Quantas pessoas distintas estão por trás destas linhas. */
export function countPeople(rows: ResponseRow[]): number {
  return new Set(rows.map(submissionKey)).size;
}

// ── Score ────────────────────────────────────────────────────────────────────

/** Converte a média bruta da escala num score de 0 a 100. */
export function scoreFromAverage(avg: number, scaleMin: number, scaleMax: number): number {
  const span = scaleMax - scaleMin;
  if (span <= 0) return 0;
  return Math.round(((avg - scaleMin) / span) * 100);
}

export type ClimateBand = "critical" | "low" | "mid" | "good" | "high";

interface BandInfo {
  band: ClimateBand;
  label: string;
  /** Variável CSS, para casar com o tema claro e o escuro. */
  color: string;
  /** Uma frase sobre o que o número quer dizer. */
  meaning: string;
}

const BANDS: { min: number; info: BandInfo }[] = [
  { min: 85, info: { band: "high", label: "Muito saudável", color: "hsl(var(--climate-high))", meaning: "Clima forte e consistente. Vale entender o que sustenta esse resultado para não perder." } },
  { min: 70, info: { band: "good", label: "Saudável", color: "hsl(var(--climate-good))", meaning: "Base sólida, com pontos específicos a melhorar." } },
  { min: 55, info: { band: "mid", label: "Atenção", color: "hsl(var(--climate-mid))", meaning: "O clima se sustenta, mas há desgaste visível. É onde a ação preventiva rende mais." } },
  { min: 40, info: { band: "low", label: "Frágil", color: "hsl(var(--climate-low))", meaning: "Insatisfação disseminada. Costuma aparecer antes de saída de gente." } },
  { min: -1, info: { band: "critical", label: "Crítico", color: "hsl(var(--climate-critical))", meaning: "Problema estrutural. Pede leitura qualitativa e ação direta." } },
];

export function climateBand(score: number): BandInfo {
  return (BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1]).info;
}

/** Cor da faixa em que o score cai — atalho para gráficos. */
export function scoreColor(score: number): string {
  return climateBand(score).color;
}

/** Cor a partir da média bruta, quando é mais prático que converter antes. */
export function averageColor(avg: number, scaleMin: number, scaleMax: number): string {
  return scoreColor(scoreFromAverage(avg, scaleMin, scaleMax));
}

// ── eNPS ─────────────────────────────────────────────────────────────────────

export interface Enps {
  score: number;      // -100 a 100
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
}

/**
 * eNPS a partir das notas de 0 a 10.
 *
 * A pesquisa já aceitava pergunta com escala `enps`, mas o resultado era tratado
 * como uma média qualquer — o que não quer dizer nada nessa métrica. Aqui ela é
 * calculada como manda a definição: promotores (9–10) menos detratores (0–6).
 */
export function computeEnps(values: number[]): Enps | null {
  const vals = values.filter((v) => Number.isFinite(v) && v >= 0 && v <= 10);
  if (vals.length === 0) return null;
  const promoters = vals.filter((v) => v >= 9).length;
  const passives = vals.filter((v) => v >= 7 && v <= 8).length;
  const detractors = vals.filter((v) => v <= 6).length;
  const total = vals.length;
  const pct = (n: number) => (n / total) * 100;
  return {
    promoters, passives, detractors, total,
    promoterPct: Math.round(pct(promoters)),
    passivePct: Math.round(pct(passives)),
    detractorPct: Math.round(pct(detractors)),
    score: Math.round(pct(promoters) - pct(detractors)),
  };
}

/** Como se lê um eNPS. As faixas são as usadas no mercado. */
export function enpsBand(score: number): { label: string; color: string } {
  if (score >= 50) return { label: "Excelente", color: "hsl(var(--climate-high))" };
  if (score >= 20) return { label: "Bom", color: "hsl(var(--climate-good))" };
  if (score >= 0) return { label: "Razoável", color: "hsl(var(--climate-mid))" };
  if (score >= -20) return { label: "Frágil", color: "hsl(var(--climate-low))" };
  return { label: "Crítico", color: "hsl(var(--climate-critical))" };
}

// ── Agrupamento com corte de anonimato ───────────────────────────────────────

export interface GroupStat {
  name: string;
  avg: number;
  score: number;
  /** Pessoas distintas — é este número que o corte de anonimato usa. */
  people: number;
  /** Notas somadas no grupo, para referência. */
  answers: number;
}

/**
 * Média por recorte (área, liderança…), escondendo grupos pequenos demais.
 *
 * Devolve também `suppressed`: quantos recortes ficaram de fora. Mostrar essa
 * contagem é o que evita a leitura errada de "essa área não respondeu" quando
 * na verdade ela respondeu e está protegida.
 */
export function groupByWithPrivacy(
  rows: ResponseRow[],
  keyOf: (r: ResponseRow) => string | null,
  scaleMin: number,
  scaleMax: number,
  minGroup: number = MIN_GROUP,
): { groups: GroupStat[]; suppressed: number; suppressedNames: string[] } {
  const buckets = new Map<string, ResponseRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k || r.value == null) continue;
    const arr = buckets.get(k) || [];
    arr.push(r);
    buckets.set(k, arr);
  }

  const groups: GroupStat[] = [];
  const suppressedNames: string[] = [];

  for (const [name, bucket] of buckets) {
    const people = countPeople(bucket);
    if (people < minGroup) {
      suppressedNames.push(name);
      continue;
    }
    const vals = bucket.map((r) => r.value!);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    groups.push({
      name,
      avg: round2(avg),
      score: scoreFromAverage(avg, scaleMin, scaleMax),
      people,
      answers: vals.length,
    });
  }

  groups.sort((a, b) => b.avg - a.avg);
  return { groups, suppressed: suppressedNames.length, suppressedNames };
}

// ── Distribuição e concordância ──────────────────────────────────────────────

/**
 * Quanto o grupo concorda entre si, de 0 a 100.
 *
 * Uma média 3 pode ser "todo mundo achou regular" ou "metade amou e metade
 * odiou" — situações que pedem ações opostas. Este número separa as duas:
 * 100 = resposta unânime, 0 = grupo partido nos extremos. Calculado como o
 * complemento do desvio padrão sobre o desvio máximo possível na escala.
 */
export function consensus(values: number[], scaleMin: number, scaleMax: number): number {
  if (values.length < 2) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  const maxSd = (scaleMax - scaleMin) / 2; // pior caso: metade em cada extremo
  if (maxSd <= 0) return 100;
  return Math.max(0, Math.round((1 - sd / maxSd) * 100));
}

/** Quantidade de respostas em cada nota da escala. */
export function distribution(values: number[], scaleMin: number, scaleMax: number): number[] {
  const dist = new Array(scaleMax - scaleMin + 1).fill(0);
  for (const v of values) {
    const i = v - scaleMin;
    if (i >= 0 && i < dist.length) dist[i]++;
  }
  return dist;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Corta o texto sem partir palavra no meio. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}
