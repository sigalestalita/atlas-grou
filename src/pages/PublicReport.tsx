import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, ChevronDown, Download, Loader2, MessageSquareQuote,
  Printer, ShieldCheck, Trophy,
} from "lucide-react";
import { ReportAccessGate } from "@/components/ReportAccessGate";
import { exportReportToCSV } from "@/lib/exportReportCsv";
import { climateBand, enpsBand, scoreColor } from "@/lib/climate";
import { cn } from "@/lib/utils";

/**
 * Relatório que a empresa cliente recebe.
 *
 * É a peça que sai da plataforma para o cliente, então é white-label de ponta
 * a ponta: logo e cores da empresa, nenhuma menção à Grou. A versão anterior
 * trazia o logo da Grou no topo e na abertura, o que contrariava a regra do
 * produto.
 *
 * Fundo claro em vez do tema escuro anterior — este relatório é lido em
 * reunião e impresso, e página escura gasta tinta e some no projetor.
 *
 * Os dados vêm da função `public-report`; o contrato não mudou.
 */

type Distribution = { value: number; count: number; percent: number; label?: string };
type CommentsByLeader = { leader: string; comments: string[] };
type EnpsStats = {
  promoters: number; passives: number; detractors: number;
  promoters_pct: number; passives_pct: number; detractors_pct: number;
  score: number;
};
type StatsByLeader = {
  leader: string; total: number; respondent_count: number;
  distribution: Distribution[]; enps?: EnpsStats;
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
  key: string; label: string;
  respondent_count?: number; respondent_total?: number;
  questions: Question[];
};
type ReportData = {
  company: { name: string; logo_url?: string; primary_color: string; secondary_color: string };
  survey: { title: string; scale_min: number; scale_max: number };
  scale_labels?: string[];
  categories: Category[];
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Média de uma pergunta de escala a partir da distribuição. */
function meanOf(q: Question): { mean: number; n: number } | null {
  if (q.type !== "scale" || !q.distribution?.length || q.scale_type === "enps") return null;
  let sum = 0, n = 0;
  for (const d of q.distribution) { sum += d.value * d.count; n += d.count; }
  return n > 0 ? { mean: sum / n, n } : null;
}

export default function PublicReport() {
  const params = useParams();
  // Aceita /relatorio/:slug e /result-<slug>.
  const slug = params.slug
    ?? (params.resultSlug?.startsWith("result-") ? params.resultSlug.slice("result-".length) : undefined);
  const storageKey = `report_access_code:${slug ?? ""}`;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("");
  const [accessCode, setAccessCode] = useState(() => localStorage.getItem(storageKey) ?? "");
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [gateCompany, setGateCompany] = useState<{ name?: string; logo_url?: string }>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const codeParam = accessCode ? `&code=${encodeURIComponent(accessCode)}` : "";
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/public-report?slug=${encodeURIComponent(slug ?? "")}${codeParam}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
        );
        const json = await res.json();
        if (!res.ok) {
          if (json.code_required) {
            setGateCompany(json.company ?? {});
            setNeedsCode(true);
            setCodeInvalid(json.error === "code_invalid");
            if (json.error === "code_invalid") localStorage.removeItem(storageKey);
            return;
          }
          throw new Error(json.error || "Não foi possível carregar o relatório.");
        }
        setNeedsCode(false);
        if (accessCode) localStorage.setItem(storageKey, accessCode);
        setData(json);
        setActiveCategory(json.categories[0]?.key ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, accessCode, storageKey]);

  /** Retrato geral: score de clima e os extremos, sobre todas as categorias. */
  const summary = useMemo(() => {
    if (!data) return null;
    const all = data.categories.flatMap((c) => c.questions);
    const min = data.survey.scale_min ?? 1;
    const max = data.survey.scale_max ?? 5;

    let sum = 0, n = 0;
    const scored: { text: string; mean: number; section: string }[] = [];
    for (const q of all) {
      const m = meanOf(q);
      if (!m) continue;
      sum += m.mean * m.n;
      n += m.n;
      scored.push({ text: q.text, mean: m.mean, section: q.section_title });
    }
    if (!n) return null;

    const mean = sum / n;
    const score = Math.round(((mean - min) / (max - min)) * 100);
    scored.sort((a, b) => a.mean - b.mean);

    const enpsQuestion = all.find((q) => q.scale_type === "enps" && q.enps);
    const people = Math.max(0, ...data.categories.map((c) => c.respondent_count ?? 0));

    return {
      score, mean, min, max, people,
      weak: scored.slice(0, 3),
      strong: scored.slice(-3).reverse(),
      enps: enpsQuestion?.enps ?? null,
      questionCount: scored.length,
    };
  }, [data]);

  if (needsCode) {
    return (
      <ReportAccessGate
        companyName={gateCompany.name}
        companyLogoUrl={gateCompany.logo_url}
        invalid={codeInvalid}
        onSubmit={(code) => { setCodeInvalid(false); setAccessCode(code); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Carregando o relatório…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Não foi possível abrir o relatório</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const current = data.categories.find((c) => c.key === activeCategory) ?? data.categories[0];
  const brand = {
    "--c-primary": data.company.primary_color || "#15498D",
    "--c-secondary": data.company.secondary_color || "#071A34",
  } as React.CSSProperties;
  const band = summary ? climateBand(summary.score) : null;

  return (
    <div style={brand} className="min-h-screen bg-background">
      {/* Topo */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md print:static print:bg-transparent">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {data.company.logo_url ? (
              <img src={data.company.logo_url} alt={data.company.name} className="h-9 w-auto max-w-[180px] object-contain" />
            ) : (
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
                style={{ background: "var(--c-primary)" }}
              >
                {data.company.name[0]}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Pesquisa de clima
              </p>
              <p className="truncate text-[14px] font-semibold">
                {data.survey.title.replace(/^Pesquisa de Clima Organizacional\s*[-–]\s*/i, "")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />Imprimir
            </Button>
            <Button size="sm" className="h-9 rounded-xl" onClick={() => exportReportToCSV(data)}>
              <Download className="mr-2 h-4 w-4" />CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 md:px-8 md:py-10">
        {/* Retrato geral */}
        {summary && band && (
          <section className="mb-9">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
              <div
                className="relative overflow-hidden rounded-[26px] p-6 text-white"
                style={{ backgroundImage: "linear-gradient(135deg, var(--c-secondary) 0%, var(--c-primary) 100%)" }}
              >
                <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
                <p className="relative text-[12px] font-medium uppercase tracking-[0.14em] text-white/70">
                  Score de clima
                </p>
                <p className="relative mt-2 text-[56px] font-bold leading-none tabular-nums">{summary.score}</p>
                <p className="relative mt-1 text-[13px] text-white/70">de 100 · média {summary.mean.toFixed(2)} de {summary.max}</p>
                <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white/90 transition-all duration-1000" style={{ width: `${summary.score}%` }} />
                </div>
                <p className="relative mt-4 text-[15px] font-semibold">{band.label}</p>
                <p className="relative mt-1 text-[12.5px] leading-relaxed text-white/75">{band.meaning}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <HighlightCard
                  icon={Trophy} tone="good" title="O que sustenta o clima"
                  items={summary.strong} min={summary.min} max={summary.max}
                />
                <HighlightCard
                  icon={AlertTriangle} tone="low" title="Onde agir primeiro"
                  items={summary.weak} min={summary.min} max={summary.max}
                />
                {summary.enps && (
                  <div className="rounded-[22px] border border-border bg-card p-5 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">eNPS</p>
                        <p className="mt-1 text-[34px] font-bold leading-none tabular-nums"
                          style={{ color: enpsBand(summary.enps.score).color }}>
                          {summary.enps.score > 0 ? `+${summary.enps.score}` : summary.enps.score}
                        </p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {enpsBand(summary.enps.score).label} · promotores menos detratores
                        </p>
                      </div>
                      <div className="flex gap-5 text-center">
                        <EnpsPart label="Promotores" hint="9–10" pct={summary.enps.promoters_pct} n={summary.enps.promoters} color="hsl(var(--climate-high))" />
                        <EnpsPart label="Neutros" hint="7–8" pct={summary.enps.passives_pct} n={summary.enps.passives} color="hsl(var(--climate-mid))" />
                        <EnpsPart label="Detratores" hint="0–6" pct={summary.enps.detractors_pct} n={summary.enps.detractors} color="hsl(var(--climate-critical))" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Respostas anônimas. Grupos pequenos demais para garantir o anonimato não aparecem separados.
            </p>
          </section>
        )}

        {/* Categorias */}
        {data.categories.length > 1 && (
          <nav className="sticky top-[62px] z-20 -mx-4 mb-7 bg-background/95 px-4 py-2.5 backdrop-blur-md print:hidden md:-mx-8 md:px-8">
            <div className="flex flex-wrap gap-1.5">
              {data.categories.map((c) => {
                const on = c.key === current.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => setActiveCategory(c.key)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-all",
                      on ? "border-transparent text-white" : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                    style={on ? { background: "var(--c-primary)" } : undefined}
                  >
                    <span className="truncate">{c.label}</span>
                    <span className={cn(
                      "grid h-5 min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[10.5px] tabular-nums",
                      on ? "bg-white/25" : "bg-muted",
                    )}>
                      {c.respondent_count ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        <CategoryView key={current.key} category={current} scaleLabels={data.scale_labels} survey={data.survey} />
      </main>

      <footer className="border-t border-border py-7 text-center">
        <p className="text-[12px] text-muted-foreground">{data.company.name}</p>
      </footer>

      <style>{`
        @media print {
          nav, header button { display: none !important; }
          body { background: #fff; }
          section, article { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

function EnpsPart({ label, hint, pct, n, color }: { label: string; hint: string; pct: number; n: number; color: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="text-[19px] font-bold tabular-nums" style={{ color }}>{pct.toFixed(0)}%</p>
      <p className="text-[10.5px] text-muted-foreground">{n} · {hint}</p>
    </div>
  );
}

function HighlightCard({
  icon: Icon, tone, title, items, min, max,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  tone: "good" | "low";
  title: string;
  items: { text: string; mean: number; section: string }[];
  min: number; max: number;
}) {
  const color = tone === "good" ? "hsl(var(--climate-good))" : "hsl(var(--climate-low))";
  return (
    <div className="rounded-[22px] border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Icon className="h-4 w-4" style={{ color }} />
        {title}
      </p>
      <div className="mt-3 space-y-2.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] leading-snug">{it.text}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{it.section}</p>
            </div>
            <span
              className="shrink-0 text-[15px] font-bold tabular-nums"
              style={{ color: scoreColor(((it.mean - min) / (max - min)) * 100) }}
            >
              {it.mean.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryView({
  category, scaleLabels, survey,
}: {
  category: Category;
  scaleLabels?: string[];
  survey: { scale_min: number; scale_max: number };
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, Question[]>();
    for (const q of category.questions) {
      if (!m.has(q.section_title)) m.set(q.section_title, []);
      m.get(q.section_title)!.push(q);
    }
    return Array.from(m.entries());
  }, [category]);

  if (!category.questions.length) {
    return (
      <div className="rounded-[22px] border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
        Sem respostas nesta categoria.
      </div>
    );
  }

  let n = 0;
  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Categoria</p>
          <h2 className="mt-1 text-[26px] font-semibold tracking-tight">{category.label}</h2>
        </div>
        <div className="text-right">
          <p className="text-[26px] font-bold leading-none tabular-nums">
            {category.respondent_count ?? 0}
            {category.respondent_total != null && (
              <span className="text-[20px] text-muted-foreground"> / {category.respondent_total}</span>
            )}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {(category.respondent_count ?? 0) === 1 ? "pessoa respondeu" : "pessoas responderam"}
          </p>
        </div>
      </div>

      <AverageByQuestion questions={category.questions} survey={survey} />

      {grouped.map(([section, qs]) => (
        <section key={section} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-7 w-1 rounded-full" style={{ background: "var(--c-primary)" }} />
            <h3 className="text-[17px] font-semibold tracking-tight">
              {section.replace(/^\s*\d+(\.\d+)*[.)\-:]?\s*/, "")}
            </h3>
            <Badge variant="outline" className="ml-auto rounded-full text-[11px]">
              {qs.length} {qs.length === 1 ? "pergunta" : "perguntas"}
            </Badge>
          </div>
          <div className="space-y-4">
            {qs.map((q) => { n += 1; return <QuestionCard key={q.id} index={n} q={q} scaleLabels={scaleLabels} />; })}
          </div>
        </section>
      ))}
    </div>
  );
}

function AverageByQuestion({
  questions, survey,
}: { questions: Question[]; survey: { scale_min: number; scale_max: number } }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const min = survey.scale_min ?? 1;
  const max = survey.scale_max ?? 5;

  const items = useMemo(() => questions.map((q) => {
    const m = meanOf(q);
    if (!m) return null;
    return {
      id: q.id, text: q.text, mean: m.mean, n: m.n,
      pct: ((m.mean - min) / (max - min)) * 100,
    };
  }).filter(Boolean) as { id: string; text: string; mean: number; n: number; pct: number }[],
  [questions, min, max]);

  if (!items.length) return null;

  // Da pior para a melhor: o que precisa de atenção aparece primeiro.
  const sorted = [...items].sort((a, b) => a.mean - b.mean);

  return (
    <section>
      <h3 className="text-[17px] font-semibold tracking-tight">Média por pergunta</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Da menor para a maior média. Toque para ver a pergunta inteira.
      </p>
      <div className="mt-3 rounded-[22px] border border-border bg-card p-4">
        <div className="space-y-1">
          {sorted.map((it) => {
            const isOpen = !!open[it.id];
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [it.id]: !s[it.id] }))}
                aria-expanded={isOpen}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60 sm:grid-cols-[minmax(0,17rem)_1fr_auto]"
              >
                <span className={cn("flex items-start gap-1.5 text-[13px] text-muted-foreground", !isOpen && "truncate")}>
                  <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} />
                  <span className={isOpen ? "whitespace-normal break-words" : "truncate"}>{it.text}</span>
                </span>
                <span className="col-span-2 h-2.5 overflow-hidden rounded-full bg-muted sm:col-span-1">
                  <span
                    className="block h-full rounded-full transition-all duration-700"
                    style={{ width: `${it.pct}%`, backgroundColor: scoreColor(it.pct) }}
                  />
                </span>
                <span className="w-12 text-right text-[13px] font-bold tabular-nums" style={{ color: scoreColor(it.pct) }}>
                  {it.mean.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function QuestionCard({ index, q, scaleLabels }: { index: number; q: Question; scaleLabels?: string[] }) {
  const isText = q.type === "text";
  const isChoice = q.type === "choice";

  return (
    <article className="overflow-hidden rounded-[22px] border border-border bg-card">
      <div className="flex items-start gap-3.5 border-b border-border p-5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[12.5px] font-bold tabular-nums"
          style={{ background: "color-mix(in srgb, var(--c-primary) 12%, #fff)", color: "var(--c-primary)" }}
        >
          {String(index).padStart(2, "0")}
        </span>
        <h4 className="text-[15px] font-semibold leading-snug">{q.text}</h4>
      </div>

      <div className="p-5">
        {!isText && q.distribution && (
          q.stats_by_leader?.length ? (
            <div className="space-y-6">
              <GroupBlock label="Geral" total={q.total}>
                {q.scale_type === "enps" && q.enps
                  ? <EnpsView q={q} />
                  : <ScaleDistribution distribution={q.distribution} scaleLabels={isChoice ? undefined : (q.scale_labels ?? scaleLabels)} reverse={!isChoice} />}
              </GroupBlock>
              {q.stats_by_leader.map((g) => (
                <GroupBlock key={g.leader} label={g.leader} total={g.total}>
                  {q.scale_type === "enps" && g.enps
                    ? <EnpsView q={{ ...q, distribution: g.distribution, total: g.total, enps: g.enps }} />
                    : <ScaleDistribution distribution={g.distribution} scaleLabels={isChoice ? undefined : (q.scale_labels ?? scaleLabels)} reverse={!isChoice} />}
                </GroupBlock>
              ))}
            </div>
          ) : q.scale_type === "enps" && q.enps ? (
            <EnpsView q={q} />
          ) : (
            <ScaleDistribution distribution={q.distribution} scaleLabels={isChoice ? undefined : (q.scale_labels ?? scaleLabels)} reverse={!isChoice} />
          )
        )}

        {isText && <Comments q={q} />}
      </div>
    </article>
  );
}

function GroupBlock({ label, total, children }: { label: string; total: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-px flex-1 bg-border" />
        <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{total}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </div>
  );
}

function Comments({ q }: { q: Question }) {
  const groups = q.comments_by_leader?.length
    ? q.comments_by_leader
    : q.comments?.length
      ? [{ leader: "Comentários", comments: q.comments }]
      : [];

  if (!groups.length) {
    return (
      <p className="py-6 text-center text-[13px] italic text-muted-foreground">
        Sem comentários nesta categoria.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <GroupBlock key={group.leader} label={group.leader} total={group.comments.length}>
          <div className="space-y-2.5">
            {group.comments.map((c, i) => (
              <blockquote
                key={i}
                className="relative whitespace-pre-wrap rounded-xl bg-muted/50 py-3 pl-8 pr-3.5 text-[13.5px] leading-relaxed"
                style={{ borderLeft: "3px solid var(--c-primary)" }}
              >
                <MessageSquareQuote className="absolute left-2.5 top-3 h-3.5 w-3.5 text-muted-foreground/60" />
                {c}
              </blockquote>
            ))}
          </div>
        </GroupBlock>
      ))}
    </div>
  );
}

function ScaleDistribution({
  distribution, scaleLabels, reverse = true,
}: { distribution: Distribution[]; scaleLabels?: string[]; reverse?: boolean }) {
  const items = reverse ? distribution.slice().reverse() : distribution;
  const values = distribution.map((d) => d.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  /**
   * Cor da faixa. Escolha com rótulo próprio (Sim/Não/Em parte) segue o
   * sentido da palavra; escala numérica usa a posição dentro da própria
   * escala — antes o mapa era fixo de 1 a 5 e uma escala de 1 a 7 saía
   * toda cinza a partir do 6.
   */
  const colorFor = (d: Distribution) => {
    if (d.label) {
      const norm = d.label.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (norm.includes("nao")) return "hsl(var(--climate-critical))";
      if (norm.startsWith("sim")) return "hsl(var(--climate-high))";
      if (norm.includes("parte") || norm.includes("talvez")) return "hsl(var(--climate-mid))";
    }
    return scoreColor(hi > lo ? ((d.value - lo) / (hi - lo)) * 100 : 100);
  };

  return (
    <div className="space-y-2.5">
      {items.map((d) => {
        const label = d.label ?? scaleLabels?.[d.value - 1];
        const color = colorFor(d);
        return (
          <div key={d.value} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <div className="flex w-36 items-center gap-2 sm:w-44">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {d.value}
              </span>
              {label && <span className="truncate text-[12px] text-muted-foreground" title={label}>{label}</span>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.percent}%`, backgroundColor: color }} />
            </div>
            <div className="flex w-[84px] items-baseline justify-end gap-1.5 tabular-nums">
              <span className="text-[13px] font-bold">{d.percent.toFixed(1)}%</span>
              <span className="text-[11px] text-muted-foreground">({d.count})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnpsView({ q }: { q: Question }) {
  const e = q.enps!;
  const dist = q.distribution ?? [];
  const colorFor = (v: number) =>
    v >= 9 ? "hsl(var(--climate-high))" : v >= 7 ? "hsl(var(--climate-mid))" : "hsl(var(--climate-critical))";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border bg-muted/40 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Score eNPS</p>
          <p className="mt-1 text-[34px] font-bold leading-none tabular-nums" style={{ color: enpsBand(e.score).color }}>
            {e.score > 0 ? `+${e.score}` : e.score}
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {enpsBand(e.score).label} · {q.total} {q.total === 1 ? "resposta" : "respostas"}
          </p>
        </div>
        <div className="flex gap-5 text-center">
          <EnpsPart label="Promotores" hint="9–10" pct={e.promoters_pct} n={e.promoters} color="hsl(var(--climate-high))" />
          <EnpsPart label="Neutros" hint="7–8" pct={e.passives_pct} n={e.passives} color="hsl(var(--climate-mid))" />
          <EnpsPart label="Detratores" hint="0–6" pct={e.detractors_pct} n={e.detractors} color="hsl(var(--climate-critical))" />
        </div>
      </div>

      <div className="space-y-2">
        {dist.slice().reverse().map((d) => (
          <div key={d.value} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg text-[12px] font-bold text-white"
              style={{ backgroundColor: colorFor(d.value) }}
            >
              {d.value}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.percent}%`, backgroundColor: colorFor(d.value) }} />
            </div>
            <div className="flex w-[84px] items-baseline justify-end gap-1.5 tabular-nums">
              <span className="text-[13px] font-bold">{d.percent.toFixed(1)}%</span>
              <span className="text-[11px] text-muted-foreground">({d.count})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
