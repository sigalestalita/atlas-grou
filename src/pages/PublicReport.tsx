import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquareQuote, BarChart3 } from "lucide-react";

type Distribution = { value: number; count: number; percent: number };
type Question = {
  id: string;
  text: string;
  section_title: string;
  type: "scale" | "text";
  total: number;
  raw_total?: number;
  respondent_count?: number;
  respondent_count_approx?: boolean;
  distribution?: Distribution[];
  comments?: string[];
};
type Category = { key: string; label: string; respondent_count?: number; respondent_count_approx?: boolean; questions: Question[] };
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
  const { slug } = useParams();
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
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header
        className="border-b shadow-sm"
        style={{ background: `linear-gradient(135deg, ${data.company.primary_color}, ${data.company.secondary_color})` }}
      >
        <div className="container mx-auto px-6 py-10 flex items-center gap-5">
          {data.company.logo_url && (
            <img
              src={data.company.logo_url}
              alt={data.company.name}
              className="h-16 bg-white/95 rounded-lg p-2 shadow-md"
            />
          )}
          <div className="text-white">
            <p className="text-white/70 text-xs uppercase tracking-widest font-semibold">Relatório de Entrega</p>
            <h1 className="text-2xl md:text-3xl font-bold font-display mt-1">{data.survey.title}</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
          {/* Sticky sidebar nav */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="bg-card border rounded-xl p-2 shadow-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
                Categorias
              </p>
              <nav className="flex flex-col gap-1">
                {data.categories.map((c) => {
                  const isActive = c.key === current.key;
                  const count = c.respondent_count ?? 0;
                  const approx = c.respondent_count_approx;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setActiveCategory(c.key)}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{c.label}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          isActive ? "bg-white/20" : "bg-muted text-muted-foreground"
                        }`}
                        title={approx ? `${count} sessões de submissão (inclui possíveis resubmissões)` : `${count} respondente${count === 1 ? "" : "s"}`}
                      >
                        {count}{approx ? "*" : ""}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            <CategoryView category={current} scaleLabels={data.scale_labels} />
          </main>
        </div>
      </div>
    </div>
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
  const approx = category.respondent_count_approx;

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
          <p
            className="text-3xl font-bold font-display tabular-nums"
            title={approx ? "Inclui possíveis resubmissões (sessões de submissão distintas)" : undefined}
          >
            {respondents}{approx && <span className="text-muted-foreground">*</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {respondents === 1 ? "respondente" : "respondentes"}
            {approx && <span title="Inclui possíveis resubmissões"> *</span>}
          </p>
        </div>
      </div>

      {grouped.map(([sectionTitle, qs]) => (
        <section key={sectionTitle} className="space-y-4">
          <div className="flex items-center gap-3 sticky top-0 bg-muted/30 backdrop-blur z-10 py-2">
            <div className="h-8 w-1 bg-primary rounded-full" />
            <h3 className="text-lg font-bold font-display">{sectionTitle}</h3>
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
  return (
    <Card className="overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-4 p-5 border-b bg-card">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold font-mono text-sm">
          {index.toString().padStart(2, "0")}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-base leading-snug">{q.text}</h4>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
            {isText ? <MessageSquareQuote className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
            {isText ? (
              <span>
                {q.total} {q.total === 1 ? "comentário único" : "comentários únicos"}
                {q.respondent_count !== undefined && (
                  <span className="text-muted-foreground/70"> · {q.respondent_count} {q.respondent_count === 1 ? "respondente" : "respondentes"}</span>
                )}
              </span>
            ) : (
              <span title={q.respondent_count_approx ? "Inclui possíveis resubmissões" : undefined}>
                {q.respondent_count ?? q.total}
                {q.respondent_count_approx && <span className="text-muted-foreground/70">*</span>}
                {" "}{(q.respondent_count ?? q.total) === 1 ? "respondente" : "respondentes"}
              </span>
            )}
            {isText && q.raw_total !== undefined && q.raw_total > q.total && (
              <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                {q.raw_total - q.total} duplicado{q.raw_total - q.total === 1 ? "" : "s"} removido{q.raw_total - q.total === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-5">
        {!isText && q.distribution && (
          <div className="space-y-2.5">
            {q.distribution
              .slice()
              .reverse()
              .map((d) => {
                const label = scaleLabels?.[d.value - 1];
                const color = SCORE_COLORS[d.value] ?? "hsl(var(--primary))";
                return (
                  <div key={d.value} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
                    {/* Score chip + label */}
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
                    {/* Bar */}
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${d.percent}%`, backgroundColor: color }}
                      />
                    </div>
                    {/* Stats */}
                    <div className="flex items-baseline gap-1.5 tabular-nums w-24 justify-end">
                      <span className="font-bold text-sm">{d.percent.toFixed(1)}%</span>
                      <span className="text-xs text-muted-foreground">({d.count})</span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {isText && (
          <div className="space-y-2.5">
            {q.comments && q.comments.length > 0 ? (
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
