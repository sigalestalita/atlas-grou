import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type Distribution = { value: number; count: number; percent: number };
type Question = {
  id: string;
  text: string;
  section_title: string;
  type: "scale" | "text";
  total: number;
  distribution?: Distribution[];
  comments?: string[];
};
type Category = { key: string; label: string; questions: Question[] };
type ReportData = {
  company: { name: string; logo_url?: string; primary_color: string; secondary_color: string };
  survey: { title: string; scale_min: number; scale_max: number };
  scale_labels?: string[];
  categories: Category[];
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function PublicReport() {
  const { slug } = useParams();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando relatório...</div>;
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;
  if (!data) return null;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="border-b"
        style={{ background: `linear-gradient(135deg, ${data.company.primary_color}, ${data.company.secondary_color})` }}
      >
        <div className="container mx-auto px-6 py-8 flex items-center gap-4">
          {data.company.logo_url && (
            <img src={data.company.logo_url} alt={data.company.name} className="h-14 bg-white/90 rounded p-2" />
          )}
          <div className="text-white">
            <h1 className="text-2xl md:text-3xl font-bold font-display">{data.survey.title}</h1>
            <p className="text-white/80 text-sm mt-1">Relatório de Entrega — {data.company.name}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-6 py-8">
        <Tabs defaultValue={data.categories[0]?.key}>
          <TabsList className="w-full flex flex-wrap h-auto justify-start">
            {data.categories.map((c) => (
              <TabsTrigger key={c.key} value={c.key} className="flex-grow md:flex-grow-0">
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {data.categories.map((c) => (
            <TabsContent key={c.key} value={c.key} className="space-y-6 mt-6">
              <CategoryView category={c} scaleMin={data.survey.scale_min} scaleMax={data.survey.scale_max} scaleLabels={data.scale_labels} />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}

function CategoryView({
  category,
  scaleLabels,
}: {
  category: Category;
  scaleMin: number;
  scaleMax: number;
  scaleLabels?: string[];
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, Question[]>();
    category.questions.forEach((q) => {
      if (!m.has(q.section_title)) m.set(q.section_title, []);
      m.get(q.section_title)!.push(q);
    });
    return Array.from(m.entries());
  }, [category]);

  if (category.questions.length === 0) {
    return <p className="text-muted-foreground text-center py-12">Sem perguntas nesta categoria.</p>;
  }

  let qIdx = 0;
  return (
    <div className="space-y-8">
      {grouped.map(([sectionTitle, qs]) => (
        <section key={sectionTitle} className="space-y-4">
          <h2 className="text-xl font-semibold font-display border-l-4 border-primary pl-3">{sectionTitle}</h2>
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
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base md:text-lg flex items-start gap-2">
          <span className="text-primary font-mono shrink-0">P{index}.</span>
          <span className="flex-1">{q.text}</span>
        </CardTitle>
        <Badge variant="secondary" className="w-fit">
          {q.total} {q.type === "text" ? "comentário(s)" : "resposta(s)"}
        </Badge>
      </CardHeader>
      <CardContent>
        {q.type === "scale" && q.distribution && (
          <div className="space-y-2">
            {q.distribution
              .slice()
              .reverse()
              .map((d) => {
                const label = scaleLabels?.[d.value - 1];
                return (
                  <div key={d.value} className="flex items-center gap-3 text-sm">
                    <div className="w-32 shrink-0 flex items-center gap-2">
                      <span className="font-mono font-semibold w-4">{d.value}</span>
                      {label && <span className="text-xs text-muted-foreground truncate">{label}</span>}
                    </div>
                    <div className="flex-1 h-7 bg-muted rounded overflow-hidden relative">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${d.percent}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                        {d.percent.toFixed(1)}% — {d.count}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        {q.type === "text" && (
          <div className="space-y-2">
            {q.comments && q.comments.length > 0 ? (
              q.comments.map((c, i) => (
                <div key={i} className="p-3 bg-muted/40 rounded border-l-2 border-primary text-sm whitespace-pre-wrap">
                  {c}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">Sem comentários.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
