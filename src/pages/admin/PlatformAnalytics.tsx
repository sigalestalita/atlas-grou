import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie,
} from 'recharts';
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, CheckCircle, Building2, UserCheck,
  Filter, ChevronDown, ChevronUp, Trophy, BarChart3, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExportReportDialog, { type ReportSection } from '@/components/ExportReportDialog';

interface Company { id: string; name: string; primary_color: string; }
interface Survey { id: string; title: string; company_id: string; scale_max: number; status: string; }

const COLORS = [
  'hsl(210, 79%, 46%)', 'hsl(152, 60%, 42%)', 'hsl(280, 60%, 50%)',
  'hsl(38, 92%, 50%)', 'hsl(350, 65%, 50%)', 'hsl(180, 60%, 40%)',
  'hsl(30, 80%, 50%)', 'hsl(240, 50%, 55%)',
];

const getScoreColor = (score: number) => {
  if (score >= 75) return 'hsl(152, 60%, 42%)';
  if (score >= 50) return 'hsl(38, 92%, 50%)';
  return 'hsl(0, 72%, 51%)';
};

export default function PlatformAnalytics() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedSurvey, setSelectedSurvey] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedLeader, setSelectedLeader] = useState<string>('all');

  const [responses, setResponses] = useState<any[]>([]);
  const [respondents, setRespondents] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExport, setShowExport] = useState(false);

  // Load companies and surveys
  useEffect(() => {
    const load = async () => {
      const [{ data: c }, { data: s }] = await Promise.all([
        supabase.from('companies').select('id, name, primary_color').order('name'),
        supabase.from('surveys').select('id, title, company_id, scale_max, status').in('status', ['active', 'closed']).order('created_at', { ascending: false }),
      ]);
      setCompanies(c || []);
      setSurveys(s || []);
    };
    load();
  }, []);

  // Load data when filters change
  useEffect(() => {
    loadData();
  }, [selectedCompany, selectedSurvey, companies, surveys]);

  const loadData = async () => {
    if (surveys.length === 0) { setLoading(false); return; }
    setLoading(true);

    let filteredSurveys = surveys;
    if (selectedCompany !== 'all') {
      filteredSurveys = surveys.filter(s => s.company_id === selectedCompany);
    }
    if (selectedSurvey !== 'all') {
      filteredSurveys = filteredSurveys.filter(s => s.id === selectedSurvey);
    }

    const surveyIds = filteredSurveys.map(s => s.id);
    if (surveyIds.length === 0) {
      setResponses([]); setRespondents([]); setQuestions([]); setSections([]);
      setLoading(false); return;
    }

    const [respRes, respondentRes, secRes] = await Promise.all([
      supabase.from('survey_responses').select('*').in('survey_id', surveyIds),
      supabase.from('respondents').select('*').in('survey_id', surveyIds),
      supabase.from('survey_sections').select('*').in('survey_id', surveyIds).order('sort_order'),
    ]);

    const secs = secRes.data || [];
    setSections(secs);

    const secIds = secs.map(s => s.id);
    const { data: qs } = secIds.length > 0
      ? await supabase.from('survey_questions').select('*').in('section_id', secIds).eq('question_type', 'scale').order('sort_order')
      : { data: [] };

    setResponses(respRes.data || []);
    setRespondents(respondentRes.data || []);
    setQuestions(qs || []);
    setLoading(false);
  };

  // Derived filter options
  const departments = useMemo(() => {
    const set = new Set<string>();
    responses.forEach(r => { if (r.department) set.add(r.department); });
    return Array.from(set).sort();
  }, [responses]);

  const evaluatedLeaders = useMemo(() => {
    const set = new Set<string>();
    responses.forEach(r => { if (r.evaluated_leader) set.add(r.evaluated_leader); });
    return Array.from(set).sort();
  }, [responses]);

  const availableSurveys = useMemo(() => {
    if (selectedCompany === 'all') return surveys;
    return surveys.filter(s => s.company_id === selectedCompany);
  }, [surveys, selectedCompany]);

  // Apply dept and leader filters
  const filteredResponses = useMemo(() => {
    let fr = responses;
    if (selectedDept !== 'all') fr = fr.filter(r => r.department === selectedDept);
    if (selectedLeader !== 'all') fr = fr.filter(r => r.evaluated_leader === selectedLeader);
    return fr;
  }, [responses, selectedDept, selectedLeader]);

  const scaleMax = useMemo(() => {
    if (selectedSurvey !== 'all') {
      const s = surveys.find(s => s.id === selectedSurvey);
      return s?.scale_max || 5;
    }
    return surveys[0]?.scale_max || 5;
  }, [surveys, selectedSurvey]);

  // ============ COMPUTED METRICS ============

  // KPIs
  const kpis = useMemo(() => {
    const total = respondents.length;
    const responded = respondents.filter(r => r.status === 'responded').length;
    const rate = total > 0 ? Math.round((responded / total) * 100) : 0;
    const scaleVals = filteredResponses.filter(r => r.value != null).map(r => r.value!);
    const avg = scaleVals.length > 0 ? scaleVals.reduce((a, b) => a + b, 0) / scaleVals.length : 0;
    const score = Math.round((avg / scaleMax) * 100);
    return { total, responded, rate, score, avg: Math.round(avg * 100) / 100 };
  }, [respondents, filteredResponses, scaleMax]);

  // Per-company averages
  const companyAvgs = useMemo(() => {
    const map = new Map<string, number[]>();
    filteredResponses.forEach(r => {
      if (r.value == null) return;
      const survey = surveys.find(s => s.id === r.survey_id);
      if (!survey) return;
      const arr = map.get(survey.company_id) || [];
      arr.push(r.value);
      map.set(survey.company_id, arr);
    });
    return Array.from(map.entries())
      .map(([compId, vals]) => ({
        name: companies.find(c => c.id === compId)?.name || compId,
        avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
        count: vals.length,
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [filteredResponses, surveys, companies]);

  // Per-department averages
  const deptAvgs = useMemo(() => {
    const map = new Map<string, number[]>();
    filteredResponses.forEach(r => {
      if (!r.department || r.value == null) return;
      const arr = map.get(r.department) || [];
      arr.push(r.value);
      map.set(r.department, arr);
    });
    return Array.from(map.entries())
      .filter(([_, vals]) => vals.length >= 3)
      .map(([name, vals]) => ({
        name,
        avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [filteredResponses]);

  // Per-evaluated-leader averages
  const leaderAvgs = useMemo(() => {
    const map = new Map<string, number[]>();
    filteredResponses.forEach(r => {
      if (!r.evaluated_leader || r.value == null) return;
      const arr = map.get(r.evaluated_leader) || [];
      arr.push(r.value);
      map.set(r.evaluated_leader, arr);
    });
    return Array.from(map.entries())
      .filter(([_, vals]) => vals.length >= 3)
      .map(([name, vals]) => ({
        name,
        avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
        score: Math.round(((vals.reduce((a, b) => a + b, 0) / vals.length) / scaleMax) * 100),
        count: vals.length,
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [filteredResponses, scaleMax]);

  // Per-leader per-section breakdown
  const leaderSectionBreakdown = useMemo(() => {
    if (leaderAvgs.length === 0 || sections.length === 0) return [];

    const leaderSectionMap = new Map<string, Map<string, number[]>>();

    filteredResponses.forEach(r => {
      if (!r.evaluated_leader || r.value == null) return;
      if (!leaderSectionMap.has(r.evaluated_leader)) leaderSectionMap.set(r.evaluated_leader, new Map());
      const secMap = leaderSectionMap.get(r.evaluated_leader)!;
      const q = questions.find(q => q.id === r.question_id);
      if (!q) return;
      const sec = sections.find(s => s.id === q.section_id);
      if (!sec) return;
      const arr = secMap.get(sec.title) || [];
      arr.push(r.value);
      secMap.set(sec.title, arr);
    });

    const sectionTitles = [...new Set(sections.map(s => s.title))];

    return sectionTitles.map(secTitle => {
      const entry: Record<string, string | number> = { section: secTitle.length > 25 ? secTitle.substring(0, 25) + '...' : secTitle };
      leaderAvgs.forEach(l => {
        const secMap = leaderSectionMap.get(l.name);
        const vals = secMap?.get(secTitle) || [];
        entry[l.name] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
      });
      return entry;
    });
  }, [leaderAvgs, filteredResponses, questions, sections]);

  // Section averages (overall)
  const sectionAvgs = useMemo(() => {
    const secMap = new Map<string, number[]>();
    filteredResponses.forEach(r => {
      if (r.value == null) return;
      const q = questions.find(q => q.id === r.question_id);
      if (!q) return;
      const sec = sections.find(s => s.id === q.section_id);
      if (!sec) return;
      const arr = secMap.get(sec.title) || [];
      arr.push(r.value);
      secMap.set(sec.title, arr);
    });
    return Array.from(secMap.entries())
      .map(([name, vals]) => ({
        name: name.length > 30 ? name.substring(0, 30) + '...' : name,
        avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [filteredResponses, questions, sections]);

  const getBarColor = (avg: number) => {
    const pct = (avg / scaleMax) * 100;
    if (pct >= 75) return 'hsl(152, 60%, 42%)';
    if (pct >= 50) return 'hsl(38, 92%, 50%)';
    return 'hsl(0, 72%, 51%)';
  };

  if (loading && companies.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Painel Analítico da Plataforma
          </h1>
          <p className="text-sm text-muted-foreground">Visão consolidada de todas as empresas e pesquisas</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Empresa</label>
              <Select value={selectedCompany} onValueChange={v => { setSelectedCompany(v); setSelectedSurvey('all'); setSelectedDept('all'); setSelectedLeader('all'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pesquisa</label>
              <Select value={selectedSurvey} onValueChange={v => { setSelectedSurvey(v); setSelectedDept('all'); setSelectedLeader('all'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as pesquisas</SelectItem>
                  {availableSurveys.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Departamento</label>
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Líder Avaliado</label>
              <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {evaluatedLeaders.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Score Geral</p>
                <p className="text-3xl font-bold" style={{ color: getScoreColor(kpis.score) }}>{kpis.score}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: getScoreColor(kpis.score) + '20' }}>
                {kpis.score >= 75 ? <TrendingUp style={{ color: getScoreColor(kpis.score) }} /> : kpis.score >= 50 ? <AlertTriangle style={{ color: getScoreColor(kpis.score) }} /> : <TrendingDown style={{ color: getScoreColor(kpis.score) }} />}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Média: {kpis.avg} / {scaleMax}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Resposta</p>
                <p className="text-3xl font-bold">{kpis.rate}%</p>
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
                <p className="text-3xl font-bold">{kpis.responded}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center"><Users className="text-green-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Líderes Avaliados</p>
                <p className="text-3xl font-bold">{leaderAvgs.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center"><UserCheck className="text-blue-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content tabs */}
      <Tabs defaultValue="leaders" className="w-full">
        <TabsList>
          <TabsTrigger value="leaders">Por Líder Avaliado</TabsTrigger>
          <TabsTrigger value="companies">Por Empresa</TabsTrigger>
          <TabsTrigger value="departments">Por Departamento</TabsTrigger>
          <TabsTrigger value="sections">Por Categoria</TabsTrigger>
        </TabsList>

        {/* === LEADERS TAB === */}
        <TabsContent value="leaders" className="space-y-6">
          {leaderAvgs.length > 0 ? (
            <>
              {/* Leader ranking */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {leaderAvgs.map((leader, idx) => (
                  <Card key={leader.name} className="border">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
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
                      <p className="text-xs text-muted-foreground">{leader.count} respostas</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Leader comparison bar chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Ranking de Líderes</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(250, leaderAvgs.length * 50)}>
                    <BarChart data={leaderAvgs} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, scaleMax]} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                        {leaderAvgs.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Leader x Section comparison */}
              {leaderSectionBreakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Comparativo Líder × Categoria</CardTitle>
                    <CardDescription>Média de cada líder por categoria de perguntas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(400, leaderSectionBreakdown.length * 50)}>
                      <BarChart data={leaderSectionBreakdown} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, scaleMax]} />
                        <YAxis type="category" dataKey="section" width={160} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        {leaderAvgs.map((l, idx) => (
                          <Bar key={l.name} dataKey={l.name} fill={COLORS[idx % COLORS.length]} radius={[0, 2, 2, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Radar */}
              {leaderSectionBreakdown.length >= 3 && leaderAvgs.length <= 6 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Radar Comparativo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={450}>
                      <RadarChart data={leaderSectionBreakdown}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="section" tick={{ fontSize: 9 }} />
                        <PolarRadiusAxis domain={[0, scaleMax]} tick={{ fontSize: 10 }} />
                        {leaderAvgs.map((l, idx) => (
                          <Radar key={l.name} name={l.name} dataKey={l.name}
                            stroke={COLORS[idx % COLORS.length]} fill={COLORS[idx % COLORS.length]} fillOpacity={0.1} />
                        ))}
                        <Legend />
                        <Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              {filteredResponses.length === 0 ? 'Sem dados de respostas.' : 'Nenhuma avaliação por líder encontrada. Verifique se as atribuições de avaliação foram configuradas.'}
            </CardContent></Card>
          )}
        </TabsContent>

        {/* === COMPANIES TAB === */}
        <TabsContent value="companies" className="space-y-6">
          {companyAvgs.length > 0 ? (
            <>
              <Card>
                <CardHeader><CardTitle className="text-lg">Comparativo entre Empresas</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(250, companyAvgs.length * 60)}>
                    <BarChart data={companyAvgs} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, scaleMax]} />
                      <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                        {companyAvgs.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {companyAvgs.map((c, idx) => (
                  <Card key={c.name}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" style={{ color: COLORS[idx % COLORS.length] }} />
                        <span className="font-semibold text-sm">{c.name}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Média</span>
                        <span>{c.avg} / {scaleMax}</span>
                      </div>
                      <Progress value={(c.avg / scaleMax) * 100} className="h-2" />
                      <p className="text-xs text-muted-foreground">{c.count} respostas</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Sem dados para comparativo entre empresas.</CardContent></Card>
          )}
        </TabsContent>

        {/* === DEPARTMENTS TAB === */}
        <TabsContent value="departments" className="space-y-6">
          {deptAvgs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Comparativo por Departamento</CardTitle>
                <CardDescription>Grupos com menos de 3 respostas são ocultos para preservar anonimato</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, deptAvgs.length * 50)}>
                  <BarChart data={deptAvgs} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, scaleMax]} />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                      {deptAvgs.map((entry, i) => <Cell key={i} fill={getBarColor(entry.avg)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Sem dados suficientes por departamento (mín. 3 respostas).</CardContent></Card>
          )}
        </TabsContent>

        {/* === SECTIONS TAB === */}
        <TabsContent value="sections" className="space-y-6">
          {sectionAvgs.length > 0 ? (
            <>
              <Card>
                <CardHeader><CardTitle className="text-lg">Média por Categoria</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(300, sectionAvgs.length * 50)}>
                    <BarChart data={sectionAvgs} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, scaleMax]} />
                      <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                        {sectionAvgs.map((entry, i) => <Cell key={i} fill={getBarColor(entry.avg)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Strengths / Weaknesses */}
              <div className="grid gap-6 lg:grid-cols-2">
                {sectionAvgs.length > 0 && (
                  <Card className="border-green-200 bg-green-50/50">
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Trophy className="h-5 w-5 text-green-600" />Categorias Destaque</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {sectionAvgs.slice(0, 3).map((s, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-white/80 rounded-lg">
                          <span className="text-sm">{s.name}</span>
                          <span className="font-bold text-green-600">{s.avg}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {sectionAvgs.length > 0 && (
                  <Card className="border-red-200 bg-red-50/50">
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" />Categorias com Atenção</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {[...sectionAvgs].reverse().slice(0, 3).map((s, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-white/80 rounded-lg">
                          <span className="text-sm">{s.name}</span>
                          <span className="font-bold text-red-600">{s.avg}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Sem dados por categoria.</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
