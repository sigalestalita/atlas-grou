import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { TrendingUp, TrendingDown, Users, CheckCircle, AlertTriangle, Trophy, UserCheck, ChevronDown, ChevronUp, Download, Filter } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ExportReportDialog, { type ReportSection } from '@/components/ExportReportDialog';

interface ContextType {
  company: { id: string; name: string; primary_color: string };
}

interface LeaderDetail {
  name: string;
  avg: number;
  count: number;
  score: number;
  questionAvgs: { question: string; questionFull: string; avg: number; section: string }[];
  strengths: { question: string; questionFull: string; avg: number }[];
  weaknesses: { question: string; questionFull: string; avg: number }[];
}

const LEADER_COLORS = [
  'hsl(210, 79%, 46%)',
  'hsl(152, 60%, 42%)',
  'hsl(280, 60%, 50%)',
  'hsl(38, 92%, 50%)',
  'hsl(350, 65%, 50%)',
  'hsl(180, 60%, 40%)',
  'hsl(30, 80%, 50%)',
  'hsl(240, 50%, 55%)',
];

export default function Dashboard() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [stats, setStats] = useState({ total: 0, responded: 0, rate: 0 });
  const [questionAvgs, setQuestionAvgs] = useState<{ name: string; nameFull: string; avg: number; section: string; dist: number[]; n: number }[]>([]);
  const [deptAvgs, setDeptAvgs] = useState<{ name: string; avg: number }[]>([]);
  const [leaderAvgs, setLeaderAvgs] = useState<{ name: string; avg: number }[]>([]);
  const [leaderDetails, setLeaderDetails] = useState<LeaderDetail[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [scaleMax, setScaleMax] = useState(5);
  const [expandedLeader, setExpandedLeader] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [surveyTitle, setSurveyTitle] = useState('');
  const [companyBranding, setCompanyBranding] = useState<{ primary: string; secondary: string; logoUrl?: string }>({ primary: '#ff5700', secondary: '#03104f' });

  // Leader filter
  const [availableLeaders, setAvailableLeaders] = useState<string[]>([]);
  const [selectedLeaderFilter, setSelectedLeaderFilter] = useState<string>('all');

  useEffect(() => {
    if (!companyId) return;
    loadData();
  }, [companyId]);

  // Reload charts when filter changes
  useEffect(() => {
    if (!companyId) return;
    loadData();
  }, [selectedLeaderFilter]);

  const loadData = async () => {
    // Load company info
    const { data: companyData } = await supabase.from('companies').select('name, primary_color, secondary_color, logo_url').eq('id', companyId).single();
    if (companyData) {
      setCompanyName(companyData.name);
      setCompanyBranding({ primary: companyData.primary_color, secondary: companyData.secondary_color, logoUrl: companyData.logo_url || undefined });
    }

    const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).in('status', ['active', 'closed']).limit(1);
    const survey = surveys?.[0];
    if (!survey) return;
    setScaleMax(survey.scale_max);
    setSurveyTitle(survey.title);

    // Extract available leaders from survey config
    const leaders: { name: string; type: string }[] = (() => {
      if (!survey.leaders) return [];
      try {
        const raw = typeof survey.leaders === 'string' ? JSON.parse(survey.leaders) : Array.isArray(survey.leaders) ? survey.leaders : [];
        return raw.map((l: any) => typeof l === 'string' ? { name: l, type: 'company' } : l);
      } catch { return []; }
    })();
    setAvailableLeaders(leaders.map(l => l.name));

    // Compute stats: for open-access surveys, count from survey_responses; otherwise from respondents
    if (survey.open_access) {
      // Count unique submissions by distinct submitted_at timestamps
      const { data: allResponses } = await supabase
        .from('survey_responses')
        .select('submitted_at, evaluated_leader')
        .eq('survey_id', survey.id);

      const uniqueSubmissions = new Set((allResponses || []).map(r => `${r.submitted_at}_${r.evaluated_leader || ''}`));
      const responded = uniqueSubmissions.size;
      // For open-access, no fixed "total" — just show responded
      setStats({ total: responded, responded, rate: responded > 0 ? 100 : 0 });
    } else {
      const { data: respondents } = await supabase.from('respondents').select('status').eq('survey_id', survey.id);
      const total = respondents?.length || 0;
      const responded = respondents?.filter(r => r.status === 'responded').length || 0;
      const rate = total > 0 ? Math.round((responded / total) * 100) : 0;
      setStats({ total, responded, rate });
    }

    const { data: sections } = await supabase.from('survey_sections').select('id, title, sort_order').eq('survey_id', survey.id).order('sort_order');
    const { data: questions } = await supabase.from('survey_questions').select('id, text, section_id, sort_order, question_type').in('section_id', (sections || []).map(s => s.id)).order('sort_order');
    const scaleQuestions = (questions || []).filter(q => q.question_type === 'scale');

    // Load responses with optional leader filter
    let responseQuery = supabase.from('survey_responses').select('question_id, value, department, company_leadership, evaluated_leader, department_leadership').eq('survey_id', survey.id);
    if (selectedLeaderFilter && selectedLeaderFilter !== 'all') {
      responseQuery = responseQuery.eq('evaluated_leader', selectedLeaderFilter);
    }
    const { data: responses } = await responseQuery;

    if (!responses || responses.length === 0) {
      setQuestionAvgs([]);
      setDeptAvgs([]);
      setLeaderAvgs([]);
      setLeaderDetails([]);
      setOverallScore(0);
      return;
    }

    // Question averages
    const qMap = new Map<string, number[]>();
    responses.forEach(r => {
      if (r.value == null) return;
      const arr = qMap.get(r.question_id) || [];
      arr.push(r.value);
      qMap.set(r.question_id, arr);
    });

    const qAvgs = scaleQuestions.map(q => {
      const vals = qMap.get(q.id) || [];
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const section = sections?.find(s => s.id === q.section_id)?.title || '';
      const dist = new Array(survey.scale_max).fill(0);
      vals.forEach(v => { if (v >= 1 && v <= survey.scale_max) dist[v - 1]++; });
      return { name: q.text.substring(0, 40) + (q.text.length > 40 ? '...' : ''), nameFull: q.text, avg: Math.round(avg * 100) / 100, section, dist, n: vals.length };
    });
    setQuestionAvgs(qAvgs);

    // Department averages (min 3)
    const deptMap = new Map<string, number[]>();
    responses.forEach(r => {
      if (!r.department || r.value == null) return;
      const arr = deptMap.get(r.department) || [];
      arr.push(r.value);
      deptMap.set(r.department, arr);
    });
    const dAvgs = Array.from(deptMap.entries())
      .filter(([_, vals]) => vals.length >= 3)
      .map(([name, vals]) => ({ name, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 }))
      .sort((a, b) => b.avg - a.avg);
    setDeptAvgs(dAvgs);

    // Leadership averages & detailed breakdown (min 3)
    const leadMap = new Map<string, number[]>();
    const leadQuestionMap = new Map<string, Map<string, number[]>>();
    responses.forEach(r => {
      const leader = r.evaluated_leader || r.company_leadership;
      if (!leader || r.value == null) return;
      const arr = leadMap.get(leader) || [];
      arr.push(r.value);
      leadMap.set(leader, arr);

      if (!leadQuestionMap.has(leader)) leadQuestionMap.set(leader, new Map());
      const qm = leadQuestionMap.get(leader)!;
      const qarr = qm.get(r.question_id) || [];
      qarr.push(r.value);
      qm.set(r.question_id, qarr);
    });

    const lAvgs = Array.from(leadMap.entries())
      .filter(([_, vals]) => vals.length >= 3)
      .map(([name, vals]) => ({ name, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 }))
      .sort((a, b) => b.avg - a.avg);
    setLeaderAvgs(lAvgs);

    // Detailed leader data
    const details: LeaderDetail[] = lAvgs.map(l => {
      const vals = leadMap.get(l.name)!;
      const qm = leadQuestionMap.get(l.name)!;
      const questionAvgsForLeader = scaleQuestions.map(q => {
        const qVals = qm.get(q.id) || [];
        const avg = qVals.length > 0 ? qVals.reduce((a, b) => a + b, 0) / qVals.length : 0;
        const section = sections?.find(s => s.id === q.section_id)?.title || '';
        return {
          question: q.text.substring(0, 35) + (q.text.length > 35 ? '...' : ''),
          questionFull: q.text,
          avg: Math.round(avg * 100) / 100,
          section
        };
      }).filter(q => q.avg > 0);

      const sorted = [...questionAvgsForLeader].sort((a, b) => a.avg - b.avg);
      return {
        name: l.name,
        avg: l.avg,
        count: new Set(vals).size > 0 ? Math.round(vals.length / scaleQuestions.length) : vals.length,
        score: Math.round((l.avg / survey.scale_max) * 100),
        questionAvgs: questionAvgsForLeader,
        strengths: sorted.slice(-3).reverse(),
        weaknesses: sorted.slice(0, 3),
      };
    });
    setLeaderDetails(details);

    // Overall score
    const allVals = responses.filter(r => r.value != null).map(r => r.value!);
    const rawAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const score = Math.round((rawAvg / survey.scale_max) * 100);
    setOverallScore(score);
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'hsl(152, 60%, 42%)';
    if (score >= 50) return 'hsl(38, 92%, 50%)';
    return 'hsl(0, 72%, 51%)';
  };

  const getBarColor = (avg: number) => {
    const pct = (avg / scaleMax) * 100;
    if (pct >= 75) return 'hsl(152, 60%, 42%)';
    if (pct >= 50) return 'hsl(38, 92%, 50%)';
    return 'hsl(0, 72%, 51%)';
  };

  const insights = () => {
    const sorted = [...questionAvgs].sort((a, b) => a.avg - b.avg);
    const weak = sorted.slice(0, 3).filter(q => q.avg > 0);
    const strong = sorted.slice(-3).reverse().filter(q => q.avg > 0);
    return { weak, strong };
  };

  const { weak, strong } = insights();

  // Build radar data for leader comparison
  const radarData = questionAvgs.length > 0 && leaderDetails.length > 0
    ? questionAvgs.slice(0, 8).map(q => {
        const entry: Record<string, string | number> = { question: q.name };
        leaderDetails.forEach(l => {
          const match = l.questionAvgs.find(lq => lq.question === q.name || q.name.startsWith(lq.question.substring(0, 30)));
          entry[l.name] = match?.avg || 0;
        });
        return entry;
      })
    : [];

  // Build report sections for export
  const buildReportSections = (): ReportSection[] => {
    const result: ReportSection[] = [];
    result.push({
      key: 'kpis', label: 'Indicadores Gerais (KPIs)', description: 'Score geral, taxa de resposta e totais',
      data: { headers: ['Indicador', 'Valor'], rows: [
        ['Score Geral', `${overallScore}pts`], ['Taxa de Resposta', `${stats.rate}%`],
        ['Total de Colaboradores', stats.total], ['Respondidos', stats.responded], ['Pendentes', stats.total - stats.responded],
      ]},
    });
    if (questionAvgs.length > 0) {
      result.push({
        key: 'questions', label: 'Média por Pergunta', description: 'Média de cada pergunta da pesquisa',
        data: { headers: ['Pergunta', 'Categoria', 'Média'], rows: questionAvgs.map(q => [q.nameFull, q.section, q.avg]) },
      });
    }
    if (deptAvgs.length > 0) {
      result.push({
        key: 'departments', label: 'Média por Departamento', description: 'Comparativo entre departamentos (mín. 3 respostas)',
        data: { headers: ['Departamento', 'Média'], rows: deptAvgs.map(d => [d.name, d.avg]) },
      });
    }
    if (leaderDetails.length > 0) {
      result.push({
        key: 'leaders_overview', label: 'Visão Geral por Liderança', description: 'Score e média de cada líder avaliado',
        data: { headers: ['Líder', 'Média', 'Score', 'Avaliações', 'Destaque Positivo', 'Ponto de Atenção'], rows: leaderDetails.map(l => [
          l.name, l.avg, `${l.score}pts`, `~${l.count}`,
          l.strengths[0] ? `${l.strengths[0].questionFull} (${l.strengths[0].avg})` : '-',
          l.weaknesses[0] ? `${l.weaknesses[0].questionFull} (${l.weaknesses[0].avg})` : '-',
        ])},
      });
      for (const leader of leaderDetails) {
        result.push({
          key: `leader_${leader.name}`, label: `Detalhamento: ${leader.name}`, description: `Resultado por pergunta para ${leader.name}`,
          data: { headers: ['Pergunta', 'Categoria', 'Média'], rows: leader.questionAvgs.map(q => [q.questionFull, q.section, q.avg]) },
        });
      }
    }
    if (strong.length > 0 || weak.length > 0) {
      result.push({
        key: 'insights', label: 'Pontos Fortes e de Atenção', description: 'Top 3 melhores e piores resultados',
        data: { headers: ['Tipo', 'Pergunta', 'Média'], rows: [
          ...strong.map(q => ['✅ Ponto Forte', q.nameFull, q.avg] as (string | number)[]),
          ...weak.map(q => ['⚠️ Atenção', q.nameFull, q.avg] as (string | number)[]),
        ]},
      });
    }
    return result;
  };

  return (
    <div className="space-y-6">
      {/* Export button + Leader filter */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {availableLeaders.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedLeaderFilter} onValueChange={setSelectedLeaderFilter}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Filtrar por liderança..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lideranças</SelectItem>
                {availableLeaders.map(l => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLeaderFilter !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                Filtrando: {selectedLeaderFilter}
              </Badge>
            )}
          </div>
        )}
        <Button variant="outline" onClick={() => setShowExport(true)} className="flex items-center gap-2 ml-auto">
          <Download className="h-4 w-4" />
          Exportar Relatório
        </Button>
      </div>

      <ExportReportDialog
        open={showExport}
        onOpenChange={setShowExport}
        companyName={companyName || context?.company?.name || 'Empresa'}
        surveyTitle={surveyTitle}
        sections={buildReportSections()}
        branding={{ primary: companyBranding.primary, secondary: companyBranding.secondary, logoUrl: companyBranding.logoUrl }}
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Score Geral</p>
                <p className="text-3xl font-bold" style={{ color: getScoreColor(overallScore) }}>{overallScore}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: getScoreColor(overallScore) + '20' }}>
                {overallScore >= 75 ? <TrendingUp style={{ color: getScoreColor(overallScore) }} /> : overallScore >= 50 ? <AlertTriangle style={{ color: getScoreColor(overallScore) }} /> : <TrendingDown style={{ color: getScoreColor(overallScore) }} />}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Resposta</p>
                <p className="text-3xl font-bold">{stats.rate}%</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><CheckCircle className="text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Respondidos</p>
                <p className="text-3xl font-bold">{stats.responded}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center"><Users className="text-green-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-3xl font-bold">{stats.total - stats.responded}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center"><AlertTriangle className="text-orange-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Média por Pergunta</CardTitle></CardHeader>
          <CardContent>
            {questionAvgs.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, questionAvgs.length * 40)}>
                <BarChart data={questionAvgs} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, scaleMax]} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                    {questionAvgs.map((entry, i) => <Cell key={i} fill={getBarColor(entry.avg)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-8 text-sm">Sem dados disponíveis</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Média por Departamento</CardTitle></CardHeader>
          <CardContent>
            {deptAvgs.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptAvgs}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, scaleMax]} />
                  <Tooltip />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {deptAvgs.map((entry, i) => <Cell key={i} fill={getBarColor(entry.avg)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-8 text-sm">Grupos com menos de 3 respostas são ocultos</p>}
          </CardContent>
        </Card>
      </div>

      {/* ===== LEADERSHIP METRICS PANEL ===== */}
      {leaderDetails.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Painel de Métricas por Liderança</CardTitle>
            </div>
            <CardDescription>Comparação detalhada entre lideranças imediatas (mín. 3 respostas por grupo)</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                <TabsTrigger value="comparison">Comparativo por Pergunta</TabsTrigger>
                {radarData.length > 0 && <TabsTrigger value="radar">Radar</TabsTrigger>}
                <TabsTrigger value="detail">Detalhamento</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {leaderDetails.map((leader, idx) => (
                    <Card key={leader.name} className="border">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LEADER_COLORS[idx % LEADER_COLORS.length] }} />
                            <span className="font-semibold text-sm">{leader.name}</span>
                          </div>
                          <Badge variant={leader.score >= 75 ? 'default' : leader.score >= 50 ? 'secondary' : 'destructive'}>
                            {leader.score}pts
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Score</span>
                            <span>{leader.avg} / {scaleMax}</span>
                          </div>
                          <Progress value={leader.score} className="h-2" />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ~{leader.count} avaliações
                        </div>
                        {leader.strengths.length > 0 && (
                          <div className="pt-2 border-t space-y-1">
                            <p className="text-xs font-medium text-green-700">Destaque positivo:</p>
                            <p className="text-xs text-muted-foreground">{leader.strengths[0].question} ({leader.strengths[0].avg})</p>
                          </div>
                        )}
                        {leader.weaknesses.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-red-700">Ponto de atenção:</p>
                            <p className="text-xs text-muted-foreground">{leader.weaknesses[0].question} ({leader.weaknesses[0].avg})</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Comparison Tab - grouped bar chart */}
              <TabsContent value="comparison">
                <ResponsiveContainer width="100%" height={Math.max(400, questionAvgs.length * 50)}>
                  <BarChart
                    data={questionAvgs.map(q => {
                      const entry: Record<string, string | number> = { name: q.name };
                      leaderDetails.forEach(l => {
                        const match = l.questionAvgs.find(lq => q.name.startsWith(lq.question.substring(0, 30)));
                        entry[l.name] = match?.avg || 0;
                      });
                      return entry;
                    })}
                    layout="vertical"
                    margin={{ left: 20, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, scaleMax]} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    {leaderDetails.map((l, idx) => (
                      <Bar key={l.name} dataKey={l.name} fill={LEADER_COLORS[idx % LEADER_COLORS.length]} radius={[0, 2, 2, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* Radar Tab */}
              {radarData.length > 0 && (
                <TabsContent value="radar">
                  <ResponsiveContainer width="100%" height={450}>
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="question" tick={{ fontSize: 9 }} />
                      <PolarRadiusAxis domain={[0, scaleMax]} tick={{ fontSize: 10 }} />
                      {leaderDetails.map((l, idx) => (
                        <Radar
                          key={l.name}
                          name={l.name}
                          dataKey={l.name}
                          stroke={LEADER_COLORS[idx % LEADER_COLORS.length]}
                          fill={LEADER_COLORS[idx % LEADER_COLORS.length]}
                          fillOpacity={0.1}
                        />
                      ))}
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </TabsContent>
              )}

              {/* Detail Tab - expandable per leader */}
              <TabsContent value="detail" className="space-y-3">
                {leaderDetails.map((leader, idx) => (
                  <Card key={leader.name} className="border">
                    <button
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-t-lg"
                      onClick={() => setExpandedLeader(expandedLeader === leader.name ? null : leader.name)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LEADER_COLORS[idx % LEADER_COLORS.length] }} />
                        <span className="font-semibold text-sm">{leader.name}</span>
                        <Badge variant="outline" className="text-xs">Score: {leader.score}</Badge>
                      </div>
                      {expandedLeader === leader.name ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedLeader === leader.name && (
                      <CardContent className="pt-0 space-y-2">
                        <div className="grid gap-2">
                          {leader.questionAvgs.map((q, qi) => (
                            <div key={qi} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs truncate" title={q.questionFull}>{q.questionFull}</p>
                                <p className="text-[10px] text-muted-foreground">{q.section}</p>
                              </div>
                              <div className="w-24 flex items-center gap-2">
                                <Progress value={(q.avg / scaleMax) * 100} className="h-1.5 flex-1" />
                                <span className="text-xs font-mono font-bold w-8 text-right" style={{ color: getBarColor(q.avg) }}>{q.avg}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      <div className="grid gap-6 lg:grid-cols-2">
        {strong.length > 0 && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Trophy className="h-5 w-5 text-green-600" />Pontos Fortes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {strong.map((q, i) => (
                <div key={i} className="flex justify-between items-center p-2 bg-white/80 rounded-lg">
                  <span className="text-sm">{q.name}</span>
                  <span className="font-bold text-green-600">{q.avg}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {weak.length > 0 && (
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" />Pontos de Atenção</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {weak.map((q, i) => (
                <div key={i} className="flex justify-between items-center p-2 bg-white/80 rounded-lg">
                  <span className="text-sm">{q.name}</span>
                  <span className="font-bold text-red-600">{q.avg}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
