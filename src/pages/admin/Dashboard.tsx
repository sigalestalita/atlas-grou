import { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, AreaChart, Area,
} from "recharts";
import {
  AlertTriangle, CheckCircle2, Download, Filter, Gauge, MessageSquareQuote,
  Sparkles, TrendingUp, Trophy, Users, UsersRound, Split, Info, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import ExportReportDialog, { type ReportSection } from "@/components/ExportReportDialog";
import { PageHeader, EmptyState, PrivacyNote } from "@/components/PageHeader";
import { StatCard, ScoreRing } from "@/components/StatCard";
import { useSurveyAnalytics, MIN_GROUP } from "@/lib/useSurveyAnalytics";
import { climateBand, enpsBand, scoreColor, truncate } from "@/lib/climate";

interface ContextType {
  company: { id: string; name: string; primary_color: string };
}

/** Série de cores para distinguir lideranças lado a lado. Parte do azul da marca. */
const SERIES = [
  "hsl(214 74% 38%)", "hsl(174 62% 34%)", "hsl(266 52% 52%)", "hsl(28 82% 46%)",
  "hsl(340 58% 48%)", "hsl(196 68% 40%)", "hsl(96 42% 38%)", "hsl(232 48% 52%)",
];

export default function Dashboard() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [leaderFilter, setLeaderFilter] = useState("all");
  const [showExport, setShowExport] = useState(false);
  // Vazio = a mais recente. Trocar aqui abre uma rodada anterior.
  const [surveyId, setSurveyId] = useState<string>("");

  const a = useSurveyAnalytics(companyId, { leaderFilter, surveyId: surveyId || undefined });

  const band = climateBand(a.overallScore);
  const scaleMax = a.survey?.scale_max ?? 5;
  const scaleMin = a.survey?.scale_min ?? 1;

  const ranked = useMemo(
    () => [...a.questionStats].sort((x, y) => x.avg - y.avg),
    [a.questionStats],
  );
  const weak = ranked.slice(0, 3);
  const strong = ranked.slice(-3).reverse();

  /**
   * Perguntas em que o time está rachado: média morna mas pouca concordância.
   * É a leitura que a média sozinha escondia — 3,0 de "todo mundo achou
   * regular" pede uma ação bem diferente de 3,0 de "metade amou, metade odiou".
   */
  const divided = useMemo(
    () => a.questionStats.filter((q) => q.consensus < 55 && q.people >= MIN_GROUP)
      .sort((x, y) => x.consensus - y.consensus).slice(0, 4),
    [a.questionStats],
  );

  const radarData = useMemo(() => {
    if (!a.leaders.length || !a.questionStats.length) return [];
    return a.questionStats.slice(0, 8).map((q) => {
      const row: Record<string, string | number> = { question: truncate(q.text, 26) };
      for (const l of a.leaders) row[l.name] = l.byQuestion.get(q.id) ?? 0;
      return row;
    });
  }, [a.leaders, a.questionStats]);

  const comparisonData = useMemo(() => {
    if (!a.leaders.length) return [];
    return a.questionStats.map((q) => {
      const row: Record<string, string | number> = { name: q.short };
      for (const l of a.leaders) row[l.name] = l.byQuestion.get(q.id) ?? 0;
      return row;
    });
  }, [a.leaders, a.questionStats]);

  const buildReportSections = (): ReportSection[] => {
    const out: ReportSection[] = [];
    out.push({
      key: "kpis", label: "Indicadores gerais", description: "Score de clima, participação e totais",
      data: {
        headers: ["Indicador", "Valor"],
        rows: [
          ["Score de clima (0–100)", a.overallScore],
          ["Leitura", band.label],
          ["Média na escala", `${a.overallAvg} de ${scaleMax}`],
          ["Pessoas que responderam", a.people],
          ...(a.survey?.open_access ? [] : [
            ["Convidados", a.invited] as (string | number)[],
            ["Taxa de resposta", `${a.responseRate}%`] as (string | number)[],
            ["Pendentes", a.invited - a.responded] as (string | number)[],
          ]),
          ...(a.enps ? [
            ["eNPS", a.enps.score] as (string | number)[],
            ["Promotores", `${a.enps.promoters} (${a.enps.promoterPct}%)`] as (string | number)[],
            ["Neutros", `${a.enps.passives} (${a.enps.passivePct}%)`] as (string | number)[],
            ["Detratores", `${a.enps.detractors} (${a.enps.detractorPct}%)`] as (string | number)[],
          ] : []),
        ],
      },
    });
    if (a.questionStats.length) {
      out.push({
        key: "questions", label: "Resultado por pergunta",
        description: "Média, score, concordância e quantas pessoas responderam",
        data: {
          headers: ["Pergunta", "Categoria", "Média", "Score", "Concordância", "Pessoas"],
          rows: a.questionStats.map((q) => [q.text, q.section, q.avg, q.score, `${q.consensus}%`, q.people]),
        },
      });
      out.push({
        key: "questions_distribution", label: "Distribuição de notas",
        description: `Quantas respostas em cada nota (${scaleMin} a ${scaleMax})`,
        data: {
          headers: ["Pergunta", "Respostas", ...Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => `Nota ${scaleMin + i}`), "Média"],
          rows: a.questionStats.map((q) => [q.text, q.answers, ...q.dist, q.avg]),
        },
      });
    }
    if (a.departments.groups.length) {
      out.push({
        key: "departments", label: "Resultado por área",
        description: `Áreas com pelo menos ${MIN_GROUP} pessoas`,
        data: {
          headers: ["Área", "Média", "Score", "Pessoas"],
          rows: a.departments.groups.map((d) => [d.name, d.avg, d.score, d.people]),
        },
      });
    }
    if (a.leaders.length) {
      out.push({
        key: "leaders_overview", label: "Visão geral por liderança",
        description: `Lideranças avaliadas por pelo menos ${MIN_GROUP} pessoas`,
        data: {
          headers: ["Líder", "Média", "Score", "Pessoas", "Destaque", "Ponto de atenção"],
          rows: a.leaders.map((l) => [
            l.name, l.avg, l.score, l.people,
            l.strengths[0] ? `${l.strengths[0].text} (${l.strengths[0].avg})` : "—",
            l.weaknesses[0] ? `${l.weaknesses[0].text} (${l.weaknesses[0].avg})` : "—",
          ]),
        },
      });
      for (const l of a.leaders) {
        out.push({
          key: `leader_${l.name}`, label: `Detalhamento: ${l.name}`,
          description: `Resultado por pergunta para ${l.name}`,
          data: {
            headers: ["Pergunta", "Categoria", "Média"],
            rows: a.questionStats
              .filter((q) => l.byQuestion.has(q.id))
              .map((q) => [q.text, q.section, l.byQuestion.get(q.id)!]),
          },
        });
      }
    }
    if (a.textAnswers.length) {
      out.push({
        key: "open_text", label: "Respostas abertas",
        description: "Comentários e justificativas, sem identificação",
        data: {
          headers: ["Pergunta", "Comentário", "Nota", "Área"],
          rows: a.textAnswers.map((t) => [t.question, t.text, t.value ?? "—", t.department ?? "—"]),
        },
      });
    }
    if (strong.length || weak.length) {
      out.push({
        key: "insights", label: "Pontos fortes e de atenção",
        description: "Os três melhores e os três piores resultados",
        data: {
          headers: ["Tipo", "Pergunta", "Média"],
          rows: [
            ...strong.map((q) => ["Ponto forte", q.text, q.avg] as (string | number)[]),
            ...weak.map((q) => ["Atenção", q.text, q.avg] as (string | number)[]),
          ],
        },
      });
    }
    return out;
  };

  // ── Estados de carga e vazio ──────────────────────────────────────────────
  if (a.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-[22px]" />)}
        </div>
        <Skeleton className="h-80 rounded-[22px]" />
      </div>
    );
  }

  if (a.error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar os resultados"
        description={a.error}
        action={<Button onClick={a.reload}>Tentar de novo</Button>}
      />
    );
  }

  if (!a.survey) {
    return (
      <EmptyState
        icon={Gauge}
        title="Nenhuma pesquisa ativa"
        description="Assim que uma pesquisa for ativada, o resultado aparece aqui — score de clima, leitura por área e por liderança."
      />
    );
  }

  if (a.people === 0) {
    return (
      <>
        <PageHeader
          title={a.survey.title}
          description="Nenhuma resposta nesta pesquisa ainda."
          actions={
            a.availableSurveys.length > 1 ? (
              <Select value={surveyId || a.survey.id} onValueChange={setSurveyId}>
                <SelectTrigger className="h-9 w-64 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {a.availableSurveys.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {truncate(s.wave_label ? `${s.title} · ${s.wave_label}` : s.title, 44)}
                      {s.status === "closed" ? " (encerrada)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : undefined
          }
        />
        <EmptyState
          icon={Users}
          title="Ainda sem respostas"
          description={
            a.availableSurveys.length > 1
              ? "Esta empresa tem outras pesquisas — troque no seletor acima para ver os resultados delas."
              : a.survey.open_access
                ? "Compartilhe o link aberto da pesquisa para começar a receber respostas."
                : `${a.invited} ${a.invited === 1 ? "pessoa foi convidada" : "pessoas foram convidadas"}. Os links individuais estão na aba Links.`}
        />
      </>
    );
  }

  const leaderOptions = a.survey.leaders.filter((l) => !l.hidden).map((l) => l.name);

  return (
    <>
      <PageHeader
        title={a.survey.title}
        description={
          <>
            {a.people} {a.people === 1 ? "pessoa respondeu" : "pessoas responderam"}
            {!a.survey.open_access && a.invited > 0 && ` de ${a.invited} convidadas`}
            {a.survey.wave_label && ` · rodada ${a.survey.wave_label}`}
            {a.survey.status === "closed" && " · pesquisa encerrada"}
          </>
        }
        actions={
          <>
            {a.availableSurveys.length > 1 && (
              <Select value={surveyId || a.survey.id} onValueChange={(v) => { setSurveyId(v); setLeaderFilter("all"); }}>
                <SelectTrigger className="h-9 w-64 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {a.availableSurveys.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {truncate(s.wave_label ? `${s.title} · ${s.wave_label}` : s.title, 44)}
                      {s.status === "closed" ? " (encerrada)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {leaderOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={leaderFilter} onValueChange={setLeaderFilter}>
                  <SelectTrigger className="h-9 w-56 rounded-xl">
                    <SelectValue placeholder="Todas as lideranças" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as lideranças</SelectItem>
                    {leaderOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" className="h-9 rounded-xl" onClick={() => setShowExport(true)}>
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </>
        }
      />

      <ExportReportDialog
        open={showExport}
        onOpenChange={setShowExport}
        companyName={a.company?.name || context?.company?.name || "Empresa"}
        surveyTitle={a.survey.title}
        sections={buildReportSections()}
        branding={{
          primary: a.company?.primary_color || "#15498D",
          secondary: a.company?.secondary_color || "#071A34",
          logoUrl: a.company?.logo_url || undefined,
        }}
      />

      {leaderFilter !== "all" && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-accent/60 px-4 py-2.5 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>Mostrando apenas as avaliações sobre <strong>{leaderFilter}</strong>.</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setLeaderFilter("all")}>
            Limpar
          </Button>
        </div>
      )}

      {/* ── Retrato de capa ── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="rounded-[22px]">
          <CardContent className="flex flex-col items-center py-7">
            <ScoreRing score={a.overallScore} color={band.color} label="de 100" />
            <div className="mt-4 text-center">
              <Badge
                className="rounded-full border-0 px-3 py-1 text-[12px] font-semibold text-white"
                style={{ backgroundColor: band.color }}
              >
                {band.label}
              </Badge>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{band.meaning}</p>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Média {a.overallAvg} numa escala de {scaleMin} a {scaleMax}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {a.survey.open_access ? (
            <StatCard
              tone="navy" icon={UsersRound} label="Pessoas que responderam"
              value={a.people} hint="Pesquisa por link aberto, sem lista de convidados"
            />
          ) : (
            <StatCard
              tone="navy" icon={UsersRound} label="Participação"
              value={`${a.responseRate}%`}
              hint={`${a.responded} de ${a.invited} · ${a.invited - a.responded} pendentes`}
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white/90 transition-all duration-700" style={{ width: `${a.responseRate}%` }} />
              </div>
            </StatCard>
          )}

          {a.enps ? (
            <StatCard
              tone="teal" icon={Sparkles} label="eNPS"
              value={a.enps.score > 0 ? `+${a.enps.score}` : a.enps.score}
              hint={`${enpsBand(a.enps.score).label} · ${a.enps.promoterPct}% promotores, ${a.enps.detractorPct}% detratores`}
            >
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-white/90" style={{ width: `${a.enps.promoterPct}%` }} />
                <div className="h-full bg-white/50" style={{ width: `${a.enps.passivePct}%` }} />
                <div className="h-full bg-white/25" style={{ width: `${a.enps.detractorPct}%` }} />
              </div>
            </StatCard>
          ) : (
            <StatCard
              tone="teal" icon={CheckCircle2} label="Perguntas analisadas"
              value={a.questionStats.length}
              hint={`${a.sections.length} ${a.sections.length === 1 ? "categoria" : "categorias"}`}
            />
          )}

          <StatCard
            tone="sky" icon={Trophy} label="Melhor resultado"
            value={strong[0]?.avg ?? "—"}
            hint={strong[0] ? truncate(strong[0].text, 58) : "Sem dados"}
          />
          <StatCard
            tone="coral" icon={AlertTriangle} label="Ponto de atenção"
            value={weak[0]?.avg ?? "—"}
            hint={weak[0] ? truncate(weak[0].text, 58) : "Sem dados"}
          />
        </div>
      </div>

      {/* ── Análise ── */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-5 h-auto flex-wrap gap-1 rounded-xl bg-secondary p-1">
          <TabsTrigger value="overview" className="rounded-lg">Visão geral</TabsTrigger>
          <TabsTrigger value="questions" className="rounded-lg">Perguntas</TabsTrigger>
          {a.departments.groups.length > 0 && <TabsTrigger value="areas" className="rounded-lg">Áreas</TabsTrigger>}
          {a.leaders.length > 0 && <TabsTrigger value="leaders" className="rounded-lg">Lideranças</TabsTrigger>}
          {a.textAnswers.length > 0 && (
            <TabsTrigger value="text" className="rounded-lg">
              Comentários
              <span className="ml-1.5 rounded-full bg-background px-1.5 text-[10.5px] font-semibold">
                {a.textAnswers.length}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Visão geral */}
        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-[22px]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-[hsl(var(--climate-good))]" />
                  O que está sustentando o clima
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {strong.map((q) => (
                  <InsightRow key={q.id} question={q.text} avg={q.avg} section={q.section} max={scaleMax} min={scaleMin} />
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[22px]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--climate-low))]" />
                  Onde agir primeiro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {weak.map((q) => (
                  <InsightRow key={q.id} question={q.text} avg={q.avg} section={q.section} max={scaleMax} min={scaleMin} />
                ))}
              </CardContent>
            </Card>
          </div>

          {divided.length > 0 && (
            <Card className="rounded-[22px] border-[hsl(var(--climate-mid)/0.35)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Split className="h-4 w-4 text-[hsl(var(--climate-mid))]" />
                  Temas que dividem o time
                </CardTitle>
                <CardDescription>
                  A média aqui engana: em vez de todo mundo achar "mais ou menos", há gente nos
                  dois extremos. Vale investigar por área antes de agir no geral.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {divided.map((q) => (
                  <div key={q.id} className="rounded-xl border border-border bg-card p-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm leading-snug">{q.text}</p>
                      <Badge variant="outline" className="shrink-0 rounded-full text-[11px]">
                        média {q.avg}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex flex-1 gap-0.5">
                        {q.dist.map((n, i) => {
                          const pct = q.answers ? (n / q.answers) * 100 : 0;
                          const nota = scaleMin + i;
                          return (
                            <UiTooltip key={i}>
                              <TooltipTrigger asChild>
                                <div
                                  className="h-7 flex-1 rounded-[4px] transition-opacity hover:opacity-80"
                                  style={{
                                    backgroundColor: scoreColor(((nota - scaleMin) / (scaleMax - scaleMin)) * 100),
                                    opacity: n === 0 ? 0.12 : 0.35 + (pct / 100) * 0.65,
                                  }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                Nota {nota}: {n} {n === 1 ? "resposta" : "respostas"} ({Math.round(pct)}%)
                              </TooltipContent>
                            </UiTooltip>
                          );
                        })}
                      </div>
                      <span className="w-28 shrink-0 text-right text-[11px] text-muted-foreground">
                        {q.consensus}% de acordo
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {a.timeline.length > 1 && (
            <Card className="rounded-[22px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quando as respostas chegaram</CardTitle>
                <CardDescription>
                  Serve para saber quando disparar lembrete: a curva costuma cair depois do segundo dia.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={a.timeline} margin={{ left: -18, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="fillResponses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={false}
                      tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP}
                      labelFormatter={(d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                      formatter={(v: number) => [v, "envios"]}
                    />
                    <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#fillResponses)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Perguntas */}
        <TabsContent value="questions">
          <Card className="rounded-[22px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resultado por pergunta</CardTitle>
              <CardDescription>
                Ordenado da pior para a melhor média. A barra fina mostra como as notas se espalharam.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {ranked.map((q) => (
                <div key={q.id} className="group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{q.text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{q.section}</span>
                      <span>·</span>
                      <span>{q.people} {q.people === 1 ? "pessoa" : "pessoas"}</span>
                      <span>·</span>
                      <span>{q.consensus}% de acordo</span>
                    </div>
                    <div className="mt-2 flex gap-0.5">
                      {q.dist.map((n, i) => {
                        const nota = scaleMin + i;
                        const pct = q.answers ? (n / q.answers) * 100 : 0;
                        return (
                          <UiTooltip key={i}>
                            <TooltipTrigger asChild>
                              <div
                                className="h-1.5 rounded-full"
                                style={{
                                  width: `${Math.max(pct, 1.5)}%`,
                                  minWidth: 4,
                                  backgroundColor: scoreColor(((nota - scaleMin) / (scaleMax - scaleMin)) * 100),
                                  opacity: n === 0 ? 0.15 : 1,
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>Nota {nota}: {n} ({Math.round(pct)}%)</TooltipContent>
                          </UiTooltip>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden w-28 sm:block">
                      <Progress value={q.score} className="h-2" />
                    </div>
                    <span
                      className="w-11 text-right text-[17px] font-bold tabular-nums"
                      style={{ color: scoreColor(q.score) }}
                    >
                      {q.avg}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Áreas */}
        {a.departments.groups.length > 0 && (
          <TabsContent value="areas">
            <Card className="rounded-[22px]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Clima por área</CardTitle>
                <CardDescription>
                  Cada área com pelo menos {MIN_GROUP} pessoas. A linha marca a média da empresa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(240, a.departments.groups.length * 46)}>
                  <BarChart data={a.departments.groups} layout="vertical" margin={{ left: 8, right: 44 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" domain={[scaleMin, scaleMax]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP}
                      formatter={(v: number, _n, p: any) => [`${v} · ${p.payload.people} pessoas`, "média"]}
                    />
                    <Bar dataKey="avg" radius={[0, 8, 8, 0]} barSize={22}>
                      {a.departments.groups.map((d) => <Cell key={d.name} fill={scoreColor(d.score)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <PrivacyNote suppressed={a.departments.suppressed} minGroup={MIN_GROUP} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Lideranças */}
        {a.leaders.length > 0 && (
          <TabsContent value="leaders" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-stagger">
              {a.leaders.map((l, i) => (
                <Card key={l.name} className="rounded-[22px] card-hover-glow">
                  <CardContent className="space-y-3.5 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                        <span className="truncate text-[14.5px] font-semibold">{l.name}</span>
                      </div>
                      <span className="shrink-0 text-[20px] font-bold tabular-nums" style={{ color: scoreColor(l.score) }}>
                        {l.score}
                      </span>
                    </div>

                    <div>
                      <Progress value={l.score} className="h-2" />
                      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                        <span>média {l.avg} de {scaleMax}</span>
                        <span>{l.people} {l.people === 1 ? "pessoa" : "pessoas"}</span>
                      </div>
                    </div>

                    {l.strengths[0] && (
                      <div className="border-t border-border pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--climate-good))]">Destaque</p>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                          {truncate(l.strengths[0].text, 76)} <strong className="text-foreground">{l.strengths[0].avg}</strong>
                        </p>
                      </div>
                    )}
                    {l.weaknesses[0] && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--climate-low))]">Atenção</p>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                          {truncate(l.weaknesses[0].text, 76)} <strong className="text-foreground">{l.weaknesses[0].avg}</strong>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <PrivacyNote suppressed={a.leadersSuppressed} minGroup={MIN_GROUP} />

            {/* Heatmap seção × liderança */}
            {a.sectionsBySide.length > 0 && a.leaders.length > 1 && (
              <Card className="rounded-[22px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Mapa de calor por categoria</CardTitle>
                  <CardDescription>
                    Onde cada liderança é forte e onde escorrega. Lido na horizontal compara
                    lideranças; na vertical, mostra se o problema é de uma pessoa ou da empresa.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-separate border-spacing-1">
                    <thead>
                      <tr>
                        <th className="w-44 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" />
                        {a.leaders.map((l) => (
                          <th key={l.name} className="px-1 pb-2 text-center text-[11px] font-medium text-muted-foreground">
                            <span className="block truncate" title={l.name}>{truncate(l.name, 14)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {a.sectionsBySide.map((row) => (
                        <tr key={row.section}>
                          <td className="pr-2 text-[12px] font-medium leading-tight">{row.section}</td>
                          {a.leaders.map((l) => {
                            const v = row.values[l.name];
                            return (
                              <td key={l.name} className="p-0">
                                {v === undefined ? (
                                  <div className="grid h-11 place-items-center rounded-lg bg-muted text-[11px] text-muted-foreground">—</div>
                                ) : (
                                  <UiTooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="grid h-11 cursor-default place-items-center rounded-lg text-[13px] font-semibold text-white transition-transform hover:scale-[1.04]"
                                        style={{ backgroundColor: scoreColor(v) }}
                                      >
                                        {v}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {l.name} · {row.section}: {v} de 100 ({climateBand(v).label})
                                    </TooltipContent>
                                  </UiTooltip>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {a.leaders.length > 1 && comparisonData.length > 0 && (
              <Card className="rounded-[22px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Comparativo pergunta a pergunta</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(360, comparisonData.length * 46)}>
                    <BarChart data={comparisonData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" domain={[scaleMin, scaleMax]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10.5, fill: "hsl(var(--foreground))" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                      {a.leaders.map((l, i) => (
                        <Bar key={l.name} dataKey={l.name} fill={SERIES[i % SERIES.length]} radius={[0, 4, 4, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {a.leaders.length > 1 && radarData.length > 2 && (
              <Card className="rounded-[22px]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Perfil comparado</CardTitle>
                  <CardDescription>As oito primeiras perguntas, para ver o formato de cada liderança.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={420}>
                    <RadarChart data={radarData} outerRadius="72%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="question" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis domain={[scaleMin, scaleMax]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      {a.leaders.map((l, i) => (
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
        )}

        {/* Comentários */}
        {a.textAnswers.length > 0 && (
          <TabsContent value="text">
            <OpenTextPanel answers={a.textAnswers} scaleMin={scaleMin} scaleMax={scaleMax} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

const CHART_TOOLTIP = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  fontSize: 12,
  boxShadow: "0 14px 34px -18px hsl(var(--brand-navy)/0.45)",
} as const;

function InsightRow({
  question, avg, section, max, min,
}: { question: string; avg: number; section: string; max: number; min: number }) {
  const score = Math.round(((avg - min) / (max - min)) * 100);
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-secondary/60 p-3">
      <div className="min-w-0">
        <p className="text-sm leading-snug">{question}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{section}</p>
      </div>
      <span className="shrink-0 text-[17px] font-bold tabular-nums" style={{ color: scoreColor(score) }}>
        {avg}
      </span>
    </div>
  );
}

/**
 * Painel dos comentários.
 *
 * As respostas abertas existiam no banco mas não apareciam em lugar nenhum do
 * dashboard — só saíam no CSV. É onde está o "porquê" dos números, então aqui
 * elas ganham busca, filtro por pergunta e separação por sentimento da nota
 * que acompanha o comentário.
 */
function OpenTextPanel({
  answers, scaleMin, scaleMax,
}: {
  answers: { questionId: string; question: string; text: string; value: number | null; department: string | null }[];
  scaleMin: number; scaleMax: number;
}) {
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("all");
  const [tone, setTone] = useState<"all" | "low" | "high">("all");

  const questions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of answers) m.set(t.questionId, t.question);
    return Array.from(m.entries());
  }, [answers]);

  const mid = (scaleMin + scaleMax) / 2;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return answers.filter((t) => {
      if (question !== "all" && t.questionId !== question) return false;
      if (tone === "low" && !(t.value != null && t.value < mid)) return false;
      if (tone === "high" && !(t.value != null && t.value > mid)) return false;
      if (q && !t.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [answers, query, question, tone, mid]);

  return (
    <Card className="rounded-[22px]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareQuote className="h-4 w-4 text-primary" />
          O que as pessoas escreveram
        </CardTitle>
        <CardDescription>
          {answers.length} {answers.length === 1 ? "comentário" : "comentários"}, sem identificação.
          É aqui que costuma estar a explicação das notas baixas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no texto…"
            className="h-9 min-w-[200px] flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Select value={question} onValueChange={setQuestion}>
            <SelectTrigger className="h-9 w-56 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as perguntas</SelectItem>
              {questions.map(([id, text]) => (
                <SelectItem key={id} value={id}>{truncate(text, 46)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
            <SelectTrigger className="h-9 w-44 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as notas</SelectItem>
              <SelectItem value="low">Notas baixas</SelectItem>
              <SelectItem value="high">Notas altas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum comentário com esses filtros.
          </p>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((t, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-3.5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {truncate(t.question, 70)}
                  </span>
                  {t.value != null && (
                    <Badge
                      className="rounded-full border-0 px-2 py-0.5 text-[10.5px] font-semibold text-white"
                      style={{ backgroundColor: scoreColor(((t.value - scaleMin) / (scaleMax - scaleMin)) * 100) }}
                    >
                      nota {t.value}
                    </Badge>
                  )}
                  {t.department && (
                    <Badge variant="outline" className="rounded-full text-[10.5px]">{t.department}</Badge>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
