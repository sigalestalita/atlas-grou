import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquareQuote, BarChart3 } from "lucide-react";
import { IntroSplash } from "@/components/IntroSplash";
import grouLogo from "@/assets/grou-logo.png";
import introBg from "@/assets/intro-bg.png";

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
  raw_total?: number;
  duplicates_removed?: number;
  respondent_count?: number;
  distribution?: Distribution[];
  comments?: string[];
  comments_by_leader?: CommentsByLeader[];
  stats_by_leader?: StatsByLeader[];
  enps?: EnpsStats;
};
type Category = { key: string; label: string; respondent_count?: number; respondent_total?: number; questions: Question[] };
type ReportData = {
  company: { name: string; logo_url?: string; primary_color: string; secondary_color: string };
  survey: { title: string; scale_min: number; scale_max: number };
  scale_labels?: string[];
  categories: Category[];
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Score color mapping (1=red ... 5=green)
const SCORE_COLORS: Record<number, string> = {
  1: "hsl(0 72% 55%)",
  2: "hsl(20 85% 55%)",
  3: "hsl(45 90% 55%)",
  4: "hsl(95 55% 48%)",
  5: "hsl(145 60% 42%)",
};

export default function PublicReport() {
  const params = useParams();
  // Support both /relatorio/:slug and /result-<slug> (via /:resultSlug)
  const slug = params.slug
    ?? (params.resultSlug?.startsWith("result-") ? params.resultSlug.slice("result-".length) : undefined);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/public-report?slug=${encodeURIComponent(slug ?? "")}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro ao carregar");
        setData(json);
        setActiveCategory(json.categories[0]?.key ?? "");
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Carregando relatório...</div>;
  if (error) return <div className="p-12 text-center text-destructive">{error}</div>;
  if (!data) return null;

  const current = data.categories.find((c) => c.key === activeCategory) ?? data.categories[0];

  return (
    <>
      <IntroSplash
        companyLogoUrl={data.company.logo_url}
        companyName={data.company.name}
        eyebrow="Pesquisa de Clima Organizacional"
        title={data.survey.title.replace("Pesquisa de Clima Organizacional - ", "")}
      />
      <div className="relative min-h-screen overflow-hidden bg-[#020617] text-foreground">
        {/* Cosmic background — same vibe as IntroSplash */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${introBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.55,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.75) 55%, rgba(2,6,23,0.95) 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(2,6,23,0.85) 0%, rgba(2,6,23,0.35) 18%, rgba(2,6,23,0.35) 82%, rgba(2,6,23,0.9) 100%)",
            }}
          />
        </div>

        {/* Top bar */}
        <header className="relative z-20 border-b border-white/10 bg-[#020617]/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-10">
            <div className="flex items-center gap-3 md:gap-5">
              <img src={grouLogo} alt="Grou" className="h-6 w-auto brightness-0 invert md:h-7" />
              <span className="h-5 w-px bg-white/25" />
              {data.company.logo_url && (
                <img
                  src={data.company.logo_url}
                  alt={data.company.name}
                  className="h-8 w-auto object-contain md:h-10"
                />
              )}
            </div>
            <div className="text-left md:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">
                Pesquisa de Clima · Relatório
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white md:text-base">
                {data.survey.title.replace("Pesquisa de Clima Organizacional - ", "")}
              </p>
            </div>
          </div>
        </header>

        {/* Stage */}
        <main className="relative z-10 mx-auto max-w-6xl px-3 py-6 md:px-10 md:py-10">
          {/* Category pills */}
          <nav className="mb-6 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-xl">
            <span className="px-2 font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-white/55">
              Categorias
            </span>
            {data.categories.map((c) => {
              const isActive = c.key === current.key;
              const count = c.respondent_count ?? 0;
              const total = c.respondent_total;
              const display = total != null ? `${count}/${total}` : `${count}`;
              return (
                <button
                  key={c.key}
                  onClick={() => setActiveCategory(c.key)}
                  className={`group flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${
                    isActive
                      ? "border-[#9ec5ff]/60 bg-[#9ec5ff]/15 text-white shadow-[0_0_0_3px_rgba(158,197,255,0.12)]"
                      : "border-white/10 bg-white/5 text-white/65 hover:border-white/25 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="truncate">{c.label}</span>
                  <span
                    className={`grid h-5 min-w-[1.25rem] place-items-center rounded-full px-1.5 font-mono text-[10px] tabular-nums ${
                      isActive ? "bg-[#9ec5ff] text-[#020617]" : "bg-white/10 text-white/60"
                    }`}
                    title={total != null ? `${count} de ${total} respondentes` : `${count} respondentes`}
                  >
                    {display}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Content panel — same look as slide stage */}
          <div
            key={current.key}
            className="rounded-2xl border border-white/10 bg-background p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5 animate-[reportFadeIn_500ms_ease-out] md:p-10"
          >
            <CategoryView category={current} scaleLabels={data.scale_labels} />
          </div>
        </main>

        <style>{`
          @keyframes reportFadeIn {
            0% { opacity: 0; transform: translateY(14px) scale(0.99); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    </>
  );
}

function CategoryView({ category, scaleLabels }: { category: Category; scaleLabels?: string[] }) {
  const grouped = useMemo(() => {
    const m = new Map<string, Question[]>();
    category.questions.forEach((q) => {
      if (!m.has(q.section_title)) m.set(q.section_title, []);
      m.get(q.section_title)!.push(q);
    });
    return Array.from(m.entries());
  }, [category]);

  if (category.questions.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        Sem respostas nesta categoria.
      </Card>
    );
  }

  const respondents = category.respondent_count ?? 0;
  const total = category.respondent_total;

  let qIdx = 0;
  return (
    <div className="space-y-10">
      {/* Category header */}
      <div className="flex items-end justify-between pb-4 border-b">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Categoria</p>
          <h2 className="text-3xl font-bold font-display mt-1">{category.label}</h2>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold font-display tabular-nums">
            {respondents}{total != null ? <span className="text-muted-foreground/70 text-2xl"> / {total}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {total != null ? "respondentes" : (respondents === 1 ? "respondente" : "respondentes")}
          </p>
        </div>
      </div>

      <AverageByQuestion questions={category.questions} />



      {grouped.map(([sectionTitle, qs]) => (
        <section key={sectionTitle} className="space-y-4">
          <div className="flex items-center gap-3 sticky top-0 bg-muted/30 backdrop-blur z-10 py-2">
            <div className="h-8 w-1 bg-primary rounded-full" />
            <h3 className="text-lg font-bold font-display">{sectionTitle.replace(/^\s*\d+(\.\d+)*[.\)\-:]?\s*/, "")}</h3>
            <Badge variant="outline" className="ml-auto text-xs">
              {qs.length} {qs.length === 1 ? "pergunta" : "perguntas"}
            </Badge>
          </div>
          <div className="space-y-4">
            {qs.map((q) => {
              qIdx += 1;
              return <QuestionCard key={q.id} index={qIdx} q={q} scaleLabels={scaleLabels} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function QuestionCard({ index, q, scaleLabels }: { index: number; q: Question; scaleLabels?: string[] }) {
  const isText = q.type === "text";
  const isChoice = q.type === "choice";
  return (
    <Card className="overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-4 p-5 border-b bg-card">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold font-mono text-sm">
          {index.toString().padStart(2, "0")}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-base leading-snug">{q.text}</h4>
        </div>
      </div>

      {/* Card body */}
      <div className="p-5">
        {!isText && q.distribution && (
          q.stats_by_leader && q.stats_by_leader.length > 0 ? (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full bg-muted/60 border">
                    Geral
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{q.total}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {q.scale_type === "enps" && q.enps
                  ? <EnpsView q={q} />
                  : <ScaleDistribution distribution={q.distribution} scaleLabels={isChoice ? undefined : scaleLabels} reverse={!isChoice} />}
              </div>
              {q.stats_by_leader.map((g) => (
                <div key={g.leader}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full bg-muted/60 border">
                      {g.leader}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{g.total}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  {q.scale_type === "enps" && g.enps
                    ? <EnpsView q={{ ...q, distribution: g.distribution, total: g.total, enps: g.enps }} />
                    : <ScaleDistribution distribution={g.distribution} scaleLabels={isChoice ? undefined : scaleLabels} reverse={!isChoice} />}
                </div>
              ))}
            </div>
          ) : q.scale_type === "enps" && q.enps ? (
            <EnpsView q={q} />
          ) : (
            <ScaleDistribution distribution={q.distribution} scaleLabels={isChoice ? undefined : scaleLabels} reverse={!isChoice} />
          )
        )}

        {isText && (
          <div className="space-y-5">
            {q.comments_by_leader && q.comments_by_leader.length > 0 ? (
              q.comments_by_leader.map((group) => (
                <div key={group.leader} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full bg-muted/60 border">
                      {group.leader}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {group.comments.length}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-2.5">
                    {group.comments.map((c, i) => (
                      <blockquote
                        key={i}
                        className="relative pl-4 pr-3 py-3 bg-muted/40 rounded-lg border-l-4 border-primary text-sm leading-relaxed whitespace-pre-wrap"
                      >
                        <span className="text-muted-foreground/60 absolute left-1.5 top-1 text-base leading-none">"</span>
                        {c}
                      </blockquote>
                    ))}
                  </div>
                </div>
              ))
            ) : q.comments && q.comments.length > 0 ? (
              q.comments.map((c, i) => (
                <blockquote
                  key={i}
                  className="relative pl-4 pr-3 py-3 bg-muted/40 rounded-lg border-l-4 border-primary text-sm leading-relaxed whitespace-pre-wrap"
                >
                  <span className="text-muted-foreground/60 absolute left-1.5 top-1 text-base leading-none">"</span>
                  {c}
                </blockquote>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-6">Sem comentários nesta categoria.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function ScaleDistribution({ distribution, scaleLabels, reverse = true }: { distribution: Distribution[]; scaleLabels?: string[]; reverse?: boolean }) {
  const items = reverse ? distribution.slice().reverse() : distribution;
  const getColor = (item: Distribution) => {
    if (!item.label) return SCORE_COLORS[item.value] ?? "hsl(var(--primary))";
    const normalized = item.label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normalized.includes("nao")) return "hsl(0 72% 55%)";
    if (normalized.includes("sim")) return "hsl(145 60% 42%)";
    if (normalized.includes("parte") || normalized.includes("talvez")) return "hsl(45 90% 55%)";
    return SCORE_COLORS[item.value] ?? "hsl(var(--primary))";
  };

  return (
    <div className="space-y-2.5">
      {items.map((d) => {
        const label = d.label ?? scaleLabels?.[d.value - 1];
        const color = getColor(d);
        return (
          <div key={d.value} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
            <div className="flex items-center gap-2 w-44">
              <div
                className="h-7 w-7 rounded-md flex items-center justify-center text-white font-bold font-mono text-xs shrink-0"
                style={{ backgroundColor: color }}
              >
                {d.value}
              </div>
              {label && (
                <span className="text-xs text-muted-foreground truncate" title={label}>
                  {label}
                </span>
              )}
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${d.percent}%`, backgroundColor: color }}
              />
            </div>
            <div className="flex items-baseline gap-1.5 tabular-nums w-24 justify-end">
              <span className="font-bold text-sm">{d.percent.toFixed(1)}%</span>
              <span className="text-xs text-muted-foreground">({d.count})</span>
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
    v >= 9 ? "hsl(145 60% 42%)" : v >= 7 ? "hsl(45 90% 55%)" : "hsl(0 72% 55%)";
  const scoreColor = e.score >= 50 ? "hsl(145 60% 42%)"
    : e.score >= 0 ? "hsl(45 90% 55%)"
    : "hsl(0 72% 55%)";
  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="flex items-center justify-between gap-6 rounded-xl border bg-muted/30 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Score eNPS</p>
          <p className="text-4xl font-bold font-display tabular-nums mt-1" style={{ color: scoreColor }}>
            {e.score > 0 ? `+${e.score}` : e.score}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Promotores − Detratores · {q.total} {q.total === 1 ? "resposta" : "respostas"}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Promotores</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: "hsl(145 60% 42%)" }}>{e.promoters_pct.toFixed(0)}%</p>
            <p className="text-[11px] text-muted-foreground">({e.promoters}) · 9–10</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Neutros</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: "hsl(45 90% 50%)" }}>{e.passives_pct.toFixed(0)}%</p>
            <p className="text-[11px] text-muted-foreground">({e.passives}) · 7–8</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Detratores</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: "hsl(0 72% 55%)" }}>{e.detractors_pct.toFixed(0)}%</p>
            <p className="text-[11px] text-muted-foreground">({e.detractors}) · 0–6</p>
          </div>
        </div>
      </div>

      {/* Distribution 0-10 */}
      <div className="space-y-2">
        {dist.slice().reverse().map((d) => {
          const color = colorFor(d.value);
          return (
            <div key={d.value} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
              <div className="flex items-center gap-2 w-16">
                <div
                  className="h-7 w-7 rounded-md flex items-center justify-center text-white font-bold font-mono text-xs shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {d.value}
                </div>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${d.percent}%`, backgroundColor: color }}
                />
              </div>
              <div className="flex items-baseline gap-1.5 tabular-nums w-24 justify-end">
                <span className="font-bold text-sm">{d.percent.toFixed(1)}%</span>
                <span className="text-xs text-muted-foreground">({d.count})</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
