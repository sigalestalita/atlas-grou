// CSV export for the public report data.
// Produces a well-organized multi-section CSV containing:
//   1) Resumo geral (categorias e respondentes)
//   2) Médias por pergunta (perguntas de escala)
//   3) Distribuição de respostas (escala/escolha) por pergunta
//   4) Distribuição por líder (quando disponível)
//   5) eNPS (quando aplicável)
//   6) Comentários (perguntas abertas, separados por líder quando houver)

type Distribution = { value: number; count: number; percent: number; label?: string };
type CommentsByLeader = { leader: string; comments: string[] };
type EnpsStats = {
  promoters: number; passives: number; detractors: number;
  promoters_pct: number; passives_pct: number; detractors_pct: number;
  score: number;
};
type StatsByLeader = {
  leader: string;
  total: number;
  respondent_count: number;
  distribution: Distribution[];
  enps?: EnpsStats;
};
type Question = {
  id: string;
  text: string;
  section_title: string;
  type: "scale" | "text" | "choice";
  scale_type?: string;
  scale_min?: number;
  scale_max?: number;
  total: number;
  respondent_count?: number;
  distribution?: Distribution[];
  comments?: string[];
  comments_by_leader?: CommentsByLeader[];
  stats_by_leader?: StatsByLeader[];
  enps?: EnpsStats;
  scale_labels?: string[];
};
type Category = {
  key: string;
  label: string;
  respondent_count?: number;
  respondent_total?: number;
  questions: Question[];
};
type ReportData = {
  company: { name: string };
  survey: { title: string; scale_min: number; scale_max: number };
  scale_labels?: string[];
  categories: Category[];
};

const escapeCsv = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const row = (cells: unknown[]): string => cells.map(escapeCsv).join(";");

const stripPrefix = (s: string) => s.replace(/^\s*\d+(\.\d+)*[.\)\-:]?\s*/, "");

const labelFor = (q: Question, d: Distribution, fallback?: string[]): string => {
  if (d.label) return d.label;
  if (q.scale_labels && q.scale_labels.length) {
    const idx = d.value - (q.scale_min ?? 1);
    if (idx >= 0 && idx < q.scale_labels.length) return q.scale_labels[idx];
  }
  if (fallback && fallback.length) {
    const idx = d.value - (q.scale_min ?? 1);
    if (idx >= 0 && idx < fallback.length) return fallback[idx];
  }
  return String(d.value);
};

const meanOf = (dist: Distribution[]): { mean: number; n: number } => {
  let sum = 0, n = 0;
  dist.forEach((d) => { sum += d.value * d.count; n += d.count; });
  return { mean: n > 0 ? sum / n : 0, n };
};

export function exportReportToCSV(data: ReportData, filename?: string) {
  const lines: string[] = [];
  const scaleFallback = data.scale_labels;

  lines.push(row(["Relatório", data.survey.title]));
  lines.push(row(["Empresa", data.company.name]));
  lines.push(row(["Gerado em", new Date().toLocaleString("pt-BR")]));
  lines.push("");

  // 1) Resumo geral
  lines.push(row(["# 1. RESUMO POR CATEGORIA"]));
  lines.push(row(["Categoria", "Respondentes", "Total possível", "Perguntas"]));
  data.categories.forEach((c) => {
    lines.push(row([
      c.label,
      c.respondent_count ?? "",
      c.respondent_total ?? "",
      c.questions.length,
    ]));
  });
  lines.push("");

  // 2) Médias por pergunta (escala)
  lines.push(row(["# 2. MÉDIA POR PERGUNTA (ESCALA)"]));
  lines.push(row(["Categoria", "Seção", "Pergunta", "Respostas (n)", "Média", "Escala mín", "Escala máx"]));
  data.categories.forEach((c) => {
    c.questions.forEach((q) => {
      if (q.type !== "scale" || !q.distribution || q.scale_type === "enps") return;
      const { mean, n } = meanOf(q.distribution);
      if (n === 0) return;
      lines.push(row([
        c.label,
        stripPrefix(q.section_title),
        q.text,
        n,
        mean.toFixed(2),
        q.scale_min ?? "",
        q.scale_max ?? "",
      ]));
    });
  });
  lines.push("");

  // 3) Distribuição de respostas (escala/escolha)
  lines.push(row(["# 3. DISTRIBUIÇÃO DE RESPOSTAS"]));
  lines.push(row(["Categoria", "Seção", "Pergunta", "Tipo", "Valor", "Rótulo", "Quantidade", "%", "Total"]));
  data.categories.forEach((c) => {
    c.questions.forEach((q) => {
      if (q.type === "text" || !q.distribution) return;
      if (q.scale_type === "enps") return; // tratado em seção própria
      q.distribution.forEach((d) => {
        lines.push(row([
          c.label,
          stripPrefix(q.section_title),
          q.text,
          q.type,
          d.value,
          labelFor(q, d, scaleFallback),
          d.count,
          (d.percent ?? 0).toFixed(1) + "%",
          q.total,
        ]));
      });
    });
  });
  lines.push("");

  // 4) Distribuição por líder
  const hasByLeader = data.categories.some((c) =>
    c.questions.some((q) => q.stats_by_leader && q.stats_by_leader.length > 0),
  );
  if (hasByLeader) {
    lines.push(row(["# 4. DISTRIBUIÇÃO POR LÍDER"]));
    lines.push(row(["Categoria", "Seção", "Pergunta", "Líder", "Valor", "Rótulo", "Quantidade", "%", "Total líder", "Média líder"]));
    data.categories.forEach((c) => {
      c.questions.forEach((q) => {
        if (!q.stats_by_leader || q.scale_type === "enps") return;
        q.stats_by_leader.forEach((g) => {
          const { mean } = meanOf(g.distribution);
          g.distribution.forEach((d) => {
            lines.push(row([
              c.label,
              stripPrefix(q.section_title),
              q.text,
              g.leader,
              d.value,
              labelFor(q, d, scaleFallback),
              d.count,
              (d.percent ?? 0).toFixed(1) + "%",
              g.total,
              mean.toFixed(2),
            ]));
          });
        });
      });
    });
    lines.push("");
  }

  // 5) eNPS
  const hasEnps = data.categories.some((c) => c.questions.some((q) => q.scale_type === "enps" && q.enps));
  if (hasEnps) {
    lines.push(row(["# 5. eNPS"]));
    lines.push(row(["Categoria", "Pergunta", "Grupo", "Promotores", "% Promotores", "Neutros", "% Neutros", "Detratores", "% Detratores", "Score", "Total"]));
    data.categories.forEach((c) => {
      c.questions.forEach((q) => {
        if (q.scale_type !== "enps" || !q.enps) return;
        const e = q.enps;
        lines.push(row([
          c.label, q.text, "Geral",
          e.promoters, e.promoters_pct.toFixed(1) + "%",
          e.passives, e.passives_pct.toFixed(1) + "%",
          e.detractors, e.detractors_pct.toFixed(1) + "%",
          e.score.toFixed(1), q.total,
        ]));
        q.stats_by_leader?.forEach((g) => {
          if (!g.enps) return;
          lines.push(row([
            c.label, q.text, g.leader,
            g.enps.promoters, g.enps.promoters_pct.toFixed(1) + "%",
            g.enps.passives, g.enps.passives_pct.toFixed(1) + "%",
            g.enps.detractors, g.enps.detractors_pct.toFixed(1) + "%",
            g.enps.score.toFixed(1), g.total,
          ]));
        });
      });
    });
    lines.push("");
  }

  // 6) Comentários
  lines.push(row(["# 6. COMENTÁRIOS"]));
  lines.push(row(["Categoria", "Seção", "Pergunta", "Líder", "Comentário"]));
  data.categories.forEach((c) => {
    c.questions.forEach((q) => {
      if (q.type !== "text") return;
      if (q.comments_by_leader && q.comments_by_leader.length > 0) {
        q.comments_by_leader.forEach((g) => {
          g.comments.forEach((cm) => {
            lines.push(row([c.label, stripPrefix(q.section_title), q.text, g.leader, cm]));
          });
        });
      } else if (q.comments && q.comments.length > 0) {
        q.comments.forEach((cm) => {
          lines.push(row([c.label, stripPrefix(q.section_title), q.text, "", cm]));
        });
      }
    });
  });

  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (data.company.name || "relatorio").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  a.href = url;
  a.download = filename || `relatorio_${safe}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
