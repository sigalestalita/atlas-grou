import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Play, Square, Trash2, Copy, Users, X } from 'lucide-react';

interface ContextType { company: { id: string } }

export default function SurveyConfig() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [surveys, setSurveys] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [newSection, setNewSection] = useState('');
  const [newQuestions, setNewQuestions] = useState<Record<string, string>>({});
  const [newLeader, setNewLeader] = useState('');
  const { toast } = useToast();

  const leaders: string[] = (() => {
    if (!selected?.leaders) return [];
    try {
      return typeof selected.leaders === 'string' ? JSON.parse(selected.leaders) : Array.isArray(selected.leaders) ? selected.leaders : [];
    } catch { return []; }
  })();

  const addLeader = async () => {
    if (!newLeader.trim() || !selected) return;
    const updated = [...leaders, newLeader.trim()];
    await supabase.from('surveys').update({ leaders: updated }).eq('id', selected.id);
    setSelected({ ...selected, leaders: updated });
    setNewLeader('');
    toast({ title: 'Liderança adicionada' });
  };

  const removeLeader = async (index: number) => {
    if (!selected) return;
    const updated = leaders.filter((_, i) => i !== index);
    await supabase.from('surveys').update({ leaders: updated }).eq('id', selected.id);
    setSelected({ ...selected, leaders: updated });
  };

  const load = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('surveys').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    setSurveys(data || []);
    if (data?.[0] && !selected) setSelected(data[0]);

    const { data: tmpl } = await supabase.from('surveys').select('*').eq('is_template', true);
    setTemplates(tmpl || []);
  };

  const loadSections = async () => {
    if (!selected) { setSections([]); return; }
    const { data: secs } = await supabase.from('survey_sections').select('*').eq('survey_id', selected.id).order('sort_order');
    const enriched = await Promise.all((secs || []).map(async s => {
      const { data: qs } = await supabase.from('survey_questions').select('*').eq('section_id', s.id).order('sort_order');
      return { ...s, questions: qs || [] };
    }));
    setSections(enriched);
  };

  useEffect(() => { load(); }, [companyId]);
  useEffect(() => { loadSections(); }, [selected?.id]);

  const createFromTemplate = async (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    const { data: newSurvey, error } = await supabase.from('surveys').insert({
      company_id: companyId, title: tmpl.title, description: tmpl.description,
      scale_min: tmpl.scale_min, scale_max: tmpl.scale_max, is_template: false,
    }).select().single();
    if (error || !newSurvey) { toast({ title: 'Erro', variant: 'destructive' }); return; }

    // Copy sections and questions
    const { data: tmplSections } = await supabase.from('survey_sections').select('*').eq('survey_id', templateId).order('sort_order');
    for (const sec of tmplSections || []) {
      const { data: newSec } = await supabase.from('survey_sections').insert({ survey_id: newSurvey.id, title: sec.title, sort_order: sec.sort_order }).select().single();
      if (!newSec) continue;
      const { data: tmplQs } = await supabase.from('survey_questions').select('*').eq('section_id', sec.id).order('sort_order');
      for (const q of tmplQs || []) {
        await supabase.from('survey_questions').insert({ section_id: newSec.id, text: q.text, sort_order: q.sort_order });
      }
    }
    await load();
    setSelected(newSurvey);
    toast({ title: 'Pesquisa criada a partir do template' });
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const newStatus = selected.status === 'active' ? 'closed' : selected.status === 'closed' ? 'draft' : 'active';
    await supabase.from('surveys').update({ status: newStatus }).eq('id', selected.id);
    setSelected({ ...selected, status: newStatus });
    load();
    toast({ title: `Pesquisa ${newStatus === 'active' ? 'ativada' : newStatus === 'closed' ? 'encerrada' : 'reaberta em rascunho'}` });
  };

  const addSection = async () => {
    if (!newSection.trim() || !selected) return;
    await supabase.from('survey_sections').insert({ survey_id: selected.id, title: newSection.trim(), sort_order: sections.length });
    setNewSection('');
    loadSections();
  };

  const addQuestion = async (sectionId: string) => {
    const text = newQuestions[sectionId]?.trim();
    if (!text) return;
    const sec = sections.find(s => s.id === sectionId);
    await supabase.from('survey_questions').insert({ section_id: sectionId, text, sort_order: sec?.questions?.length || 0 });
    setNewQuestions(q => ({ ...q, [sectionId]: '' }));
    loadSections();
  };

  const statusColors: Record<string, string> = { draft: 'bg-yellow-100 text-yellow-800', active: 'bg-green-100 text-green-800', closed: 'bg-gray-100 text-gray-800' };
  const statusLabels: Record<string, string> = { draft: 'Rascunho', active: 'Ativa', closed: 'Encerrada' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold">Pesquisa</h2>
        {templates.length > 0 && (
          <Select onValueChange={createFromTemplate}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Criar a partir de template..." /></SelectTrigger>
            <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {surveys.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {surveys.map(s => (
            <Button key={s.id} variant={selected?.id === s.id ? 'default' : 'outline'} size="sm" onClick={() => setSelected(s)}>
              {s.title}
              <Badge className={`ml-2 text-xs ${statusColors[s.status]}`}>{statusLabels[s.status]}</Badge>
            </Button>
          ))}
        </div>
      )}

      {selected && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{selected.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Escala: {selected.scale_min} a {selected.scale_max}</p>
            </div>
            <Button onClick={toggleStatus} variant={selected.status === 'active' ? 'destructive' : 'default'} size="sm">
              {selected.status === 'active' ? <><Square className="mr-2 h-4 w-4" />Encerrar</> : <><Play className="mr-2 h-4 w-4" />Ativar</>}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input value={newSection} onChange={e => setNewSection(e.target.value)} placeholder="Nova seção..." onKeyDown={e => e.key === 'Enter' && addSection()} />
              <Button onClick={addSection} size="sm">Adicionar Seção</Button>
            </div>
            <Accordion type="multiple" className="space-y-2">
              {sections.map(sec => (
                <AccordionItem key={sec.id} value={sec.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="text-sm font-medium">
                    <div className="flex justify-between w-full mr-2"><span>{sec.title}</span><span className="text-xs text-muted-foreground">{sec.questions?.length || 0} perguntas</span></div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    {sec.questions?.map((q: any, i: number) => (
                      <div key={q.id} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-6">{i + 1}.</span>
                        <span className="flex-1">{q.text}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => { await supabase.from('survey_questions').delete().eq('id', q.id); loadSections(); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input value={newQuestions[sec.id] || ''} onChange={e => setNewQuestions(q => ({ ...q, [sec.id]: e.target.value }))} placeholder="Nova pergunta..." className="text-sm" onKeyDown={e => e.key === 'Enter' && addQuestion(sec.id)} />
                      <Button onClick={() => addQuestion(sec.id)} size="sm" variant="outline">+</Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {surveys.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione um template acima para criar sua pesquisa</CardContent></Card>}
    </div>
  );
}
