import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, MessageSquare, Radio, Search, ShieldCheck } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { scoreColor, submissionKey, truncate, type ResponseRow } from "@/lib/climate";
import { NEW_COLUMNS, selectCompat } from "@/lib/dbCompat";

interface ContextType { company: { id: string } }

interface QuestionMeta {
  id: string;
  text: string;
  question_type: string;
  scale_type: string | null;
  section_title: string;
  sort: number;
}

interface Submission {
  key: string;
  /** Só a data, nunca a hora — ver a nota sobre anonimato abaixo. */
  date: string;
  leader: string | null;
  department: string | null;
  rows: ResponseRow[];
}

/**
 * As respostas recebidas, uma a uma e sem dono.
 *
 * Esta tela tinha, lado a lado, a lista de envios ordenada por horário e a
 * lista de quem já tinha respondido ordenada por horário de resposta. As
 * primeiras linhas das duas eram, quase sempre, a mesma pessoa — bastava
 * colocar as duas juntas para ligar um nome a um conjunto de respostas, que é
 * exatamente o que o produto promete que não acontece.
 *
 * Duas mudanças fecham isso: a lista de pessoas saiu daqui (ela vive em
 * Acompanhamento, onde nenhuma resposta aparece), e os envios passam a mostrar
 * só a data, embaralhados dentro do dia por uma ordem estável que não tem
 * relação com o horário.
 */
export default function Responses() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<any>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [questions, setQuestions] = useState<Record<string, QuestionMeta>>({});
  const [search, setSearch] = useState("");
  const [leaderFilter, setLeaderFilter] = useState("all");
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: surveys } = await supabase
      .from("surveys").select("*").eq("company_id", companyId)
      .neq("status", "draft").order("created_at", { ascending: false }).limit(1);
    const s = surveys?.[0];
    setSurvey(s ?? null);
    if (!s) { setLoading(false); return; }

    const [resp, secs] = await Promise.all([
      selectCompat<ResponseRow>(
        ["question_id", "value", "text_value", "department", "company_leadership",
         "department_leadership", "evaluated_leader", "submitted_at"],
        [...NEW_COLUMNS.responses],
        (cols) => supabase.from("survey_responses").select(cols).eq("survey_id", s.id),
      ),
      supabase.from("survey_sections")
        .select("id, title, sort_order, survey_questions(id, text, question_type, scale_type, sort_order)")
        .eq("survey_id", s.id).order("sort_order"),
    ]);

    setResponses((resp.data || []) as ResponseRow[]);

    const map: Record<string, QuestionMeta> = {};
    (secs.data || []).forEach((sec: any, si: number) => {
      (sec.survey_questions || []).forEach((q: any) => {
        map[q.id] = {
          id: q.id, text: q.text,
          question_type: q.question_type, scale_type: q.scale_type,
          section_title: sec.title, sort: si * 1000 + (q.sort_order ?? 0),
        };
      });
    });
    setQuestions(map);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!survey?.id) return;
    const ch = supabase
      .channel(`responses-${survey.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "survey_responses", filter: `survey_id=eq.${survey.id}` },
        (payload) => {
          setResponses((prev) => [payload.new as ResponseRow, ...prev]);
          setPulse(true);
          window.setTimeout(() => setPulse(false), 2200);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [survey?.id]);

  const submissions = useMemo(() => {
    const groups = new Map<string, ResponseRow[]>();
    for (const r of responses) {
      const k = submissionKey(r);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    const list: Submission[] = Array.from(groups.entries()).map(([key, rows]) => ({
      key,
      date: rows[0].submitted_at.slice(0, 10),
      leader: rows[0].evaluated_leader,
      department: rows[0].department,
      rows,
    }));

    // Ordena por dia (mais recente primeiro) e, dentro do dia, por uma chave
    // derivada do id do envio. É estável entre recarregamentos e não tem
    // relação nenhuma com o horário — que é o ponto.
    const scramble = (k: string) => {
      let h = 0;
      for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
      return h;
    };
    return list.sort((a, b) =>
      a.date === b.date ? scramble(a.key) - scramble(b.key) : b.date.localeCompare(a.date));
  }, [responses]);

  const leaders = useMemo(() => {
    const set = new Set<string>();
    for (const s of submissions) if (s.leader) set.add(s.leader);
    return Array.from(set).sort();
  }, [submissions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      if (leaderFilter !== "all" && s.leader !== leaderFilter) return false;
      if (!q) return true;
      if ((s.leader || "").toLowerCase().includes(q)) return true;
      if ((s.department || "").toLowerCase().includes(q)) return true;
      return s.rows.some((r) => (r.text_value || "").toLowerCase().includes(q));
    });
  }, [submissions, search, leaderFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-72 rounded-[22px]" />
      </div>
    );
  }

  if (!survey) {
    return <EmptyState icon={MessageSquare} title="Nenhuma pesquisa" description="Crie e ative uma pesquisa para ver as respostas aqui." />;
  }

  if (!submissions.length) {
    return (
      <>
        <PageHeader title="Respostas" description="Cada envio recebido, sem identificação." />
        <EmptyState icon={MessageSquare} title="Nenhuma resposta ainda" description="Os envios aparecem aqui assim que começarem a chegar." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Respostas"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>{submissions.length} {submissions.length === 1 ? "envio" : "envios"}</span>
            <span>·</span>
            <span className={`inline-flex items-center gap-1.5 ${pulse ? "text-[hsl(var(--success))]" : ""}`}>
              <Radio className={`h-3.5 w-3.5 ${pulse ? "animate-pulse" : ""}`} />Ao vivo
            </span>
          </span>
        }
      />

      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-border bg-accent/50 p-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Os envios aparecem sem nome e <strong>sem horário</strong>, embaralhados dentro do dia.
          Ordenar por horário aqui permitiria cruzar esta lista com a de quem já respondeu, em
          Acompanhamento, e descobrir de quem é cada resposta.
        </p>
      </div>

      <Card className="rounded-[22px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Envios recebidos</CardTitle>
          <CardDescription>Toque num envio para ver as respostas dele.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 rounded-xl pl-9"
                placeholder="Buscar em comentários, área ou liderança…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {leaders.length > 0 && (
              <Select value={leaderFilter} onValueChange={setLeaderFilter}>
                <SelectTrigger className="h-9 w-56 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lideranças</SelectItem>
                  {leaders.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum envio com esses filtros.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((s, i) => (
                <SubmissionRow
                  key={s.key} index={i + 1} submission={s}
                  questions={questions} survey={survey}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SubmissionRow({
  index, submission, questions, survey,
}: {
  index: number;
  submission: Submission;
  questions: Record<string, QuestionMeta>;
  survey: { scale_min: number; scale_max: number };
}) {
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () => [...submission.rows].sort((a, b) =>
      (questions[a.question_id]?.sort ?? 0) - (questions[b.question_id]?.sort ?? 0)),
    [submission.rows, questions],
  );

  const scored = rows.filter((r) => r.value != null && questions[r.question_id]?.scale_type !== "enps");
  const avg = scored.length
    ? scored.reduce((a, r) => a + r.value!, 0) / scored.length
    : null;
  const comments = rows.filter((r) => r.text_value?.trim()).length;
  const pct = avg != null
    ? ((avg - survey.scale_min) / (survey.scale_max - survey.scale_min)) * 100
    : 0;

  const prettyDate = new Date(`${submission.date}T12:00:00`)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:bg-accent/50">
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">#{index}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          {submission.leader && (
            <Badge variant="outline" className="rounded-full text-[11px]">{submission.leader}</Badge>
          )}
          {submission.department && (
            <span className="truncate text-[12.5px] text-muted-foreground">{submission.department}</span>
          )}
          {comments > 0 && (
            <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" />{comments}
            </span>
          )}
        </div>
        <span className="hidden shrink-0 text-[11.5px] text-muted-foreground sm:block">{prettyDate}</span>
        {avg != null && (
          <span className="w-10 shrink-0 text-right text-[15px] font-bold tabular-nums" style={{ color: scoreColor(pct) }}>
            {avg.toFixed(1)}
          </span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-1 space-y-1 rounded-xl border border-border bg-muted/30 p-3.5">
          {rows.map((r, i) => {
            const q = questions[r.question_id];
            if (!q) return null;
            // Escolha com justificativa foi gravada como "opção|||justificativa".
            const [choice, justification] = (r.text_value || "").includes("|||")
              ? r.text_value!.split("|||")
              : [null, r.text_value];
            const valuePct = r.value != null
              ? ((r.value - survey.scale_min) / (survey.scale_max - survey.scale_min)) * 100
              : 0;
            return (
              <div key={i} className="border-b border-border py-2 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug">{q.text}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{q.section_title}</p>
                  </div>
                  {r.value != null && (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white"
                      style={{ backgroundColor: scoreColor(valuePct) }}
                    >
                      {r.value}
                    </span>
                  )}
                </div>
                {choice && <p className="mt-1 text-[13px] font-medium">{choice}</p>}
                {justification?.trim() && (
                  <p className="mt-1.5 whitespace-pre-wrap rounded-lg border-l-2 border-primary bg-card px-3 py-2 text-[13px] leading-relaxed">
                    {justification.trim()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
