import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, FileText, Trash2, ChevronRight } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  scale_min: number;
  scale_max: number;
  sections?: Section[];
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
  questions?: Question[];
}

interface Question {
  id: string;
  text: string;
  sort_order: number;
}

export default function Templates() {
  const [templates, setTemplates] = useState<Survey[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', scale_min: '1', scale_max: '5' });
  const [selectedTemplate, setSelectedTemplate] = useState<Survey | null>(null);
  const [newSection, setNewSection] = useState('');
  const [newQuestions, setNewQuestions] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const fetchTemplates = async () => {
    const { data: surveys } = await supabase.from('surveys').select('*').eq('is_template', true).order('created_at', { ascending: false });
    if (!surveys) return;

    const enriched = await Promise.all(surveys.map(async (s) => {
      const { data: sections } = await supabase.from('survey_sections').select('*').eq('survey_id', s.id).order('sort_order');
      const secs = await Promise.all((sections || []).map(async (sec) => {
        const { data: questions } = await supabase.from('survey_questions').select('*').eq('section_id', sec.id).order('sort_order');
        return { ...sec, questions: questions || [] };
      }));
      return { ...s, sections: secs };
    }));
    setTemplates(enriched);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const createTemplate = async () => {
    if (!form.title.trim()) { toast({ title: 'Insira um título', variant: 'destructive' }); return; }
    const { error } = await supabase.from('surveys').insert({
      title: form.title.trim(), description: form.description.trim() || null,
      is_template: true, scale_min: parseInt(form.scale_min), scale_max: parseInt(form.scale_max),
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    setOpen(false);
    setForm({ title: '', description: '', scale_min: '1', scale_max: '5' });
    fetchTemplates();
    toast({ title: 'Template criado' });
  };

  const addSection = async (surveyId: string) => {
    if (!newSection.trim()) return;
    const maxOrder = selectedTemplate?.sections?.length ?? 0;
    await supabase.from('survey_sections').insert({ survey_id: surveyId, title: newSection.trim(), sort_order: maxOrder });
    setNewSection('');
    fetchTemplates();
  };

  const addQuestion = async (sectionId: string) => {
    const text = newQuestions[sectionId]?.trim();
    if (!text) return;
    const section = selectedTemplate?.sections?.find(s => s.id === sectionId);
    const maxOrder = section?.questions?.length ?? 0;
    await supabase.from('survey_questions').insert({ section_id: sectionId, text, sort_order: maxOrder });
    setNewQuestions(q => ({ ...q, [sectionId]: '' }));
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Excluir este template?')) return;
    await supabase.from('surveys').delete().eq('id', id);
    if (selectedTemplate?.id === id) setSelectedTemplate(null);
    fetchTemplates();
    toast({ title: 'Template excluído' });
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from('survey_questions').delete().eq('id', id);
    fetchTemplates();
  };

  const deleteSection = async (id: string) => {
    await supabase.from('survey_sections').delete().eq('id', id);
    fetchTemplates();
  };

  useEffect(() => {
    if (selectedTemplate) {
      const updated = templates.find(t => t.id === selectedTemplate.id);
      if (updated) setSelectedTemplate(updated);
    }
  }, [templates]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates de Pesquisa</h1>
          <p className="text-muted-foreground">Crie modelos reutilizáveis de pesquisa</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo Template</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Template</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1"><label className="text-sm font-medium">Título</label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Pesquisa de Clima 2026" /></div>
              <div className="space-y-1"><label className="text-sm font-medium">Descrição</label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Pesquisa semestral..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Escala mínima</label>
                  <Select value={form.scale_min} onValueChange={v => setForm(f => ({ ...f, scale_min: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[0, 1].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Escala máxima</label>
                  <Select value={form.scale_max} onValueChange={v => setForm(f => ({ ...f, scale_max: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[5, 7, 10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <Button onClick={createTemplate} className="w-full">Criar Template</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        <div className="space-y-3">
          {templates.map(t => (
            <Card key={t.id} className={`cursor-pointer transition-all ${selectedTemplate?.id === t.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`} onClick={() => setSelectedTemplate(t)}>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">{t.title}</CardTitle>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          ))}
          {templates.length === 0 && <p className="text-muted-foreground text-center py-8 text-sm">Nenhum template criado.</p>}
        </div>

        {selectedTemplate ? (
          <Card>
            <CardHeader>
              <CardTitle>{selectedTemplate.title}</CardTitle>
              <p className="text-sm text-muted-foreground">Escala: {selectedTemplate.scale_min} a {selectedTemplate.scale_max}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={newSection} onChange={e => setNewSection(e.target.value)} placeholder="Nova seção (ex: Liderança Empresarial)" onKeyDown={e => e.key === 'Enter' && addSection(selectedTemplate.id)} />
                <Button onClick={() => addSection(selectedTemplate.id)} size="sm">Adicionar</Button>
              </div>

              <Accordion type="multiple" className="space-y-2">
                {selectedTemplate.sections?.map(sec => (
                  <AccordionItem key={sec.id} value={sec.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="text-sm font-medium">
                      <div className="flex items-center justify-between w-full mr-2">
                        <span>{sec.title}</span>
                        <span className="text-xs text-muted-foreground">{sec.questions?.length || 0} perguntas</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-4">
                      {sec.questions?.map((q, i) => (
                        <div key={q.id} className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground w-6">{i + 1}.</span>
                          <span className="flex-1">{q.text}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteQuestion(q.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Input value={newQuestions[sec.id] || ''} onChange={e => setNewQuestions(q => ({ ...q, [sec.id]: e.target.value }))} placeholder="Nova pergunta..." className="text-sm" onKeyDown={e => e.key === 'Enter' && addQuestion(sec.id)} />
                        <Button onClick={() => addQuestion(sec.id)} size="sm" variant="outline">+</Button>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteSection(sec.id)}>Excluir seção</Button>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione ou crie um template para editar</CardContent></Card>
        )}
      </div>
    </div>
  );
}
