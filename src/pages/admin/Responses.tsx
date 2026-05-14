import { useEffect, useState, useCallback, useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Radio, Search, Users, MessageSquare } from 'lucide-react';

interface ContextType { company: { id: string } }

interface ResponseRow {
  id: string;
  question_id: string;
  value: number | null;
  text_value: string | null;
  submitted_at: string;
  evaluated_leader: string | null;
  department: string | null;
  company_leadership: string | null;
  department_leadership: string | null;
}

interface QuestionMeta {
  id: string;
  text: string;
  question_type: string;
  section_title: string;
  section_type: string;
}

export default function Responses() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [survey, setSurvey] = useState<any>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [questions, setQuestions] = useState<Record<string, QuestionMeta>>({});
  const [respondents, setRespondents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [liveBadge, setLiveBadge] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: surveys } = await supabase
      .from('surveys')
      .select('*')
      .eq('company_id', companyId)
      .neq('status', 'draft')
      .limit(1);
    const s = surveys?.[0];
    setSurvey(s);
    if (!s) return;

    const [respRes, qRes, respondRes] = await Promise.all([
      supabase.from('survey_responses').select('*').eq('survey_id', s.id).order('submitted_at', { ascending: false }),
      supabase.from('survey_sections').select('id, title, section_type, survey_questions(id, text, question_type)').eq('survey_id', s.id),
      supabase.from('respondents').select('*').eq('survey_id', s.id).order('responded_at', { ascending: false, nullsFirst: false }),
    ]);

    setResponses((respRes.data || []) as ResponseRow[]);
    setRespondents(respondRes.data || []);

    const qMap: Record<string, QuestionMeta> = {};
    (qRes.data || []).forEach((sec: any) => {
      (sec.survey_questions || []).forEach((q: any) => {
        qMap[q.id] = {
          id: q.id,
          text: q.text,
          question_type: q.question_type,
          section_title: sec.title,
          section_type: sec.section_type,
        };
      });
    });
    setQuestions(qMap);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!survey?.id) return;
    const channel = supabase
      .channel(`responses-${survey.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_responses', filter: `survey_id=eq.${survey.id}` }, (payload) => {
        setResponses((prev) => [payload.new as ResponseRow, ...prev]);
        setLiveBadge(true);
        setTimeout(() => setLiveBadge(false), 2000);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'respondents', filter: `survey_id=eq.${survey.id}` }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [survey?.id, load]);

  // Group responses into submissions (one submission = one set of answers sharing submitted_at + leader/dept)
  const submissions = useMemo(() => {
    const map = new Map<string, ResponseRow[]>();
    responses.forEach(r => {
      const key = `${r.submitted_at}__${r.evaluated_leader || ''}__${r.department || ''}__${r.company_leadership || ''}__${r.department_leadership || ''}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        submitted_at: items[0].submitted_at,
        evaluated_leader: items[0].evaluated_leader,
        department: items[0].department,
        company_leadership: items[0].company_leadership,
        department_leadership: items[0].department_leadership,
        items,
      }))
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  }, [responses]);

  const filteredSubmissions = useMemo(() => {
    if (!search.trim()) return submissions;
    const q = search.toLowerCase();
    return submissions.filter(s =>
      (s.evaluated_leader || '').toLowerCase().includes(q) ||
      (s.department || '').toLowerCase().includes(q) ||
      (s.company_leadership || '').toLowerCase().includes(q) ||
      s.items.some(i => (i.text_value || '').toLowerCase().includes(q))
    );
  }, [submissions, search]);

  const filteredRespondents = useMemo(() => {
    if (!search.trim()) return respondents;
    const q = search.toLowerCase();
    return respondents.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.department || '').toLowerCase().includes(q) ||
      (r.company_leadership || '').toLowerCase().includes(q)
    );
  }, [respondents, search]);

  if (!survey) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma pesquisa ativa</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            Respostas em tempo real
            <Badge variant={liveBadge ? 'default' : 'outline'} className="gap-1">
              <Radio className={`h-3 w-3 ${liveBadge ? 'animate-pulse' : ''}`} />
              {liveBadge ? 'Nova resposta!' : 'Ao vivo'}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">{submissions.length} envios • {responses.length} respostas individuais</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar liderança, depto, texto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6 text-center">
          <MessageSquare className="h-7 w-7 mx-auto text-primary mb-2" />
          <p className="text-3xl font-bold">{submissions.length}</p>
          <p className="text-sm text-muted-foreground">Envios completos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <Users className="h-7 w-7 mx-auto text-primary mb-2" />
          <p className="text-3xl font-bold">{respondents.filter(r => r.status === 'responded').length}<span className="text-base text-muted-foreground">/{respondents.length}</span></p>
          <p className="text-sm text-muted-foreground">Colaboradores responderam</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <Radio className="h-7 w-7 mx-auto text-primary mb-2" />
          <p className="text-3xl font-bold">{submissions[0] ? new Date(submissions[0].submitted_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
          <p className="text-sm text-muted-foreground">Última resposta</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="answers">
        <TabsList>
          <TabsTrigger value="answers">Respostas recebidas</TabsTrigger>
          <TabsTrigger value="who">Quem respondeu</TabsTrigger>
        </TabsList>

        <TabsContent value="answers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Envios ({filteredSubmissions.length})</CardTitle>
              <p className="text-xs text-muted-foreground">As respostas são anônimas — não é possível vincular ao respondente. Clique para expandir.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {filteredSubmissions.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">Nenhuma resposta ainda</p>
              )}
              {filteredSubmissions.map(sub => (
                <Collapsible key={sub.key} className="border rounded-md">
                  <CollapsibleTrigger className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 text-left">
                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform data-[state=open]:rotate-90" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {sub.evaluated_leader || sub.company_leadership || sub.department || 'Resposta'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[sub.department, sub.department_leadership].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">{sub.items.length} resp.</Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{new Date(sub.submitted_at).toLocaleString('pt-BR')}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 pt-2 space-y-3 border-t bg-muted/20">
                      {sub.items.map(item => {
                        const q = questions[item.question_id];
                        return (
                          <div key={item.id} className="text-sm">
                            <p className="text-xs text-muted-foreground">{q?.section_title || '—'}</p>
                            <p className="font-medium">{q?.text || 'Pergunta removida'}</p>
                            <p className="mt-1">
                              {item.value !== null && (
                                <Badge variant="outline" className="mr-2">Nota {item.value}</Badge>
                              )}
                              {item.text_value && <span className="italic">"{item.text_value}"</span>}
                              {item.value === null && !item.text_value && <span className="text-muted-foreground">(sem resposta)</span>}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="who" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Lid. Empresarial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Respondido em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRespondents.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name || '—'}</TableCell>
                      <TableCell>{r.email || '-'}</TableCell>
                      <TableCell>{r.department || '-'}</TableCell>
                      <TableCell>{r.company_leadership || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'responded' ? 'default' : 'secondary'}>
                          {r.status === 'responded' ? 'Respondido' : 'Pendente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.responded_at ? new Date(r.responded_at).toLocaleString('pt-BR') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRespondents.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum colaborador</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
