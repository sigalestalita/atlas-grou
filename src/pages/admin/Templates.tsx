import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, FileText, Trash2, ChevronRight, GripVertical, Settings2, Copy, X, MessageSquare, ListChecks, BarChart3, Type } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  scale_min: number;
  scale_max: number;
  scale_labels: string[] | null;
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
  question_type: string;
  scale_type: string | null;
  has_justification: boolean;
  justification_prompt: string | null;
  options: any;
}

const QUESTION_TYPES = [
  { value: 'scale', label: 'Escala', icon: BarChart3, description: 'Resposta em escala numérica' },
  { value: 'text', label: 'Texto Livre', icon: Type, description: 'Resposta aberta em texto' },
  { value: 'multiple_choice', label: 'Múltipla Escolha', icon: ListChecks, description: 'Selecionar várias opções' },
  { value: 'single_choice', label: 'Escolha Única', icon: MessageSquare, description: 'Selecionar uma opção' },
];

const SCALE_TYPES = [
  { value: 'avaliacao', label: 'Avaliação', example: '1=Péssimo … 5=Excelente' },
  { value: 'concordancia', label: 'Concordância', example: '1=Discordo totalmente … 5=Concordo totalmente' },
  { value: 'frequencia', label: 'Frequência', example: '1=Nunca … 5=Sempre' },
  { value: 'satisfacao', label: 'Satisfação', example: '1=Muito insatisfeito … 5=Muito satisfeito' },
  { value: 'probabilidade', label: 'Probabilidade', example: '0=Nada provável … 10=Extremamente provável' },
];

export default function Templates() {
  const [templates, setTemplates] = useState<Survey[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', scale_min: '1', scale_max: '5' });
  const [selectedTemplate, setSelectedTemplate] = useState<Survey | null>(null);
  const [newSection, setNewSection] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const { toast } = useToast();

  // New question form per section
  const [questionForms, setQuestionForms] = useState<Record<string, {
    text: string;
    question_type: string;
    scale_type: string;
    has_justification: boolean;
    justification_prompt: string;
    options: string[];
  }>>({});

  const getQuestionForm = (sectionId: string) => questionForms[sectionId] || {
    text: '', question_type: 'scale', scale_type: 'avaliacao',
    has_justification: false, justification_prompt: '', options: [''],
  };

  const updateQuestionForm = (sectionId: string, updates: any) => {
    setQuestionForms(prev => ({
      ...prev,
      [sectionId]: { ...getQuestionForm(sectionId), ...updates },
    }));
  };

  const fetchTemplates = async () => {
    const { data: surveys } = await supabase.from('surveys').select('*').eq('is_template', true).order('created_at', { ascending: false });
    if (!surveys) return;

    const enriched = await Promise.all(surveys.map(async (s) => {
      const { data: sections } = await supabase.from('survey_sections').select('*').eq('survey_id', s.id).order('sort_order');
      const secs = await Promise.all((sections || []).map(async (sec) => {
        const { data: questions } = await supabase.from('survey_questions').select('*').eq('section_id', sec.id).order('sort_order');
        return { ...sec, questions: questions || [] };
      }));
      const scaleLabels = s.scale_labels ? (typeof s.scale_labels === 'string' ? JSON.parse(s.scale_labels) : s.scale_labels) : null;
      return { ...s, scale_labels: scaleLabels, sections: secs };
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
    const form = getQuestionForm(sectionId);
    if (!form.text.trim()) return;

    const section = selectedTemplate?.sections?.find(s => s.id === sectionId);
    const maxOrder = section?.questions?.length ?? 0;

    const insertData: any = {
      section_id: sectionId,
      text: form.text.trim(),
      sort_order: maxOrder,
      question_type: form.question_type,
      has_justification: form.has_justification,
      justification_prompt: form.has_justification && form.justification_prompt.trim() ? form.justification_prompt.trim() : null,
    };

    if (form.question_type === 'scale') {
      insertData.scale_type = form.scale_type;
    }

    if (['multiple_choice', 'single_choice'].includes(form.question_type)) {
      const validOptions = form.options.filter(o => o.trim());
      if (validOptions.length < 2) {
        toast({ title: 'Adicione pelo menos 2 opções', variant: 'destructive' });
        return;
      }
      insertData.options = validOptions;
    }

    await supabase.from('survey_questions').insert(insertData);
    setQuestionForms(prev => {
      const copy = { ...prev };
      delete copy[sectionId];
      return copy;
    });
    fetchTemplates();
  };

  const updateQuestion = async (questionId: string, updates: any) => {
    await supabase.from('survey_questions').update(updates).eq('id', questionId);
    fetchTemplates();
    toast({ title: 'Pergunta atualizada' });
    setEditingQuestion(null);
  };

  const duplicateQuestion = async (question: Question, sectionId: string) => {
    const section = selectedTemplate?.sections?.find(s => s.id === sectionId);
    await supabase.from('survey_questions').insert({
      section_id: sectionId,
      text: question.text + ' (cópia)',
      sort_order: (section?.questions?.length ?? 0),
      question_type: question.question_type,
      scale_type: question.scale_type,
      has_justification: question.has_justification,
      justification_prompt: question.justification_prompt,
      options: question.options,
    });
    fetchTemplates();
    toast({ title: 'Pergunta duplicada' });
  };

  const duplicateSection = async (section: Section) => {
    if (!selectedTemplate) return;
    const { data: newSec } = await supabase.from('survey_sections').insert({
      survey_id: selectedTemplate.id,
      title: section.title + ' (cópia)',
      sort_order: (selectedTemplate.sections?.length ?? 0),
    }).select().single();
    if (!newSec) return;
    for (const q of section.questions || []) {
      await supabase.from('survey_questions').insert({
        section_id: newSec.id, text: q.text, sort_order: q.sort_order,
        question_type: q.question_type, scale_type: q.scale_type,
        has_justification: q.has_justification, justification_prompt: q.justification_prompt,
        options: q.options,
      });
    }
    fetchTemplates();
    toast({ title: 'Seção duplicada' });
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

  const updateTemplateSettings = async (updates: any) => {
    if (!selectedTemplate) return;
    await supabase.from('surveys').update(updates).eq('id', selectedTemplate.id);
    fetchTemplates();
    toast({ title: 'Template atualizado' });
  };

  useEffect(() => {
    if (selectedTemplate) {
      const updated = templates.find(t => t.id === selectedTemplate.id);
      if (updated) setSelectedTemplate(updated);
    }
  }, [templates]);

  const questionTypeIcon = (type: string) => {
    const t = QUESTION_TYPES.find(qt => qt.value === type);
    return t ? <t.icon className="h-3.5 w-3.5" /> : null;
  };

  const questionTypeLabel = (type: string) => QUESTION_TYPES.find(qt => qt.value === type)?.label || type;

  const renderQuestionForm = (sectionId: string) => {
    const form = getQuestionForm(sectionId);
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Texto da pergunta</Label>
            <Textarea
              value={form.text}
              onChange={e => updateQuestionForm(sectionId, { text: e.target.value })}
              placeholder="Ex: Como você avalia a comunicação da sua liderança?"
              className="text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tipo de pergunta</Label>
              <Select value={form.question_type} onValueChange={v => updateQuestionForm(sectionId, { question_type: v })}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map(qt => (
                    <SelectItem key={qt.value} value={qt.value}>
                      <div className="flex items-center gap-2">
                        <qt.icon className="h-4 w-4" />
                        <div>
                          <div>{qt.label}</div>
                          <div className="text-xs text-muted-foreground">{qt.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.question_type === 'scale' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de escala</Label>
                <Select value={form.scale_type} onValueChange={v => updateQuestionForm(sectionId, { scale_type: v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCALE_TYPES.map(st => (
                      <SelectItem key={st.value} value={st.value}>
                        <div>
                          <div>{st.label}</div>
                          <div className="text-xs text-muted-foreground">{st.example}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {['multiple_choice', 'single_choice'].includes(form.question_type) && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Opções</Label>
              {form.options.map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                  <Input
                    value={opt}
                    onChange={e => {
                      const newOpts = [...form.options];
                      newOpts[i] = e.target.value;
                      updateQuestionForm(sectionId, { options: newOpts });
                    }}
                    placeholder={`Opção ${i + 1}`}
                    className="text-sm"
                  />
                  {form.options.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                      updateQuestionForm(sectionId, { options: form.options.filter((_, j) => j !== i) });
                    }}><X className="h-3 w-3" /></Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => updateQuestionForm(sectionId, { options: [...form.options, ''] })}>
                <Plus className="h-3 w-3 mr-1" />Adicionar opção
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.has_justification}
                  onCheckedChange={v => updateQuestionForm(sectionId, { has_justification: v })}
                  id={`just-${sectionId}`}
                />
                <Label htmlFor={`just-${sectionId}`} className="text-sm">Pedir justificativa</Label>
              </div>
            </div>
            <Button onClick={() => addQuestion(sectionId)} size="sm">
              <Plus className="h-4 w-4 mr-1" />Adicionar Pergunta
            </Button>
          </div>

          {form.has_justification && (
            <Input
              value={form.justification_prompt}
              onChange={e => updateQuestionForm(sectionId, { justification_prompt: e.target.value })}
              placeholder="Texto do campo de justificativa (ex: Por quê?)"
              className="text-sm"
            />
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title="Templates"
        description="Modelos de questionário reaproveitáveis. Cada empresa nasce de um deles e ajusta o que precisar."
        actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="h-9 rounded-xl"><Plus className="mr-2 h-4 w-4" />Novo template</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Template</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1"><Label>Título</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Pesquisa de Clima 2026" /></div>
              <div className="space-y-1"><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Pesquisa semestral de clima organizacional..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Escala mínima</Label>
                  <Select value={form.scale_min} onValueChange={v => setForm(f => ({ ...f, scale_min: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[0, 1].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1">
                  <Label>Escala máxima</Label>
                  <Select value={form.scale_max} onValueChange={v => setForm(f => ({ ...f, scale_max: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[5, 7, 10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <Button onClick={createTemplate} className="w-full">Criar Template</Button>
            </div>
          </DialogContent>
        </Dialog>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
        <div className="space-y-3">
          {templates.map(t => (
            <Card key={t.id} className={`cursor-pointer rounded-[18px] transition-all ${selectedTemplate?.id === t.id ? 'ring-2 ring-primary' : 'card-hover-glow'}`} onClick={() => setSelectedTemplate(t)}>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">{t.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {t.sections?.length || 0} seções · {t.sections?.reduce((acc, s) => acc + (s.questions?.length || 0), 0) || 0} perguntas
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          ))}
          {templates.length === 0 && <p className="text-muted-foreground text-center py-8 text-sm">Nenhum template criado.</p>}
        </div>

        {selectedTemplate ? (
          <div className="space-y-4">
            {/* Template header & settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selectedTemplate.title}</CardTitle>
                    <CardDescription>{selectedTemplate.description || 'Sem descrição'}</CardDescription>
                  </div>
                  <Badge variant="outline">Escala {selectedTemplate.scale_min}–{selectedTemplate.scale_max}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input value={newSection} onChange={e => setNewSection(e.target.value)} placeholder="Nova seção (ex: Liderança, Comunicação, Bem-estar)" onKeyDown={e => e.key === 'Enter' && addSection(selectedTemplate.id)} />
                  <Button onClick={() => addSection(selectedTemplate.id)} size="sm"><Plus className="h-4 w-4 mr-1" />Seção</Button>
                </div>
              </CardContent>
            </Card>

            {/* Sections */}
            <Accordion type="multiple" className="space-y-3" defaultValue={selectedTemplate.sections?.map(s => s.id)}>
              {selectedTemplate.sections?.map(sec => (
                <AccordionItem key={sec.id} value={sec.id} className="border rounded-lg bg-card">
                  <AccordionTrigger className="px-4 text-sm font-medium hover:no-underline">
                    <div className="flex items-center justify-between w-full mr-2">
                      <span className="font-semibold">{sec.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{sec.questions?.length || 0} perguntas</Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-3">
                    {/* Existing questions */}
                    {sec.questions?.map((q: Question, i: number) => (
                      <div key={q.id} className="group border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground text-sm w-6 shrink-0 pt-0.5">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">{q.text}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge variant="outline" className="text-xs gap-1">
                                {questionTypeIcon(q.question_type)}
                                {questionTypeLabel(q.question_type)}
                              </Badge>
                              {q.question_type === 'scale' && q.scale_type && (
                                <Badge variant="outline" className="text-xs">
                                  {SCALE_TYPES.find(st => st.value === q.scale_type)?.label || q.scale_type}
                                </Badge>
                              )}
                              {q.has_justification && (
                                <Badge variant="outline" className="text-xs text-primary">Justificativa</Badge>
                              )}
                              {['multiple_choice', 'single_choice'].includes(q.question_type) && q.options && (
                                <span className="text-xs text-muted-foreground">
                                  {Array.isArray(q.options) ? q.options.length : 0} opções
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateQuestion(q, sec.id)} title="Duplicar">
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteQuestion(q.id)} title="Excluir">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* New question form */}
                    {renderQuestionForm(sec.id)}

                    {/* Section actions */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Button variant="ghost" size="sm" onClick={() => duplicateSection(sec)}>
                        <Copy className="h-3 w-3 mr-1" />Duplicar seção
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteSection(sec.id)}>
                        <Trash2 className="h-3 w-3 mr-1" />Excluir seção
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {(!selectedTemplate.sections || selectedTemplate.sections.length === 0) && (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Adicione seções para começar a montar o template</CardContent></Card>
            )}
          </div>
        ) : (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione ou crie um template para editar</CardContent></Card>
        )}
      </div>
    </>
  );
}
