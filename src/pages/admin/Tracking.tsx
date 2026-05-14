import { useEffect, useState, useCallback, useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Activity, Users, UserCheck, MessageSquare, Radio, Search, Clock } from 'lucide-react';

interface ContextType { company: { id: string } }

interface Leader { name: string; type: 'company' | 'department'; hidden?: boolean }
interface Respondent {
  id: string; name: string | null; email: string | null;
  department: string | null; company_leadership: string | null; department_leadership: string | null;
  status: string; responded_at: string | null;
}
interface ResponseRow {
  id: string; submitted_at: string;
  evaluated_leader: string | null; department: string | null;
  company_leadership: string | null; department_leadership: string | null;
}

export default function Tracking() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [survey, setSurvey] = useState<any>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'responded' | 'pending'>('all');
  const [livePulse, setLivePulse] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).neq('status', 'draft').limit(1);
    const s = surveys?.[0];
    setSurvey(s);
    if (!s) return;
    const [respRes, peopleRes] = await Promise.all([
      supabase.from('survey_responses').select('id, submitted_at, evaluated_leader, department, company_leadership, department_leadership').eq('survey_id', s.id).order('submitted_at', { ascending: false }),
      supabase.from('respondents').select('*').eq('survey_id', s.id).order('name'),
    ]);
    setResponses((respRes.data || []) as any);
    setRespondents((peopleRes.data || []) as any);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!survey?.id) return;
    const ch = supabase
      .channel(`tracking-${survey.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_responses', filter: `survey_id=eq.${survey.id}` }, (payload) => {
        setResponses(prev => [payload.new as any, ...prev]);
        setLivePulse(true);
        setTimeout(() => setLivePulse(false), 2500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'respondents', filter: `survey_id=eq.${survey.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [survey?.id, load]);

  // Group responses into unique submissions
  const submissions = useMemo(() => {
    const map = new Map<string, ResponseRow>();
    responses.forEach(r => {
      const key = `${r.submitted_at}__${r.evaluated_leader || ''}__${r.department || ''}__${r.company_leadership || ''}__${r.department_leadership || ''}`;
      if (!map.has(key)) map.set(key, r);
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  }, [responses]);

  const leaders: Leader[] = useMemo(() => {
    const list = (survey?.leaders || []) as Leader[];
    return list.filter(l => !l.hidden);
  }, [survey]);

  const leaderStats = useMemo(() => {
    const counts = new Map<string, number>();
    submissions.forEach(s => {
      if (s.evaluated_leader) counts.set(s.evaluated_leader, (counts.get(s.evaluated_leader) || 0) + 1);
    });
    const maxCount = Math.max(1, ...Array.from(counts.values()));
    return leaders
      .map(l => ({ ...l, count: counts.get(l.name) || 0, pct: ((counts.get(l.name) || 0) / maxCount) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [leaders, submissions]);

  // Estimate "responded" colaboradores: by matching dept + dept_leadership grouping
  // A colaborador é considerado "respondeu" se a combinação (department, department_leadership) dele aparece em pelo menos uma submissão
  // ou se respondents.status='responded'
  const submissionGroupCounts = useMemo(() => {
    const m = new Map<string, number>();
    submissions.forEach(s => {
      const key = `${s.department || ''}__${s.department_leadership || ''}`;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return m;
  }, [submissions]);

  const enrichedRespondents = useMemo(() => {
    // Calculate: for each (dept, dept_lead) group, how many people are cadastrados vs submissions received
    const groupPeople = new Map<string, Respondent[]>();
    respondents.forEach(r => {
      const key = `${r.department || ''}__${r.department_leadership || ''}`;
      const arr = groupPeople.get(key) || [];
      arr.push(r);
      groupPeople.set(key, arr);
    });

    return respondents.map(r => {
      const explicitlyResponded = r.status === 'responded';
      const key = `${r.department || ''}__${r.department_leadership || ''}`;
      const groupSize = (groupPeople.get(key) || []).length;
      const groupSubmissions = submissionGroupCounts.get(key) || 0;
      // Likely responded if explicit flag, or if everyone in the group already responded
      const likelyResponded = explicitlyResponded || (groupSize > 0 && groupSubmissions >= groupSize);
      return {
        ...r,
        explicitlyResponded,
        likelyResponded,
        groupSize,
        groupSubmissions,
      };
    });
  }, [respondents, submissionGroupCounts]);

  const filteredRespondents = useMemo(() => {
    let list = enrichedRespondents;
    if (statusFilter === 'responded') list = list.filter(r => r.likelyResponded);
    if (statusFilter === 'pending') list = list.filter(r => !r.likelyResponded);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q) ||
        (r.department_leadership || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [enrichedRespondents, statusFilter, search]);

  const totalRespondents = respondents.length;
  const respondedCount = enrichedRespondents.filter(r => r.likelyResponded).length;
  const responseRate = totalRespondents > 0 ? Math.round((respondedCount / totalRespondents) * 100) : 0;
  const leadersEvaluated = leaderStats.filter(l => l.count > 0).length;
  const lastSubmission = submissions[0]?.submitted_at;

  if (!survey) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma pesquisa ativa</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Acompanhamento em tempo real
            <Badge variant={livePulse ? 'default' : 'outline'} className="gap-1">
              <Radio className={`h-3 w-3 ${livePulse ? 'animate-pulse' : ''}`} />
              {livePulse ? 'Nova resposta!' : 'Ao vivo'}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">{survey.title}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6 text-center">
          <MessageSquare className="h-7 w-7 mx-auto text-primary mb-2" />
          <p className="text-3xl font-bold">{submissions.length}</p>
          <p className="text-xs text-muted-foreground">Envios completos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <UserCheck className="h-7 w-7 mx-auto text-primary mb-2" />
          <p className="text-3xl font-bold">{respondedCount}<span className="text-base text-muted-foreground">/{totalRespondents}</span></p>
          <p className="text-xs text-muted-foreground">Colaboradores que responderam</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <Users className="h-7 w-7 mx-auto text-primary mb-2" />
          <p className="text-3xl font-bold">{leadersEvaluated}<span className="text-base text-muted-foreground">/{leaders.length}</span></p>
          <p className="text-xs text-muted-foreground">Lideranças avaliadas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <Clock className="h-7 w-7 mx-auto text-primary mb-2" />
          <p className="text-2xl font-bold">{lastSubmission ? new Date(lastSubmission).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
          <p className="text-xs text-muted-foreground">Última resposta</p>
        </CardContent></Card>
      </div>

      {/* Progresso geral */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Progresso geral</CardTitle>
            <span className="text-xl font-bold">{responseRate}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={responseRate} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">{respondedCount} de {totalRespondents} colaboradores</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Avaliados (lideranças) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Lideranças avaliadas</CardTitle>
            <p className="text-xs text-muted-foreground">Quantas avaliações cada líder cadastrado recebeu</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {leaderStats.length === 0 && <p className="text-sm text-muted-foreground py-4">Nenhuma liderança cadastrada</p>}
            {leaderStats.map(l => (
              <div key={l.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{l.name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{l.type === 'company' ? 'Empresarial' : 'Departamento'}</Badge>
                  </div>
                  <Badge variant={l.count > 0 ? 'default' : 'secondary'} className="shrink-0">{l.count} {l.count === 1 ? 'avaliação' : 'avaliações'}</Badge>
                </div>
                <Progress value={l.pct} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linha do tempo</CardTitle>
            <p className="text-xs text-muted-foreground">Últimos envios</p>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
            {submissions.length === 0 && <p className="text-sm text-muted-foreground py-4">Nenhuma resposta ainda</p>}
            {submissions.slice(0, 15).map((s, i) => (
              <div key={i} className="flex items-start gap-2 pb-2 border-b last:border-0 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{s.evaluated_leader || s.company_leadership || 'Sem liderança'}</p>
                  {s.department && <p className="text-muted-foreground truncate">{s.department}</p>}
                  <p className="text-muted-foreground">{new Date(s.submitted_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Colaboradores (avaliadores) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">Colaboradores (avaliadores)</CardTitle>
              <p className="text-xs text-muted-foreground">Anonimato preservado — status estimado por grupo (departamento + líder)</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar nome, email, depto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
              </div>
            </div>
          </div>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="mt-2">
            <TabsList>
              <TabsTrigger value="all">Todos ({enrichedRespondents.length})</TabsTrigger>
              <TabsTrigger value="responded">Responderam ({respondedCount})</TabsTrigger>
              <TabsTrigger value="pending">Pendentes ({enrichedRespondents.length - respondedCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Líder do depto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Respondido em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRespondents.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name || '—'}</TableCell>
                  <TableCell className="text-xs">{r.email || '-'}</TableCell>
                  <TableCell>{r.department || '-'}</TableCell>
                  <TableCell>{r.department_leadership || '-'}</TableCell>
                  <TableCell>
                    {r.explicitlyResponded ? (
                      <Badge>Respondido</Badge>
                    ) : r.likelyResponded ? (
                      <Badge variant="default" className="bg-green-600 hover:bg-green-600">Provável</Badge>
                    ) : (
                      <Badge variant="secondary">Pendente</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.responded_at ? new Date(r.responded_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {filteredRespondents.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum colaborador encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
