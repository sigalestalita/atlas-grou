import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ReferenceLine,
} from "recharts";
import { BarChart3, Building2, Download, Gauge, Layers, Trophy, UsersRound } from "lucide-react";
import ExportReportDialog, { type ReportSection } from "@/components/ExportReportDialog";
import { PageHeader, EmptyState, PrivacyNote } from "@/components/PageHeader";
import { StatCard, ScoreRing } from "@/components/StatCard";
import { NEW_COLUMNS, selectCompat } from "@/lib/dbCompat";
import {
  MIN_GROUP, climateBand, countPeople, groupByWithPrivacy, round2,
  scoreColor, scoreFromAverage, truncate, type ResponseRow,
} from "@/lib/climate";

interface Company { id: string; name: string; primary_color: string }
interface Survey {
  id: string; title: string; company_id: string;
  scale_min: number; scale_max: number; status: string;
}

const SERIES = [
  "hsl(214 74% 38%)", "hsl(174 62% 34%)", "hsl(266 52% 52%)", "hsl(28 82% 46%)",
  "hsl(340 58% 48%)", "hsl(196 68% 40%)", "hsl(96 42% 38%)", "hsl(232 48% 52%)",
];

const CHART_TOOLTIP = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  fontSize: 12,
} as const;

/**
 * Visão da rede — o super admin olhando todas as empresas de uma vez.
 *
 * Herdava três erros de cálculo da versão anterior:
 *
 * 1. O corte de anonimato contava linhas de resposta, não pessoas, então um
 *    recorte com um respondente só aparecia normalmente.
 * 2. O score era `média ÷ máximo da escala`, ignorando o mínimo. Numa escala
 *    de 1 a 5, a pior avaliação possível marcava 20 em vez de 0, e nenhuma
 *    empresa jamais chegava perto do fundo.
 * 3. Perguntas de eNPS (0 a 10) entravam na mesma média das perguntas de 1 a 5
 *    e empurravam o resultado para cima.
 *
 * Agora tudo passa pela mesma biblioteca que o dashboard da empresa usa, então
 * um número visto aqui bate com o número visto lá.
 */
export default function PlatformAnalytics() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [surveyFilter, setSurveyFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [leaderFilter, setLeaderFilter] = useState("all");

  const [responses, setResponses] = useState<(ResponseRow & { survey_id: string })[]>([]);
  const [invited, setInvited] = useState({ total: 0, responded: 0 });
  const [questionSection, setQuestionSection] = useState<Map<string, string>>(new Map());
  const [enpsQuestions, setEnpsQuestions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: s }] = await Promise.all([
        supabase.from("companies").select("id, name, primary_color").order("name"),
        supabase.from("surveys").select("id, title, company_id, scale_min, scale_max, status")
          .in("status", ["active", "closed"]).order("created_at", { ascending: false }),
      ]);
      setCompanies(c || []);
      setSurveys((s || []) as Survey[]);
    })();
  }, []);

  const selectedSurveys = useMemo(() => {
    let list = surveys;
    if (companyFilter !== "all") list = list.filter((s) => s.company_id === companyFilter);
    if (surveyFilter !== "all") list = list.filter((s) => s.id === surveyFilter);
    return list;
  }, [surveys, companyFilter, surveyFilter]);

  useEffect(() => {
    if (!surveys.length) { setLoading(false); return; }
    const ids = selectedSurveys.map((s) => s.id);
    if (!ids.length) {
      setResponses([]); setInvited({ total: 0, responded: 0 });
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const [resp, people, secs] = await Promise.all([
        selectCompat<ResponseRow & { survey_id: string }>(
          ["survey_id", "question_id", "value", "text_value", "department",
           "company_leadership", "department_leadership", "evaluated_leader", "submitted_at"],
          [...NEW_COLUMNS.responses],
          (cols) => supabase.from("survey_responses").select(cols).in("survey_id", ids),
        ),
        supabase.from("respondents").select("status").in("survey_id", ids),
        supabase.from("survey_sections").select("id, title").in("survey_id", ids).order("sort_order"),
      ]);

      const sectionIds = (secs.data || []).map((s) => s.id);
      const { data: qs } = sectionIds.length
        ? await supabase.from("survey_questions")
            .select("id, section_id, question_type, scale_type")
            .in("section_id", sectionIds)
        : { data: [] as any[] };

      if (cancelled) return;

      const titleById = new Map((secs.data || []).map((s) => [s.id, s.title]));
      const qSection = new Map<string, string>();
      const enps = new Set<string>();
      for (const q of qs || []) {
        if (q.question_type !== "scale") continue;
        if (q.scale_type === "enps") { enps.add(q.id); continue; }
        qSection.set(q.id, titleById.get(q.section_id) ?? "");
      }

      setQuestionSection(qSection);
      setEnpsQuestions(enps);
      setResponses((resp.data || []) as (ResponseRow & { survey_id: string })[]);
      setInvited({
        total: people.data?.length ?? 0,
        responded: people.data?.filter((r) => r.status === "responded").length ?? 0,
      });
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [selectedSurveys, surveys.length]);

  /** Escala comum aos filtros atuais; se misturar escalas, usa a mais frequente. */
  const scale = useMemo(() => {
    if (!selectedSurveys.length) return { min: 1, max: 5 };
    const counts = new Map<string, { min: number; max: number; n: number }>();
    for (const s of selectedSurveys) {
      const key = `${s.scale_min}-${s.scale_max}`;
      const cur = counts.get(key) ?? { min: s.scale_min, max: s.scale_max, n: 0 };
      cur.n++;
      counts.set(key, cur);
    }
    return Array.from(counts.values()).sort((a, b) => b.n - a.n)[0];
  }, [selectedSurveys]);

  /** Só perguntas de escala comum — eNPS fica de fora da média. */
  const scored = useMemo(
    () => responses.filter((r) => r.value != null && questionSection.has(r.question_id)),
    [responses, questionSection],
  );

  const filtered = useMemo(() => {
    let list = scored;
    if (deptFilter !== "all") list = list.filter((r) => r.department === deptFilter);
    if (leaderFilter !== "all") list = list.filter((r) => r.evaluated_leader === leaderFilter);
    return list;
  }, [scored, deptFilter, leaderFilter]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of scored) if (r.department) set.add(r.department);
    return Array.from(set).sort();
  }, [scored]);

  const leaders = useMemo(() => {
    const set = new Set<string>();
    for (const r of scored) if (r.evaluated_leader) set.add(r.evaluated_leader);
    return Array.from(set).sort();
  }, [scored]);

  const overall = useMemo(() => {
    const vals = filtered.map((r) => r.value!);
    if (!vals.length) return { avg: 0, score: 0, people: 0 };
    const avg = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
    return { avg, score: scoreFromAverage(avg, scale.min, scale.max), people: countPeople(filtered) };
  }, [filtered, scale]);

  const surveyCompany = useMemo(
    () => new Map(surveys.map((s) => [s.id, s.company_id])),
    [surveys],
  );
  const companyName = useMemo(
    () => new Map(companies.map((c) => [c.id, c.name])),
    [companies],
  );

  const byCompany = useMemo(
    () => groupByWithPrivacy(
      filtered,
      (r) => companyName.get(surveyCompany.get((r as any).survey_id) ?? "") ?? null,
      scale.min, scale.max,
    ),
    [filtered, surveyCompany, companyName, scale],
  );

  const byDepartment = useMemo(
    () => groupByWithPrivacy(filtered, (r) => r.department, scale.min, scale.max),
    [filtered, scale],
  );

  const byLeader = useMemo(
    () => groupByWithPrivacy(filtered, (r) => r.evaluated_leader, scale.min, scale.max),
    [filtered, scale],
  );

  const bySection = useMemo(
    () => groupByWithPrivacy(filtered, (r) => questionSection.get(r.question_id) ?? null, scale.min, scale.max),
    [filtered, questionSection, scale],
  );

  /** Comparativo liderança × categoria, para o radar e a barra agrupada. */
  const leaderBySection = useMemo(() => {
    if (!byLeader.groups.length) return [];
    const perLeader = new Map<string, Map<string, number[]>>();
    for (const r of filtered) {
      const leader = r.evaluated_leader;
      const section = questionSection.get(r.question_id);
      if (!leader || !section || r.value == null) continue;
      const m = perLeader.get(leader) ?? perLeader.set(leader, new Map()).get(leader)!;
      (m.get(section) ?? m.set(section, []).get(section)!).push(r.value);
    }
    const sections = Array.from(new Set(bySection.groups.map((g) => g.name)));
    return sections.map((section) => {
      const row: Record<string, string | number> = { section: truncate(section, 22) };
      for (const l of byLeader.groups) {
        const vals = perLeader.get(l.name)?.get(section) ?? [];
        row[l.name] = vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      }
      return row;
    });
  }, [filtered, byLeader.groups, bySection.groups, questionSection]);

  const responseRate = invited.total ? Math.round((invited.responded / invited.total) * 100) : 0;
  const band = climateBand(overall.score);

  const buildReport = (): ReportSection[] => {
    const out: ReportSection[] = [{
      key: "kpis", label: "Visão da rede", description: "Números consolidados das empresas no filtro",
      data: {
        headers: ["Indicador", "Valor"],
        rows: [
          ["Empresas", byCompany.groups.length],
          ["Pesquisas", selectedSurveys.length],
          ["Pessoas que responderam", overall.people],
          ["Score de clima", overall.score],
          ["Leitura", band.label],
          ["Taxa de resposta", `${responseRate}%`],
        ],
      },
    }];
    const table = (key: string, label: string, description: string, groups: typeof byCompany.groups, head: string) => {
      if (!groups.length) return;
      out.push({
        key, label, description,
        data: { headers: [head, "Média", "Score", "Pessoas"], rows: groups.map((g) => [g.name, g.avg, g.score, g.people]) },
      });
    };
    table("companies", "Por empresa", "Comparativo entre empresas", byCompany.groups, "Empresa");
    table("leaders", "Por liderança", `Lideranças avaliadas por ao menos ${MIN_GROUP} pessoas`, byLeader.groups, "Líder");
    table("departments", "Por área", `Áreas com ao menos ${MIN_GROUP} pessoas`, byDepartment.groups, "Área");
    table("sections", "Por categoria", "Média de cada categoria", bySection.groups, "Categoria");
    return out;
  };

  if (loading && !companies.length) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-[22px]" />)}
        </div>
      </div>
    );
  }

  const filtersRow = (
    <div className="mb-6 flex flex-wrap gap-2">
      <Select value={companyFilter} onValueChange={(v) => { setCompanyFilter(v); setSurveyFilter("all"); }}>
        <SelectTrigger className="h-9 w-56 rounded-xl"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as empresas</SelectItem>
          {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={surveyFilter} onValueChange={setSurveyFilter}>
        <SelectTrigger className="h-9 w-64 rounded-xl"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as pesquisas</SelectItem>
          {surveys
            .filter((s) => companyFilter === "all" || s.company_id === companyFilter)
            .map((s) => <SelectItem key={s.id} value={s.id}>{truncate(s.title, 46)}</SelectItem>)}
        </SelectContent>
      </Select>

      {departments.length > 0 && (
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-9 w-48 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {leaders.length > 0 && (
        <Select value={leaderFilter} onValueChange={setLeaderFilter}>
          <SelectTrigger className="h-9 w-52 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as lideranças</SelectItem>
            {leaders.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Analítico da rede"
        description="Compara empresas, lideranças e categorias entre todas as pesquisas da plataforma."
        actions={
          <Button variant="outline" className="h-9 rounded-xl" onClick={() => setShowExport(true)} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" />Exportar
          </Button>
        }
      />

      <ExportReportDialog
        open={showExport}
        onOpenChange={setShowExport}
        companyName={companyFilter === "all" ? "Plataforma" : companyName.get(companyFilter) ?? "Empresa"}
        surveyTitle="Analítico da rede"
        sections={buildReport()}
        branding={{ primary: "#15498D", secondary: "#071A34" }}
      />

      {filtersRow}

      {!filtered.length ? (
        <EmptyState
          icon={BarChart3}
          title="Sem dados para esses filtros"
          description="Nenhuma resposta de escala encontrada. Tente ampliar a seleção."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-[300px_1fr]">
            <Card className="rounded-[22px]">
              <CardContent className="flex flex-col items-center py-7">
                <ScoreRing score={overall.score} color={band.color} label="de 100" />
                <Badge
                  className="mt-4 rounded-full border-0 px-3 py-1 text-[12px] font-semibold text-white"
                  style={{ backgroundColor: band.color }}
                >
                  {band.label}
                </Badge>
                <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
                  Média {overall.avg} de {scale.max}
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard tone="navy" icon={Building2} label="Empresas no recorte"
                value={byCompany.groups.length || 1}
                hint={`${selectedSurveys.length} ${selectedSurveys.length === 1 ? "pesquisa" : "pesquisas"}`} />
              <StatCard tone="teal" icon={UsersRound} label="Pessoas que responderam" value={overall.people} />
              <StatCard tone="sky" icon={Gauge} label="Taxa de resposta"
                value={invited.total ? `${responseRate}%` : "—"}
                hint={invited.total ? `${invited.responded} de ${invited.total} convidados` : "Só pesquisas com link aberto"} />
              <StatCard tone="amber" icon={Layers} label="Categorias" value={bySection.groups.length} />
              <StatCard tone="slate" icon={Trophy} label="Melhor categoria"
                value={bySection.groups[0]?.avg ?? "—"}
                hint={bySection.groups[0] ? truncate(bySection.groups[0].name, 40) : undefined} />
              <StatCard tone="coral" icon={BarChart3} label="Categoria mais frágil"
                value={bySection.groups.at(-1)?.avg ?? "—"}
                hint={bySection.groups.at(-1) ? truncate(bySection.groups.at(-1)!.name, 40) : undefined} />
            </div>
          </div>

          <Tabs defaultValue="companies">
            <TabsList className="mb-5 h-auto flex-wrap gap-1 rounded-xl bg-secondary p-1">
              <TabsTrigger value="companies" className="rounded-lg">Empresas</TabsTrigger>
              {byLeader.groups.length > 0 && <TabsTrigger value="leaders" className="rounded-lg">Lideranças</TabsTrigger>}
              {byDepartment.groups.length > 0 && <TabsTrigger value="areas" className="rounded-lg">Áreas</TabsTrigger>}
              {bySection.groups.length > 0 && <TabsTrigger value="sections" className="rounded-lg">Categorias</TabsTrigger>}
            </TabsList>

            <TabsContent value="companies">
              <RankingCard
                title="Clima por empresa"
                description="A linha tracejada marca a média da rede — é ela que diz se a empresa está acima ou abaixo do conjunto."
                groups={byCompany.groups}
                suppressed={byCompany.suppressed}
                scale={scale}
                reference={overall.avg}
              />
            </TabsContent>

            <TabsContent value="leaders" className="space-y-5">
              <RankingCard
                title="Ranking de lideranças"
                description={`Lideranças avaliadas por ao menos ${MIN_GROUP} pessoas, de todas as empresas do recorte.`}
                groups={byLeader.groups}
                suppressed={byLeader.suppressed}
                scale={scale}
                reference={overall.avg}
              />

              {byLeader.groups.length > 1 && leaderBySection.length > 2 && (
                <Card className="rounded-[22px]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Perfil por categoria</CardTitle>
                    <CardDescription>O formato de cada liderança, categoria a categoria.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={420}>
                      <RadarChart data={leaderBySection} outerRadius="72%">
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="section" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <PolarRadiusAxis domain={[scale.min, scale.max]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        {byLeader.groups.slice(0, 8).map((l, i) => (
                          <Radar
                            key={l.name} name={l.name} dataKey={l.name}
                            stroke={SERIES[i % SERIES.length]} fill={SERIES[i % SERIES.length]}
                            fillOpacity={0.1} strokeWidth={2}
                          />
                        ))}
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Tooltip contentStyle={CHART_TOOLTIP} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="areas">
              <RankingCard
                title="Clima por área"
                description={`Áreas com ao menos ${MIN_GROUP} pessoas, somadas entre as empresas do recorte.`}
                groups={byDepartment.groups}
                suppressed={byDepartment.suppressed}
                scale={scale}
                reference={overall.avg}
              />
            </TabsContent>

            <TabsContent value="sections">
              <RankingCard
                title="Clima por categoria"
                description="Onde a rede inteira vai bem e onde vai mal — serve para calibrar o questionário."
                groups={bySection.groups}
                suppressed={bySection.suppressed}
                scale={scale}
                reference={overall.avg}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  );
}

function RankingCard({
  title, description, groups, suppressed, scale, reference,
}: {
  title: string;
  description: string;
  groups: { name: string; avg: number; score: number; people: number }[];
  suppressed: number;
  scale: { min: number; max: number };
  reference: number;
}) {
  return (
    <Card className="rounded-[22px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum grupo com pessoas suficientes para mostrar.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, groups.length * 44)}>
            <BarChart data={groups} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis
                type="number" domain={[scale.min, scale.max]}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
              />
              <YAxis
                type="category" dataKey="name" width={170}
                tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} tickLine={false} axisLine={false}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP}
                formatter={(v: number, _n, p: any) => [`${v} · ${p.payload.people} pessoas`, "média"]}
              />
              <ReferenceLine
                x={reference} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4"
                label={{ value: "média da rede", position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Bar dataKey="avg" radius={[0, 8, 8, 0]} barSize={20}>
                {groups.map((g) => <Cell key={g.name} fill={scoreColor(g.score)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <PrivacyNote suppressed={suppressed} minGroup={MIN_GROUP} />
      </CardContent>
    </Card>
  );
}
