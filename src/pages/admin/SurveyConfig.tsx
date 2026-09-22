import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, CalendarClock, Globe, Play, Plus, Square, Trash2, UserCheck,
  Users, X, FileText, Layers, Info,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { NEW_COLUMNS, writeCompat } from "@/lib/dbCompat";

interface ContextType { company: { id: string } }
interface Leader { name: string; type: "company" | "department"; hidden?: boolean }

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  active: { label: "No ar", className: "bg-[hsl(var(--success))] text-white" },
  closed: { label: "Encerrada", className: "bg-secondary text-secondary-foreground" },
};

/** `datetime-local` quer "YYYY-MM-DDTHH:mm" na hora local, não ISO em UTC. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SurveyConfig() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [newSection, setNewSection] = useState("");
  const [newQuestions, setNewQuestions] = useState<Record<string, string>>({});
  const [newLeader, setNewLeader] = useState("");
  const [newLeaderType, setNewLeaderType] = useState<"company" | "department">("company");

  const leaders: Leader[] = useMemo(() => {
    if (!selected?.leaders) return [];
    try {
      const raw = Array.isArray(selected.leaders) ? selected.leaders : [];
      return raw.map((l: any) => (typeof l === "string" ? { name: l, type: "company" as const } : l));
    } catch { return []; }
  }, [selected]);

  const load = useCallback(async () => {
    if (!companyId) return;
    const [{ data }, { data: tmpl }] = await Promise.all([
      supabase.from("surveys").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("surveys").select("*").eq("is_template", true),
    ]);
    setSurveys(data || []);
    setTemplates(tmpl || []);
    setSelected((cur: any) => (cur ? (data || []).find((s) => s.id === cur.id) ?? data?.[0] ?? null : data?.[0] ?? null));
    setLoading(false);
  }, [companyId]);

  const loadSections = useCallback(async () => {
    if (!selected?.id) { setSections([]); return; }
    const { data: secs } = await supabase
      .from("survey_sections").select("*").eq("survey_id", selected.id).order("sort_order");
    if (!secs?.length) { setSections([]); return; }
    // Uma consulta para todas as perguntas, não uma por seção.
    const { data: qs } = await supabase
      .from("survey_questions").select("*")
      .in("section_id", secs.map((s) => s.id)).order("sort_order");
    setSections(secs.map((s) => ({ ...s, questions: (qs || []).filter((q) => q.section_id === s.id) })));
  }, [selected?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSections(); }, [loadSections]);

  const patchSurvey = async (patch: Record<string, unknown>, message?: string) => {
    if (!selected) return;
    setSelected({ ...selected, ...patch });
    // Prazo e rodada vêm da migração mais nova; enquanto ela não roda, o
    // adaptador salva o resto em vez de recusar a gravação inteira.
    const { error, dropped } = await writeCompat(patch, [...NEW_COLUMNS.surveys],
      (body) => supabase.from("surveys").update(body as never).eq("id", selected.id));
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      load();
      return;
    }
    if (dropped.length) {
      // Dizer que salvou seria mentira: o campo existe na tela, mas ainda não
      // no banco. Some quando a atualização do banco for aplicada.
      toast({
        title: "Este campo ainda não pode ser salvo",
        description:
          "Prazo e rodada dependem de uma atualização do banco que ainda não foi aplicada. " +
          "O resto da configuração foi salvo normalmente.",
        variant: "destructive",
      });
      load();
      return;
    }
    if (message) toast({ title: message });
    setSurveys((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
  };

  const createFromTemplate = async (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    const { data: created, error } = await supabase.from("surveys").insert({
      company_id: companyId, title: tmpl.title, description: tmpl.description,
      scale_min: tmpl.scale_min, scale_max: tmpl.scale_max,
      scale_labels: tmpl.scale_labels, is_template: false,
    }).select().single();
    if (error || !created) {
      toast({ title: "Não foi possível criar", description: error?.message, variant: "destructive" });
      return;
    }

    const { data: tmplSections } = await supabase
      .from("survey_sections").select("*").eq("survey_id", templateId).order("sort_order");

    for (const sec of tmplSections || []) {
      const { data: newSec } = await supabase.from("survey_sections").insert({
        survey_id: created.id, title: sec.title, sort_order: sec.sort_order,
        section_type: (sec as any).section_type || "organization",
      } as never).select().single();
      if (!newSec) continue;
      const { data: tmplQs } = await supabase
        .from("survey_questions").select("*").eq("section_id", sec.id).order("sort_order");
      if (tmplQs?.length) {
        // Copia o tipo, a escala e a justificativa junto. Antes só o texto vinha,
        // então um template com eNPS e pergunta aberta virava tudo escala padrão.
        await supabase.from("survey_questions").insert(
          tmplQs.map((q) => ({
            section_id: newSec.id, text: q.text, sort_order: q.sort_order,
            question_type: q.question_type, scale_type: q.scale_type, options: q.options,
            has_justification: q.has_justification, justification_prompt: q.justification_prompt,
          })) as never,
        );
      }
    }
    await load();
    setSelected(created);
    toast({ title: "Pesquisa criada a partir do template" });
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const next = selected.status === "active" ? "closed" : "active";
    await patchSurvey(
      { status: next },
      next === "active" ? "Pesquisa no ar" : "Pesquisa encerrada",
    );
  };

  const addSection = async () => {
    if (!newSection.trim() || !selected) return;
    await supabase.from("survey_sections").insert({
      survey_id: selected.id, title: newSection.trim(), sort_order: sections.length,
    });
    setNewSection("");
    loadSections();
  };

  const addQuestion = async (sectionId: string) => {
    const text = (newQuestions[sectionId] || "").trim();
    if (!text) return;
    const sec = sections.find((s) => s.id === sectionId);
    await supabase.from("survey_questions").insert({
      section_id: sectionId, text, sort_order: sec?.questions?.length || 0,
    });
    setNewQuestions((q) => ({ ...q, [sectionId]: "" }));
    loadSections();
  };

  const saveLeaders = async (updated: Leader[]) => {
    if (!selected) return;
    await patchSurvey({ leaders: updated as never });
  };

  const addLeader = async () => {
    const name = newLeader.trim();
    if (!name || !selected) return;
    if (leaders.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Essa liderança já está na lista", variant: "destructive" });
      return;
    }
    await saveLeaders([...leaders, { name, type: newLeaderType }]);
    setNewLeader("");
    toast({ title: "Liderança adicionada" });
  };

  const totalQuestions = sections.reduce((acc, s) => acc + (s.questions?.length || 0), 0);
  const leadershipQuestions = sections
    .filter((s) => s.section_type === "leadership")
    .reduce((acc, s) => acc + (s.questions?.length || 0), 0);
  const companyLeaders = leaders.filter((l) => l.type === "company");
  const deptLeaders = leaders.filter((l) => l.type === "department");

  /**
   * Quanto tempo a pesquisa leva de verdade.
   *
   * A conta não é "número de perguntas": as seções de liderança se repetem uma
   * vez por líder avaliado. Um bloco de 8 perguntas com 3 líderes são 24
   * respostas, não 8 — e é por isso que pesquisa "curta" às vezes leva meia
   * hora e as pessoas abandonam no meio.
   */
  const estimate = useMemo(() => {
    const orgQ = totalQuestions - leadershipQuestions;
    const roundsOfLeadership = companyLeaders.length + (deptLeaders.length > 0 ? 1 : 0);
    const total = orgQ + leadershipQuestions * roundsOfLeadership;
    return { total, minutes: Math.max(1, Math.round((total * 14) / 60)), roundsOfLeadership };
  }, [totalQuestions, leadershipQuestions, companyLeaders.length, deptLeaders.length]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-52 rounded-[22px]" />
        <Skeleton className="h-72 rounded-[22px]" />
      </div>
    );
  }

  if (!surveys.length) {
    return (
      <>
        <PageHeader title="Pesquisa" description="Monte o questionário, defina as lideranças e coloque no ar." />
        <EmptyState
          icon={FileText}
          title="Nenhuma pesquisa criada"
          description="Comece a partir de um template pronto — depois é só ajustar as perguntas."
          action={
            templates.length > 0 ? (
              <Select onValueChange={createFromTemplate}>
                <SelectTrigger className="h-10 w-72 rounded-xl">
                  <SelectValue placeholder="Escolher um template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum template disponível ainda.</p>
            )
          }
        />
      </>
    );
  }

  const status = STATUS_META[selected?.status] ?? STATUS_META.draft;

  return (
    <>
      <PageHeader
        title="Pesquisa"
        description="Monte o questionário, defina as lideranças avaliadas e controle o prazo."
        actions={
          templates.length > 0 ? (
            <Select onValueChange={createFromTemplate}>
              <SelectTrigger className="h-9 w-60 rounded-xl">
                <SelectValue placeholder="Nova a partir de template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {surveys.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {surveys.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors ${
                selected?.id === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              {s.title}
              <Badge className={`rounded-full border-0 px-1.5 text-[10px] ${STATUS_META[s.status]?.className ?? ""}`}>
                {STATUS_META[s.status]?.label}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-5">
          {/* Situação e prazo */}
          <Card className="rounded-[22px]">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{selected.title}</CardTitle>
                    <Badge className={`rounded-full border-0 ${status.className}`}>{status.label}</Badge>
                  </div>
                  <CardDescription className="mt-1">
                    Escala de {selected.scale_min} a {selected.scale_max} · {totalQuestions}{" "}
                    {totalQuestions === 1 ? "pergunta" : "perguntas"} em {sections.length}{" "}
                    {sections.length === 1 ? "categoria" : "categorias"}
                  </CardDescription>
                </div>

                {selected.status === "active" ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="h-9 rounded-xl">
                        <Square className="mr-2 h-4 w-4" />Encerrar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Encerrar a pesquisa?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Os links param de aceitar resposta na hora. Quem estiver respondendo
                          neste momento não conseguirá enviar. Os resultados continuam disponíveis.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="rounded-xl" onClick={toggleStatus}>Encerrar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button className="h-9 rounded-xl" onClick={toggleStatus}>
                    <Play className="mr-2 h-4 w-4" />Colocar no ar
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium">Abre em</label>
                  <Input
                    type="datetime-local"
                    className="h-10 rounded-xl"
                    value={toLocalInput(selected.opens_at)}
                    onChange={(e) => setSelected({ ...selected, opens_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    onBlur={() => patchSurvey({ opens_at: selected.opens_at }, "Data de abertura salva")}
                  />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">Vazio: abre assim que você colocar no ar.</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium">Fecha em</label>
                  <Input
                    type="datetime-local"
                    className="h-10 rounded-xl"
                    value={toLocalInput(selected.closes_at)}
                    onChange={(e) => setSelected({ ...selected, closes_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    onBlur={() => patchSurvey({ closes_at: selected.closes_at }, "Prazo salvo")}
                  />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Depois dessa hora o link mostra "pesquisa encerrada". Vazio: sem prazo.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium">Rodada</label>
                  <Input
                    className="h-10 rounded-xl"
                    placeholder="Ex.: 2026.1"
                    value={selected.wave_label ?? ""}
                    onChange={(e) => setSelected({ ...selected, wave_label: e.target.value })}
                    onBlur={() => patchSurvey({ wave_label: selected.wave_label || null })}
                  />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Nomear a rodada é o que permite comparar este ciclo com o anterior.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-border bg-accent/50 p-3.5">
                  <Switch
                    checked={!!selected.open_access}
                    onCheckedChange={(v) => patchSurvey({ open_access: v }, v ? "Link aberto ativado" : "Link aberto desativado")}
                  />
                  <div>
                    <label className="flex items-center gap-1.5 text-[13px] font-medium">
                      <Globe className="h-3.5 w-3.5" />Link aberto
                    </label>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                      Um link só para todo mundo, sem cadastrar ninguém. Em troca, não há taxa de
                      resposta nem lembrete — não dá para saber quem falta.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium">Texto de abertura</label>
                <Textarea
                  className="min-h-[88px] rounded-xl text-sm"
                  placeholder="Ex.: Suas respostas são anônimas e vão orientar as decisões do próximo semestre."
                  value={selected.intro_text ?? selected.description ?? ""}
                  onChange={(e) => setSelected({ ...selected, intro_text: e.target.value })}
                  onBlur={() => patchSurvey({ intro_text: selected.intro_text }, "Texto salvo")}
                />
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  É a primeira coisa que o colaborador lê. Dizer para que servem as respostas
                  costuma render mais participação do que insistir no anonimato.
                </p>
              </div>

              {estimate.total > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-[13px] leading-relaxed">
                    Quem responde encara <strong>{estimate.total} perguntas</strong>, cerca de{" "}
                    <strong>{estimate.minutes} min</strong>.
                    {estimate.roundsOfLeadership > 1 && (
                      <>
                        {" "}As {leadershipQuestions} perguntas de liderança se repetem{" "}
                        {estimate.roundsOfLeadership} vezes, uma por líder avaliado.
                      </>
                    )}
                    {estimate.minutes > 12 && (
                      <span className="text-[hsl(var(--climate-low))]">
                        {" "}Acima de 12 min o abandono sobe bastante — vale enxugar.
                      </span>
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Questionário */}
          <Card className="rounded-[22px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-primary" />Questionário
              </CardTitle>
              <CardDescription>
                Categorias e perguntas. Uma categoria marcada como "de liderança" é repetida
                para cada líder que a pessoa avalia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sections.length > 0 ? (
                <Accordion type="multiple" className="space-y-2">
                  {sections.map((sec) => (
                    <AccordionItem key={sec.id} value={sec.id} className="rounded-xl border border-border px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-1 items-center gap-2.5 pr-3 text-left">
                          <span className="text-[14px] font-medium">{sec.title}</span>
                          {sec.section_type === "leadership" && (
                            <Badge variant="outline" className="rounded-full text-[10.5px]">liderança</Badge>
                          )}
                          <span className="ml-auto text-[11.5px] text-muted-foreground">
                            {sec.questions?.length || 0}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3 pb-4">
                        <div className="flex items-center gap-2.5 rounded-lg bg-secondary/60 p-2.5">
                          <Switch
                            checked={sec.section_type === "leadership"}
                            onCheckedChange={async (checked) => {
                              await supabase.from("survey_sections")
                                .update({ section_type: checked ? "leadership" : "organization" } as never)
                                .eq("id", sec.id);
                              loadSections();
                            }}
                          />
                          <span className="text-[12px] text-muted-foreground">
                            Repetir esta categoria para cada líder avaliado
                          </span>
                        </div>

                        {sec.questions?.map((q: any, i: number) => (
                          <div key={q.id} className="group flex items-start gap-2.5 border-b border-border py-2 last:border-0">
                            <span className="w-5 shrink-0 pt-0.5 text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
                            <span className="flex-1 text-[13.5px] leading-snug">{q.text}</span>
                            {q.question_type !== "scale" && (
                              <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">
                                {q.question_type === "choice" ? "escolha" : "texto"}
                              </Badge>
                            )}
                            {q.scale_type === "enps" && (
                              <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">eNPS</Badge>
                            )}
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={async () => {
                                await supabase.from("survey_questions").delete().eq("id", q.id);
                                loadSections();
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}

                        <div className="flex gap-2">
                          <Input
                            className="h-9 rounded-xl text-sm"
                            value={newQuestions[sec.id] || ""}
                            onChange={(e) => setNewQuestions((q) => ({ ...q, [sec.id]: e.target.value }))}
                            placeholder="Nova pergunta…"
                            onKeyDown={(e) => e.key === "Enter" && addQuestion(sec.id)}
                          />
                          <Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => addQuestion(sec.id)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma categoria ainda. Crie a primeira abaixo.
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <Input
                  className="h-9 rounded-xl text-sm"
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                  placeholder="Nova categoria (ex.: Comunicação)"
                  onKeyDown={(e) => e.key === "Enter" && addSection()}
                />
                <Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={addSection}>
                  <Plus className="mr-1.5 h-4 w-4" />Categoria
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lideranças */}
          <Card className="rounded-[22px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />Lideranças avaliadas
              </CardTitle>
              <CardDescription>
                Quem o colaborador avalia. A liderança <strong>empresarial</strong> é avaliada por
                todo mundo; a de <strong>área</strong> é escolhida por quem responde, dentro da lista.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {leadershipQuestions === 0 && leaders.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] p-3.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                  <p className="text-[13px] leading-relaxed">
                    Há lideranças cadastradas, mas nenhuma categoria está marcada como "de
                    liderança" — então ninguém será avaliado. Marque a categoria correspondente
                    no questionário acima.
                  </p>
                </div>
              )}

              <LeaderGroup
                icon={Building2} label="Liderança empresarial"
                hint="Avaliada por todos os respondentes"
                items={leaders.map((l, i) => ({ ...l, i })).filter((l) => l.type === "company")}
                onRemove={(i) => saveLeaders(leaders.filter((_, k) => k !== i))}
              />
              <LeaderGroup
                icon={UserCheck} label="Liderança de área"
                hint="Cada pessoa escolhe a sua no começo da pesquisa"
                items={leaders.map((l, i) => ({ ...l, i })).filter((l) => l.type === "department")}
                onRemove={(i) => saveLeaders(leaders.filter((_, k) => k !== i))}
              />

              <div className="flex flex-wrap gap-2">
                <Select value={newLeaderType} onValueChange={(v) => setNewLeaderType(v as "company" | "department")}>
                  <SelectTrigger className="h-9 w-40 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Empresarial</SelectItem>
                    <SelectItem value="department">Área</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-9 min-w-[200px] flex-1 rounded-xl text-sm"
                  value={newLeader}
                  onChange={(e) => setNewLeader(e.target.value)}
                  placeholder="Nome da pessoa"
                  onKeyDown={(e) => e.key === "Enter" && addLeader()}
                />
                <Button size="sm" className="h-9 rounded-xl" onClick={addLeader}>
                  <Plus className="mr-1.5 h-4 w-4" />Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function LeaderGroup({
  icon: Icon, label, hint, items, onRemove,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  items: (Leader & { i: number })[];
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Icon className="h-3.5 w-3.5 text-primary" />{label}
        </span>
        <span className="text-[11.5px] text-muted-foreground">· {hint}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-[12.5px] text-muted-foreground">
          Nenhuma cadastrada.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((l) => (
            <span key={l.i} className="group flex items-center gap-1.5 rounded-full border border-border bg-card py-1.5 pl-3 pr-1.5 text-[13px]">
              {l.name}
              <button
                onClick={() => onRemove(l.i)}
                aria-label={`Remover ${l.name}`}
                className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
