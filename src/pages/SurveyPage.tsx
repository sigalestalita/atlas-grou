import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ArrowRight, CalendarX2, Check, CheckCircle2, Clock, FlaskConical,
  Loader2, RefreshCw, ShieldCheck, UserX, WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NEW_COLUMNS, selectCompat, writeCompat, writeManyCompat } from "@/lib/dbCompat";
import {
  markCompleted, plan360, planClimate, roundKey,
  type Assignment, type Plan, type Round,
} from "@/lib/rounds";

/**
 * A pesquisa como o colaborador a responde.
 *
 * É a única tela do produto que é white-label de verdade: as cores vêm da
 * empresa cliente e são injetadas como variáveis CSS no container, para que
 * os componentes usem `var(--c-primary)` em vez de carregar estilo inline em
 * cada botão. O layout, o espaçamento e a tipografia são os mesmos do resto
 * da plataforma.
 *
 * Uma pergunta por vez, mobile-first — o telefone é o canal principal.
 */

interface Question {
  id: string;
  text: string;
  section_title: string;
  section_id: string;
  section_type: string;
  question_type: string;
  scale_type: string | null;
  options: string[] | null;
  has_justification: boolean;
  justification_prompt: string | null;
}

interface SurveyData {
  id: string;
  /** `360` monta as etapas a partir da matriz de quem avalia quem. */
  mode: "climate" | "360";
  /** Quando verdadeiro, a resposta guarda quem respondeu — e a tela avisa. */
  identified: boolean;
  title: string;
  description: string | null;
  intro_text: string | null;
  scale_min: number;
  scale_max: number;
  scale_labels: string[];
  closes_at: string | null;
  leaders: { name: string; type: "company" | "department"; hidden?: boolean }[];
}

interface Branding {
  name: string;
  logo_url: string | null;
  primary: string;
  secondary: string;
}

type Status =
  | "loading" | "invalid" | "closed" | "already_responded" | "no_evaluation"
  | "select_dept_leader" | "round_intro" | "ready" | "submitting" | "round_done" | "done";

const SCALE_LABELS: Record<string, string[]> = {
  avaliacao: ["Muito ruim", "Ruim", "Regular", "Bom", "Muito bom"],
  satisfacao: ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"],
  concordancia: ["Discordo totalmente", "Discordo em parte", "Neutro", "Concordo em parte", "Concordo totalmente"],
  frequencia: ["Nunca", "Raramente", "Às vezes", "Com frequência", "Sempre"],
  confianca: ["Muito baixo", "Baixo", "Moderado", "Alto", "Muito alto"],
  alinhamento: ["Totalmente desalinhado", "Pouco alinhado", "Em parte", "Bem alinhado", "Totalmente alinhado"],
};

/**
 * Quanto custa responder, por tipo de pergunta.
 *
 * Tratar tudo como 14s subestimava feio qualquer pesquisa com texto aberto:
 * uma rodada 360 de 21 perguntas, das quais 14 são redação, saía anunciada como
 * "5 min" e leva mais de dez. Prometer curto e entregar longo é justamente o que
 * faz gente abandonar no meio — e aí a pesquisa perde a resposta inteira, não
 * só o tempo.
 */
const SECONDS_BY_TYPE: Record<string, number> = {
  scale: 10,
  choice: 12,
  open_text: 45,
  text: 45,
};
const secondsFor = (q: Question) =>
  (SECONDS_BY_TYPE[q.question_type] ?? 14) + (q.has_justification ? 40 : 0);

/**
 * Casca, cabeçalho e selo vivem AQUI, no escopo do módulo, e não dentro do
 * componente da pesquisa.
 *
 * Definidos lá dentro, cada render criava funções novas — para o React, tipos
 * de componente diferentes — e ele desmontava e remontava a tela inteira a cada
 * tecla digitada. Com o `autoFocus` do campo de texto, o cursor voltava para a
 * posição zero a cada letra: quem escrevia "TESTE" via aparecer "ETSET". O
 * campo parecia quebrado, e na verdade quebrado estava o resto da árvore.
 */
function SurveyShell({
  children, style, center,
}: { children: React.ReactNode; style: React.CSSProperties; center?: boolean }) {
  return (
    <div
      style={style}
      className={cn(
        "flex min-h-[100dvh] flex-col bg-[linear-gradient(170deg,color-mix(in_srgb,var(--c-primary)_7%,#fff)_0%,#fff_55%)]",
        center && "items-center justify-center p-6",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Campo de texto da pesquisa.
 *
 * Cresce junto com o que a pessoa escreve, em vez de virar uma janelinha com
 * barra de rolagem: nas perguntas abertas deste questionário a resposta é um
 * parágrafo inteiro, e não poder reler o que se escreveu faz o texto sair pior.
 *
 * O cursor vai para o fim ao abrir, e não para o começo — quem volta para
 * corrigir uma resposta quer continuar de onde parou.
 */
function GrowingTextarea({
  value, onChange, placeholder, hint, minHeight = 150, className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  minHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { resize(); }, [value, resize]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    // Só ao montar: reposicionar o cursor a cada tecla é exatamente o defeito
    // que este componente existe para não ter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={1}
        spellCheck
        className="w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[15px] leading-[1.65] text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-transparent focus:ring-2"
        style={{ minHeight, ["--tw-ring-color" as string]: "var(--c-primary)" }}
      />
      <div className="mt-2 flex items-baseline justify-between gap-3">
        {hint ? <p className="text-[12px] text-slate-400">{hint}</p> : <span />}
        {value.trim().length > 0 && (
          <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">
            {value.trim().split(/\s+/).length} palavras
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Faixa do modo de ensaio.
 *
 * Aparece para quem abre o link de teste, e só para esse. Quem está ensaiando
 * precisa saber que está ensaiando — sem isso a pessoa termina a pesquisa
 * achando que respondeu, e a rodada real nunca recebe a resposta dela.
 */
function TestBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-center text-[12.5px] font-medium text-white">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      Modo de ensaio — nada do que você responder aqui é gravado ou contabilizado.
    </div>
  );
}

function SurveyHeader({ branding, right, test }: { branding: Branding | null; right?: React.ReactNode; test?: boolean }) {
  if (test) {
    return (
      <div className="sticky top-0 z-20">
        <TestBanner />
        <SurveyHeaderBar branding={branding} right={right} />
      </div>
    );
  }
  return <SurveyHeaderBar branding={branding} right={right} />;
}

function SurveyHeaderBar({ branding, right }: { branding: Branding | null; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-black/[0.06] bg-white/85 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        {branding?.logo_url
          ? <img src={branding.logo_url} alt={branding.name} className="h-7 w-auto max-w-[140px] object-contain" />
          : <span className="grid h-7 w-7 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: "var(--c-primary)" }}>
              {branding?.name?.[0] ?? "?"}
            </span>}
        <span className="truncate text-[13px] font-semibold text-slate-700">{branding?.name}</span>
      </div>
      {right}
    </header>
  );
}

/**
 * O selo de anonimato.
 *
 * Aparece apenas na pesquisa anônima, que é o padrão do produto. Numa rodada
 * identificada a tela fica calada: não afirma anonimato, porque seria falso, e
 * não anuncia o contrário, porque quem conduz combina isso fora da ferramenta.
 * O que não pode acontecer é o selo de "respostas anônimas" numa rodada que não é.
 */
function AnonymityTag({ identified, className }: { identified: boolean; className?: string }) {
  if (identified) return null;
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-[11.5px] text-slate-600", className)}>
      <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--c-primary)" }} />
      Respostas anônimas
    </div>
  );
}

/**
 * Encontra o respondente a partir do token do link.
 *
 * Passa por uma função do banco porque o anônimo não lê mais a tabela: nem as
 * colunas, nem o token — e, no Postgres, sem poder LER a coluna também não se
 * pode FILTRAR por ela, que é como o link encontra a pessoa. A função recebe o
 * token, devolve uma linha e não expõe token nem e-mail.
 *
 * O caminho antigo fica como reserva para bancos onde a função ainda não existe.
 */
async function respondentByToken(token: string): Promise<Record<string, any> | null> {
  const { data, error } = await supabase.rpc("respondent_by_token", { p_token: token });
  if (!error) return (Array.isArray(data) ? data[0] : data) ?? null;

  const legacy = await selectCompat<Record<string, unknown>>(
    ["id", "survey_id", "company_id", "name", "department",
     "company_leadership", "department_leadership", "status", "responded_at"],
    ["started_at", "completed_rounds"],
    (cols) => supabase.from("respondents").select(cols).eq("token", token).limit(1),
  );
  return (legacy.data?.[0] as Record<string, any>) ?? null;
}

/**
 * Marca que a pessoa abriu a pesquisa.
 *
 * Passa pela função do banco, que exige o token — a tabela não aceita mais
 * escrita direta do anônimo, senão qualquer um poderia marcar qualquer pessoa
 * como respondida e trancá-la para fora. O caminho antigo fica como reserva
 * para o intervalo entre o código subir e a migração rodar.
 */
async function markStarted(token: string, id: string): Promise<void> {
  const { error } = await supabase.rpc("respondent_start", { p_token: token });
  if (!error) return;
  await writeCompat({ started_at: new Date().toISOString() }, ["started_at"],
    (body) => supabase.from("respondents").update(body as never).eq("id", id));
}

/** Guarda as etapas enviadas e fecha a pesquisa quando a última termina. */
async function saveProgress(
  token: string | null, id: string, rounds: string[], finished: boolean,
): Promise<void> {
  if (token) {
    const { error } = await supabase.rpc("respondent_progress", {
      p_token: token, p_rounds: rounds, p_finished: finished,
    });
    if (!error) return;
  }
  await writeCompat(
    {
      completed_rounds: rounds,
      ...(finished ? { status: "responded", responded_at: new Date().toISOString() } : {}),
    },
    ["completed_rounds"],
    (body) => supabase.from("respondents").update(body as never).eq("id", id),
  );
}

/**
 * Troca o marcador pelo nome de quem está sendo avaliado.
 *
 * As perguntas do 360 são escritas uma vez e valem para todos os avaliados —
 * "os maiores talentos de {avaliado}". Sem isso, ou a pergunta fica impessoal
 * ("desta pessoa"), ou seria preciso uma cópia das perguntas por avaliado.
 */
/** Compara nomes ignorando caixa e espaço em volta. */
const same2 = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function withName(text: string, name: string | null): string {
  if (!name) return text.replace(/\{avaliado\}/g, "esta pessoa");
  return text.replace(/\{avaliado\}/g, name);
}

export default function SurveyPage() {
  const { slug, token } = useParams();

  const [status, setStatus] = useState<Status>("loading");
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [respondent, setRespondent] = useState<any>(null);

  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});

  const [selectedDeptLeader, setSelectedDeptLeader] = useState<string | null>(null);
  const [pendingDeptSelection, setPendingDeptSelection] = useState(false);

  /** Respondente de ensaio: percorre tudo, não grava nada, não conta em nada. */
  const isTest = !!respondent?.is_test;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const liveRegion = useRef<HTMLDivElement>(null);

  const round = rounds[roundIndex];
  // A autoavaliação tem seção própria porque o enunciado muda de pessoa:
  // "os talentos de Fulano" vira "as suas fortalezas".
  const questions = useMemo(() => {
    if (round?.type === "leadership") return allQuestions.filter((q) => q.section_type === "leadership");
    if (round?.type === "self") {
      const own = allQuestions.filter((q) => q.section_type === "self");
      return own.length ? own : allQuestions.filter((q) => q.section_type === "leadership");
    }
    return allQuestions.filter((q) => q.section_type !== "leadership" && q.section_type !== "self");
  }, [allQuestions, round?.type]);

  const draftKey = token ? `atlas_draft_${token}` : null;

  // ── Rascunho ───────────────────────────────────────────────────────────────
  // Salvo a cada mudança. É o que permite fechar o navegador no meio da
  // pesquisa e voltar de onde parou, sem ter que refazer nada.
  useEffect(() => {
    if (!draftKey) return;
    if (["loading", "invalid", "closed", "already_responded", "done", "no_evaluation"].includes(status)) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        answers, justifications, index, roundIndex, selectedDeptLeader,
        completed: rounds.filter((r) => r.completed).map(roundKey),
        savedAt: Date.now(),
      }));
    } catch { /* modo privado ou cota cheia: seguir sem rascunho */ }
  }, [answers, justifications, index, roundIndex, selectedDeptLeader, rounds, status, draftKey]);

  // ── Carga ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!slug) { setStatus("invalid"); return; }

    const { data: company } = await supabase
      .from("companies").select("*").eq("slug", slug).single();
    if (!company) { setStatus("invalid"); return; }
    setBranding({
      name: company.name, logo_url: company.logo_url,
      primary: company.primary_color || "#15498D",
      secondary: company.secondary_color || "#071A34",
    });

    let surveyRow: any = null;
    let resp: any = null;

    if (token) {
      const data = await respondentByToken(token);
      if (!data) { setStatus("invalid"); return; }
      if (data.status === "responded") { setStatus("already_responded"); return; }
      resp = data;
      setRespondent(data);
      const { data: s } = await supabase
        .from("surveys").select("*").eq("id", data.survey_id).eq("status", "active").single();
      surveyRow = s;
    } else {
      const { data: s } = await supabase
        .from("surveys").select("*")
        .eq("company_id", company.id).eq("status", "active").eq("open_access", true)
        .order("created_at", { ascending: false }).limit(1).single();
      surveyRow = s;
      if (s) {
        resp = { id: null, survey_id: s.id, name: "", department: null, company_leadership: null, department_leadership: null, completed_rounds: [] };
        setRespondent(resp);
      }
    }

    if (!surveyRow) { setStatus("invalid"); return; }

    // Prazo: a pesquisa pode estar ativa e mesmo assim fora da janela.
    const closesAt = (surveyRow as any).closes_at as string | null;
    const opensAt = (surveyRow as any).opens_at as string | null;
    const now = Date.now();
    if ((closesAt && new Date(closesAt).getTime() < now) || (opensAt && new Date(opensAt).getTime() > now)) {
      setStatus("closed");
      return;
    }

    const labels: string[] = (() => {
      try {
        const raw = surveyRow.scale_labels;
        if (typeof raw === "string") return JSON.parse(raw);
        return Array.isArray(raw) ? (raw as string[]) : [];
      } catch { return []; }
    })();

    const leaders: SurveyData["leaders"] = (() => {
      try {
        const raw = Array.isArray(surveyRow.leaders) ? surveyRow.leaders : [];
        return raw.map((l: any) =>
          typeof l === "string"
            ? { name: l, type: "company" as const }
            : { name: l.name, type: l.type || "company", hidden: !!l.hidden },
        ).filter((l: any) => l.name);
      } catch { return []; }
    })();

    const mode: "climate" | "360" = (surveyRow as any).survey_mode === "360" ? "360" : "climate";
    const identified = !!(surveyRow as any).identified;

    setSurvey({
      id: surveyRow.id, mode, identified,
      title: surveyRow.title, description: surveyRow.description,
      intro_text: (surveyRow as any).intro_text ?? null,
      scale_min: surveyRow.scale_min, scale_max: surveyRow.scale_max,
      scale_labels: labels, closes_at: closesAt, leaders,
    });

    // Perguntas: duas consultas, não uma por seção.
    const { data: sections } = await supabase
      .from("survey_sections").select("*").eq("survey_id", surveyRow.id).order("sort_order");
    const secById = new Map((sections || []).map((s) => [s.id, s]));
    const { data: qRows } = sections?.length
      ? await supabase.from("survey_questions").select("*")
          .in("section_id", sections.map((s) => s.id)).order("sort_order")
      : { data: [] as any[] };

    const loaded: Question[] = (qRows || []).map((q) => {
      const sec = secById.get(q.section_id);
      let options: string[] | null = null;
      if (q.options) {
        try { options = typeof q.options === "string" ? JSON.parse(q.options) : (q.options as string[]); }
        catch { options = null; }
      }
      return {
        id: q.id, text: q.text,
        section_title: sec?.title ?? "", section_id: q.section_id,
        section_type: (sec as any)?.section_type || "organization",
        question_type: q.question_type, scale_type: q.scale_type, options,
        has_justification: q.has_justification, justification_prompt: q.justification_prompt,
      };
    });
    // Mantém a ordem das seções, e dentro delas a ordem das perguntas.
    const secOrder = new Map((sections || []).map((s, i) => [s.id, i]));
    loaded.sort((a, b) => (secOrder.get(a.section_id)! - secOrder.get(b.section_id)!));
    setAllQuestions(loaded);

    const hasLeadershipQuestions = loaded.some((q) => q.section_type === "leadership");
    const myName = (resp.name || "").trim();

    // Quem responde o quê é decidido em `lib/rounds`, que é função pura e tem
    // teste. Aqui só se busca o que ela precisa.
    let planned: Plan;

    if (mode === "360") {
      // A ligação que faltava: a tela "Quem avalia quem" gravava as
      // atribuições e nada as lia — a pesquisa montava tudo a partir da lista
      // de lideranças, então a matriz não produzia efeito nenhum.
      const { data: assignRows } = await selectCompat<Assignment>(
        ["evaluatee_name"], [...NEW_COLUMNS.assignments],
        (cols) => supabase.from("evaluation_assignments").select(cols)
          .eq("survey_id", surveyRow.id).eq("evaluator_name", myName),
      );
      planned = plan360(myName, resp.department ?? null, assignRows ?? []);
    } else {
      planned = planClimate(myName, leaders, hasLeadershipQuestions);
    }

    if (planned.kind === "invalid") { setStatus("invalid"); return; }
    if (planned.kind === "nothing") { setStatus("no_evaluation"); return; }

    let built: Round[] = planned.rounds;
    let needsDeptSelection = planned.needsDeptSelection;
    const companyLeaders = leaders.filter((l) => l.type === "company");

    // Etapas já enviadas. Vem do servidor primeiro — o rascunho local não
    // acompanha a pessoa quando ela troca de aparelho, e sem isso ela refazia
    // uma etapa já gravada.
    const serverDone: string[] = (() => {
      const raw = (resp as any)?.completed_rounds;
      return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
    })();

    let draft: any = null;
    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) draft = JSON.parse(raw);
      } catch { /* rascunho ilegível: começa do zero */ }
    }

    const done = new Set<string>([...serverDone, ...(Array.isArray(draft?.completed) ? draft.completed : [])]);

    // O líder de área escolhido antes precisa voltar junto, senão as etapas
    // de liderança não seriam remontadas na retomada.
    const savedDept: string | null = draft?.selectedDeptLeader ?? null;
    if (needsDeptSelection && savedDept) {
      built = [
        { leaderName: null, type: "org", completed: false },
        { leaderName: savedDept, type: "leadership", completed: false },
        ...companyLeaders.map((l) => ({ leaderName: l.name, type: "leadership" as const, completed: false })),
      ];
      needsDeptSelection = false;
      setSelectedDeptLeader(savedDept);
    }

    built = markCompleted(built, done);
    setRounds(built);
    setPendingDeptSelection(needsDeptSelection);

    const nextIncomplete = built.findIndex((r) => !r.completed);

    if (nextIncomplete === -1) {
      // Tudo enviado. Se a etapa de escolha ficou pendente, é ali que ela entra.
      if (needsDeptSelection) { setStatus("select_dept_leader"); return; }
      setStatus("done");
      return;
    }

    setRoundIndex(nextIncomplete);

    // Restaura o rascunho só se ele for da etapa em que a pessoa parou.
    // Sem essa checagem, respostas de uma etapa vazavam para a seguinte.
    const draftIsForThisRound = draft && draft.roundIndex === nextIncomplete;
    if (draftIsForThisRound && draft.answers && Object.keys(draft.answers).length > 0) {
      setAnswers(draft.answers);
      setJustifications(draft.justifications || {});
      setIndex(Math.max(0, Math.min(draft.index ?? 0, 9999)));
      setStatus("ready");
    } else {
      setStatus("round_intro");
    }

    // Marca que a pessoa abriu a pesquisa — alimenta o "começou e não terminou"
    // no acompanhamento, que antes não existia.
    if (token && resp?.id && !resp.started_at && !resp.is_test) {
      void markStarted(token, resp.id);
    }
  }, [slug, token, draftKey]);

  useEffect(() => { load(); }, [load]);

  // ── Navegação ──────────────────────────────────────────────────────────────
  const current = questions[index];

  const isAnswered = useCallback((q: Question) => {
    const a = answers[q.id];
    if (a === undefined) return false;
    if (typeof a === "string" && a.trim() === "") return false;
    if (q.has_justification && !(justifications[q.id] || "").trim()) return false;
    return true;
  }, [answers, justifications]);

  const answeredCount = questions.filter(isAnswered).length;
  const allAnswered = questions.length > 0 && questions.every(isAnswered);
  const canAdvance = current ? isAnswered(current) : false;
  const isLast = index === questions.length - 1;

  /** Avanço automático pendente. Navegar na mão sempre o cancela. */
  const advanceTimer = useRef<number | null>(null);
  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);
  useEffect(() => cancelAdvance, [cancelAdvance]);

  const goNext = useCallback(() => {
    cancelAdvance();
    setIndex((i) => Math.min(questions.length - 1, i + 1));
  }, [questions.length, cancelAdvance]);
  const goBack = useCallback(() => {
    cancelAdvance();
    setIndex((i) => Math.max(0, i - 1));
  }, [cancelAdvance]);

  /** Primeira pergunta ainda sem resposta nesta etapa. */
  const firstMissing = useCallback(
    () => questions.findIndex((q) => !isAnswered(q)),
    [questions, isAnswered],
  );

  const answer = useCallback((value: number | string) => {
    if (!current) return;
    setAnswers((a) => ({ ...a, [current.id]: value }));
    if (liveRegion.current) liveRegion.current.textContent = `Resposta registrada: ${value}`;

    // Trocar de nota antes do avanço acontecer empilhava DOIS avanços, e a
    // pesquisa pulava da pergunta 1 para a 3 — a do meio ficava em branco sem
    // ninguém ver. Cancela o anterior, e o avanço só vale se a pessoa ainda
    // estiver na pergunta que acabou de responder.
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    if (!current.has_justification) {
      const from = index;
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null;
        setIndex((i) => (i === from && i < questions.length - 1 ? i + 1 : i));
      }, 260);
    }
  }, [current, index, questions.length]);

  // Atalhos de teclado: número responde, setas navegam.
  // Numa pesquisa de uma pergunta por tela, o mouse é o gargalo.
  useEffect(() => {
    if (status !== "ready" || !current) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;

      if (e.key === "ArrowLeft") { goBack(); return; }
      if (e.key === "ArrowRight" || (e.key === "Enter" && canAdvance && !isLast)) { goNext(); return; }

      if (current.question_type === "scale") {
        const n = Number(e.key);
        if (!Number.isNaN(n) && e.key !== " ") {
          const min = current.scale_type === "enps" ? 0 : (survey?.scale_min ?? 1);
          const max = current.scale_type === "enps" ? 10 : (survey?.scale_max ?? 5);
          if (n >= min && n <= max) { e.preventDefault(); answer(n); }
        }
      } else if (current.question_type === "choice" && current.options) {
        const i = "abcdefghij".indexOf(e.key.toLowerCase());
        if (i >= 0 && i < current.options.length) { e.preventDefault(); answer(current.options[i]); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, current, canAdvance, isLast, goNext, goBack, answer, survey]);

  // ── Envio ──────────────────────────────────────────────────────────────────
  const submitRound = async () => {
    if (!survey || !respondent || !round) return;
    setSubmitError(null);
    setStatus("submitting");

    // No ensaio a etapa avança sem tocar no banco. Nada de "grava e depois
    // filtra": a resposta não chega a existir, então não há relatório, média ou
    // exportação que possa contá-la — nem os que rodam fora daqui.
    if (isTest) {
      const updated = rounds.map((r, i) => (i === roundIndex ? { ...r, completed: true } : r));
      setRounds(updated);
      setAnswers({});
      setJustifications({});
      setIndex(0);
      const next = updated.findIndex((r, i) => i > roundIndex && !r.completed);
      if (next !== -1) { setRoundIndex(next); setStatus("round_done"); }
      else setStatus("done");
      return;
    }

    // Sorteado por envio: agrupa as linhas desta etapa sem identificar quem é.
    const submissionId = crypto.randomUUID();
    const leader = round.leaderName;

    const rows = questions.map((q) => {
      const a = answers[q.id];
      const justification = (justifications[q.id] || "").trim() || null;
      let textValue: string | null = null;
      if (typeof a === "string") textValue = justification ? `${a}|||${justification}` : a;
      else textValue = justification;
      return {
        survey_id: survey.id,
        question_id: q.id,
        value: typeof a === "number" ? a : null,
        text_value: textValue,
        department: respondent.department,
        company_leadership: respondent.company_leadership,
        department_leadership: respondent.department_leadership,
        evaluated_leader: leader,
        submission_id: submissionId,
        is_self: round.type === "self",
        // Só viaja em pesquisa que se declarou identificada. Um gatilho no
        // banco apaga este campo quando a pesquisa é anônima, então um erro
        // aqui não vira vazamento.
        respondent_id: survey.identified ? respondent.id : null,
      };
    }).filter((r) => r.value !== null || r.text_value !== null);

    // Três tentativas, com espera crescente. A conexão do celular cai.
    const delays = [0, 2000, 5000];
    let lastError: unknown = null;
    for (const delay of delays) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 30000);
        // Sem a migração, `submission_id` não existe; o adaptador reenvia sem
        // ela em vez de perder a resposta da pessoa.
        const { error } = await writeManyCompat(rows, [...NEW_COLUMNS.responses],
          (body) => supabase.from("survey_responses").insert(body as never).abortSignal(ctrl.signal));
        clearTimeout(timeout);
        if (error) { lastError = error; continue; }
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (lastError) {
      setSubmitError(
        "Não conseguimos enviar agora. Suas respostas estão guardadas neste navegador — " +
        "confira a conexão e toque em Reenviar.",
      );
      setStatus("ready");
      return;
    }

    const updated = rounds.map((r, i) => (i === roundIndex ? { ...r, completed: true } : r));
    setRounds(updated);

    // Registra a etapa no servidor: é isso que impede a mesma etapa de ser
    // enviada de novo se a pessoa voltar de outro aparelho.
    const completedKeys = updated.filter((r) => r.completed).map(roundKey);
    const stillMissing = updated.some((r) => !r.completed) || (pendingDeptSelection && !selectedDeptLeader);

    if (respondent.id) {
      await saveProgress(token ?? null, respondent.id, completedKeys, !stillMissing);
    }

    setAnswers({});
    setJustifications({});
    setIndex(0);

    const next = updated.findIndex((r, i) => i > roundIndex && !r.completed);
    if (next !== -1) {
      setRoundIndex(next);
      setStatus("round_done");
    } else if (pendingDeptSelection && !selectedDeptLeader) {
      setStatus("select_dept_leader");
    } else {
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* ok */ } }
      setStatus("done");
    }
  };

  const confirmDeptLeader = () => {
    if (!selectedDeptLeader || !survey) return;
    setPendingDeptSelection(false);
    const companyLeaders = survey.leaders.filter((l) => l.type === "company");
    setRounds((prev) => [
      ...prev,
      { leaderName: selectedDeptLeader, type: "leadership", completed: false },
      ...companyLeaders.map((l) => ({ leaderName: l.name, type: "leadership" as const, completed: false })),
    ]);
    setRoundIndex(rounds.length);
    setIndex(0);
    setAnswers({});
    setJustifications({});
    setStatus("round_intro");
  };

  // ── Números de progresso ───────────────────────────────────────────────────
  // Quais perguntas cabem a cada tipo de etapa. Antes a etapa de autoavaliação
  // caía no mesmo balde da organização ("tudo que não é liderança"), o que só
  // dava certo porque este questionário não tem perguntas sobre a organização.
  const questionsOf = (type: Round["type"]) =>
    type === "leadership" ? allQuestions.filter((q) => q.section_type === "leadership")
    : type === "self" ? (() => {
        const own = allQuestions.filter((q) => q.section_type === "self");
        return own.length ? own : allQuestions.filter((q) => q.section_type === "leadership");
      })()
    : allQuestions.filter((q) => q.section_type !== "leadership" && q.section_type !== "self");

  const perRound = (r: Round) => questionsOf(r.type).length;
  const secondsOf = (r: Round) => questionsOf(r.type).reduce((acc, q) => acc + secondsFor(q), 0);

  const totalAll = rounds.reduce((acc, r) => acc + perRound(r), 0);
  const doneAll = rounds.reduce((acc, r, i) => {
    if (r.completed) return acc + perRound(r);
    if (i === roundIndex) return acc + answeredCount;
    return acc;
  }, 0);
  const overall = totalAll ? Math.round((doneAll / totalAll) * 100) : 0;
  const totalSeconds = rounds.reduce((acc, r) => acc + secondsOf(r), 0);
  const doneSeconds = rounds.reduce((acc, r, i) => {
    if (r.completed) return acc + secondsOf(r);
    if (i === roundIndex) {
      return acc + questions.filter(isAnswered).reduce((a, q) => a + secondsFor(q), 0);
    }
    return acc;
  }, 0);
  const minutesLeft = Math.max(1, Math.round((totalSeconds - doneSeconds) / 60));
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const completedRounds = rounds.filter((r) => r.completed).length;
  const multi = rounds.length > 1;

  const scaleLabelsFor = (q: Question) =>
    (q.scale_type && SCALE_LABELS[q.scale_type]) || survey?.scale_labels || [];

  // As cores da empresa entram como variáveis para não virar estilo inline em
  // cada elemento.
  const shellStyle = {
    "--c-primary": branding?.primary ?? "#15498D",
    "--c-secondary": branding?.secondary ?? "#071A34",
  } as React.CSSProperties;

  // As mesmas variáveis também no documento inteiro.
  //
  // Diálogo e menu suspenso são desenhados num portal, pendurado no body, fora
  // da div da pesquisa — e ali `var(--c-primary)` não existe. O botão "Enviar"
  // da confirmação ficava então com fundo transparente e texto branco: branco
  // no branco, ilegível, no passo mais importante da pesquisa.
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--c-primary", branding?.primary ?? "#15498D");
    raiz.style.setProperty("--c-secondary", branding?.secondary ?? "#071A34");
    return () => {
      raiz.style.removeProperty("--c-primary");
      raiz.style.removeProperty("--c-secondary");
    };
  }, [branding?.primary, branding?.secondary]);

  // ── Telas de estado ────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <SurveyShell style={shellStyle} center>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--c-primary)" }} />
        <p className="mt-4 text-sm text-slate-500">Carregando a pesquisa…</p>
      </SurveyShell>
    );
  }

  if (status === "invalid") {
    return (
      <SurveyShell style={shellStyle} center>
        <Message
          icon={<WifiOff className="h-7 w-7" />}
          title="Link inválido"
          body="Este link não é válido ou a pesquisa não está mais no ar. Se você recebeu o link por e-mail, confira se ele veio completo."
        />
      </SurveyShell>
    );
  }

  if (status === "closed") {
    return (
      <SurveyShell style={shellStyle} center>
        <Message
          icon={<CalendarX2 className="h-7 w-7" />}
          title="Pesquisa encerrada"
          body="O prazo para responder terminou. Obrigado pelo interesse — procure o RH se ainda quiser contribuir."
          footer={branding?.name}
        />
      </SurveyShell>
    );
  }

  if (status === "already_responded") {
    return (
      <SurveyShell style={shellStyle} center>
        <Message
          icon={<CheckCircle2 className="h-7 w-7" />}
          title="Você já respondeu"
          body="Sua resposta foi registrada. Obrigado por participar!"
          footer={branding?.name}
          tone="success"
        />
      </SurveyShell>
    );
  }

  if (status === "no_evaluation") {
    return (
      <SurveyShell style={shellStyle} center>
        <Message
          icon={<UserX className="h-7 w-7" />}
          title="Nada pendente para você"
          body="Não há avaliações atribuídas a você nesta pesquisa. Se isso parece errado, procure quem está conduzindo."
          footer={branding?.name}
        />
      </SurveyShell>
    );
  }

  if (status === "done") {
    return (
      <SurveyShell style={shellStyle} center>
        <div className="w-full max-w-md text-center duration-500 animate-in fade-in">
          <div
            className="mx-auto grid h-20 w-20 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--c-primary) 12%, #fff)" }}
          >
            <Check className="h-10 w-10" strokeWidth={2.5} style={{ color: "var(--c-primary)" }} />
          </div>
          <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-slate-900">Pronto. Obrigado!</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            {multi
              ? `Suas ${rounds.length} etapas foram enviadas.`
              : "Sua resposta foi enviada."}{" "}
            {survey?.identified
              ? "Cada pessoa avaliada recebe o retorno reunido."
              : "O que você escreveu chega ao RH sem o seu nome — o que é lido é o conjunto, nunca a resposta de uma pessoa."}
          </p>
          <div className="mt-7 flex justify-center"><AnonymityTag identified={!!survey?.identified} /></div>
          {branding && <p className="mt-8 text-[13px] text-slate-400">{branding.name}</p>}
        </div>
      </SurveyShell>
    );
  }

  // ── Escolha do líder de área ───────────────────────────────────────────────
  if (status === "select_dept_leader") {
    const deptLeaders = survey?.leaders.filter((l) => l.type === "department" && !l.hidden) ?? [];
    const hasCompanyLeaders = survey?.leaders.some((l) => l.type === "company");
    return (
      <SurveyShell style={shellStyle}>
        <SurveyHeader test={isTest} branding={branding} />
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-lg duration-500 animate-in fade-in slide-in-from-bottom-2">
            <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
              Quem é a liderança da sua área?
            </h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">
              {hasCompanyLeaders
                ? "Em seguida você avalia essa pessoa e depois a liderança da empresa."
                : "Em seguida você avalia essa pessoa."}
            </p>

            <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Liderança da sua área">
              {deptLeaders.map((leader) => {
                const on = selectedDeptLeader === leader.name;
                return (
                  <button
                    key={leader.name}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelectedDeptLeader(leader.name)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-4 text-left transition-all",
                      on ? "shadow-[0_10px_30px_-14px_rgba(0,0,0,0.3)]" : "border-slate-200 hover:border-slate-300",
                    )}
                    style={on ? { borderColor: "var(--c-primary)", background: "color-mix(in srgb, var(--c-primary) 6%, #fff)" } : undefined}
                  >
                    <span
                      className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", !on && "border-slate-300")}
                      style={on ? { borderColor: "var(--c-primary)", background: "var(--c-primary)" } : undefined}
                    >
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="text-[15px] font-medium text-slate-800">{leader.name}</span>
                  </button>
                );
              })}
            </div>

            <Button
              onClick={confirmDeptLeader}
              disabled={!selectedDeptLeader}
              size="lg"
              className="mt-6 h-12 w-full rounded-2xl text-[15px] font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--c-primary)" }}
            >
              Continuar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <p className="mt-4 text-center text-[12px] text-slate-500">
              Esta escolha define quem você avalia. Ela não fica ligada às suas respostas.
            </p>
          </div>
        </div>
      </SurveyShell>
    );
  }

  // ── Abertura de etapa ──────────────────────────────────────────────────────
  if (status === "round_intro" || status === "round_done") {
    const justFinished = status === "round_done";
    const isOrg = round?.type === "org";
    const first = completedRounds === 0 && roundIndex === 0;
    const intro = survey?.intro_text || survey?.description;

    return (
      <SurveyShell style={shellStyle}>
        <SurveyHeader test={isTest} branding={branding}
          right={multi ? (
            <span className="shrink-0 text-[12.5px] text-slate-500">
              Etapa {roundIndex + 1} de {rounds.length}
            </span>
          ) : undefined}
        />
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="w-full max-w-lg text-center duration-500 animate-in fade-in slide-in-from-bottom-2">
            {justFinished && (
              <div
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--c-primary) 12%, #fff)" }}
              >
                <Check className="h-7 w-7" strokeWidth={2.5} style={{ color: "var(--c-primary)" }} />
              </div>
            )}

            {first && !justFinished && (
              <>
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
                  {survey?.title}
                </h1>
                {intro && <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{intro}</p>}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-[12px] text-slate-600">
                    <Clock className="h-3.5 w-3.5" /> cerca de {totalMinutes} min
                  </span>
                  <AnonymityTag identified={!!survey?.identified} />
                </div>
              </>
            )}

            {justFinished && (
              <h2 className="text-[22px] font-semibold tracking-tight text-slate-900">Etapa concluída</h2>
            )}

            <div className={cn("rounded-3xl border border-black/[0.06] bg-white p-6 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.35)]", first && !justFinished ? "mt-7" : "mt-6")}>
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-slate-400">
                {round?.type === "self"
                  ? "Para terminar"
                  : justFinished || !first ? "A seguir" : "Vamos começar por"}
              </p>
              <h3 className="mt-2 text-[23px] font-semibold tracking-tight" style={{ color: "var(--c-primary)" }}>
                {isOrg ? "A organização" : round?.type === "self" ? "Você" : round?.leaderName}
              </h3>
              {round?.role && round?.type !== "self" && (
                <p className="mt-1 text-[13px] text-slate-500">{round.role}</p>
              )}
              <p className="mt-2.5 text-[14px] leading-relaxed text-slate-600">
                {isOrg
                  ? "Responda pensando na empresa como um todo — não numa pessoa específica."
                  : round?.type === "self"
                    ? "Agora sobre o seu próprio trabalho. Responda com o mesmo critério que usou para os colegas."
                    : "Responda pensando em como essa pessoa conduz a pasta no dia a dia."}
              </p>
              <p className="mt-4 text-[12.5px] text-slate-400">
                {questions.length} {questions.length === 1 ? "pergunta" : "perguntas"} · cerca de{" "}
                {Math.max(1, Math.round(questions.reduce((a, q) => a + secondsFor(q), 0) / 60))} min
              </p>
            </div>

            {multi && <RoundDots rounds={rounds} current={roundIndex} />}

            <Button
              onClick={() => setStatus("ready")}
              size="lg"
              className="mt-6 h-12 w-full rounded-2xl text-[15px] font-semibold text-white sm:w-auto sm:px-10"
              style={{ background: "var(--c-primary)" }}
            >
              {first && !justFinished ? "Começar" : "Continuar"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            {multi && (
              <p className="mt-4 text-[12.5px] text-slate-500">
                {completedRounds} de {rounds.length} etapas concluídas
              </p>
            )}
          </div>
        </div>
      </SurveyShell>
    );
  }

  // ── Perguntas ──────────────────────────────────────────────────────────────
  const submitting = status === "submitting";

  return (
    <SurveyShell style={shellStyle}>
      <SurveyHeader test={isTest} branding={branding}
        right={
          <div className="flex shrink-0 items-center gap-2">
            {round?.type === "self" ? (
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{ background: "color-mix(in srgb, var(--c-primary) 11%, #fff)", color: "var(--c-primary)" }}
              >
                Autoavaliação
              </span>
            ) : round?.type === "leadership" && round.leaderName ? (
              <span
                className="max-w-[46vw] truncate rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{ background: "color-mix(in srgb, var(--c-primary) 11%, #fff)", color: "var(--c-primary)" }}
              >
                Avaliando {round.leaderName}
              </span>
            ) : (
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{ background: "color-mix(in srgb, var(--c-primary) 11%, #fff)", color: "var(--c-primary)" }}
              >
                A organização
              </span>
            )}
          </div>
        }
      />

      {/* Progresso */}
      <div className="border-b border-black/[0.05] bg-white/70 px-4 py-2.5 md:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${multi ? overall : Math.round((answeredCount / Math.max(1, questions.length)) * 100)}%`, background: "var(--c-primary)" }}
            />
          </div>
          <span className="shrink-0 text-[11.5px] tabular-nums text-slate-500">
            {multi ? `${doneAll}/${totalAll}` : `${answeredCount}/${questions.length}`}
          </span>
          <span className="hidden shrink-0 items-center gap-1 text-[11.5px] text-slate-400 sm:flex">
            <Clock className="h-3 w-3" />~{minutesLeft} min
          </span>
        </div>
      </div>

      {submitError && (
        <div className="mx-auto mt-3 w-full max-w-2xl px-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-[13.5px] font-semibold text-red-900">Não foi possível enviar</p>
            <p className="mt-1 text-[13px] leading-relaxed text-red-800">{submitError}</p>
            <Button onClick={submitRound} size="sm" variant="outline" className="mt-3 rounded-xl border-red-300 text-red-800 hover:bg-red-100">
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reenviar
            </Button>
          </div>
        </div>
      )}

      <main className="flex flex-1 items-start justify-center px-4 py-7 md:items-center md:py-10">
        {current && (
          <div key={`${roundIndex}-${index}`} className="w-full max-w-2xl duration-300 animate-in fade-in slide-in-from-right-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--c-primary)" }}>
              {current.section_title}
            </p>
            <h2 className="mt-2.5 text-[21px] font-semibold leading-snug tracking-tight text-slate-900 md:text-[25px]">
              {withName(current.text, round?.type === "self" ? null : round?.leaderName ?? null)}
            </h2>

            <div className="mt-7">
              {current.question_type === "scale" && current.scale_type === "enps" && (
                <EnpsScale value={answers[current.id] as number | undefined} onPick={answer} />
              )}

              {current.question_type === "scale" && current.scale_type !== "enps" && survey && (
                <ScaleOptions
                  min={survey.scale_min}
                  max={survey.scale_max}
                  labels={scaleLabelsFor(current)}
                  value={answers[current.id] as number | undefined}
                  onPick={answer}
                />
              )}

              {current.question_type === "choice" && current.options && (
                <ChoiceOptions
                  options={current.options}
                  value={answers[current.id] as string | undefined}
                  onPick={answer}
                />
              )}

              {(current.question_type === "open_text" || current.question_type === "text") && (
                <GrowingTextarea
                  key={current.id}
                  value={(answers[current.id] as string) || ""}
                  onChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}
                  placeholder="Escreva aqui…"
                  hint={survey?.identified
                    ? "Escreva com suas palavras."
                    : "Escreva com suas palavras. Ninguém saberá que foi você."}
                />
              )}
            </div>

            {current.has_justification && answers[current.id] !== undefined && (
              <div className="mt-6 duration-300 animate-in fade-in slide-in-from-top-1">
                <label htmlFor="justification" className="block text-[13.5px] font-semibold text-slate-800">
                  {current.justification_prompt || "Conte um pouco mais"}
                  <span className="ml-1 font-normal text-slate-400">· obrigatório</span>
                </label>
                <GrowingTextarea
                  key={`j-${current.id}`}
                  value={justifications[current.id] || ""}
                  onChange={(v) => setJustifications((j) => ({ ...j, [current.id]: v }))}
                  minHeight={100}
                  className="mt-2"
                />
              </div>
            )}

            {current.question_type === "scale" && (
              <p className="mt-6 hidden text-[11.5px] text-slate-400 md:block">
                Dica: use os números do teclado para responder e as setas para navegar.
              </p>
            )}
          </div>
        )}
      </main>

      <div aria-live="polite" className="sr-only" ref={liveRegion} />

      {/* Navegação */}
      {isLast && !allAnswered && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-1">
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
            {(() => {
              const faltam = questions.filter((q) => !isAnswered(q)).length;
              return faltam === 1
                ? "Falta 1 pergunta desta etapa. Toque abaixo para ir até ela."
                : `Faltam ${faltam} perguntas desta etapa. Toque abaixo para ir até a primeira.`;
            })()}
          </p>
        </div>
      )}
      <footer className="sticky bottom-0 border-t border-black/[0.06] bg-white/90 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={index === 0}
            className="h-11 rounded-xl text-slate-600 disabled:opacity-30"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>

          <div className="flex items-center gap-1 text-[11.5px] text-slate-400">
            {index + 1} de {questions.length}
          </div>

          {isLast && allAnswered ? (
            <Button
              onClick={() => {
                const last = roundIndex >= rounds.length - 1 && !pendingDeptSelection;
                if (last) setConfirmOpen(true); else submitRound();
              }}
              disabled={submitting}
              className="h-11 rounded-xl px-5 text-[14.5px] font-semibold text-white"
              style={{ background: "var(--c-primary)" }}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</>
              ) : roundIndex >= rounds.length - 1 && !pendingDeptSelection ? (
                <>Revisar e enviar<ArrowRight className="ml-2 h-4 w-4" /></>
              ) : (
                <>Concluir etapa<ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          ) : isLast ? (
            // Na última pergunta o "Próxima" não leva a lugar nenhum, e o
            // "Concluir" só aparece com tudo respondido. Ficava um botão morto
            // sem dizer o que faltava: a pessoa dava a pesquisa por travada.
            // Agora o botão leva direto à pergunta em aberto.
            <Button
              onClick={() => { const i = firstMissing(); if (i >= 0) { cancelAdvance(); setIndex(i); } }}
              className="h-11 rounded-xl px-5 text-[14.5px] font-semibold text-white"
              style={{ background: "var(--c-primary)" }}
            >
              Ir para a pergunta que falta<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!canAdvance}
              className="h-11 rounded-xl px-5 text-[14.5px] font-semibold text-white disabled:opacity-30"
              style={{ background: "var(--c-primary)" }}
            >
              Próxima<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar suas respostas?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-[13.5px] leading-relaxed">
                <p>Depois do envio não é possível alterar.</p>
                <div className="space-y-1.5 rounded-2xl bg-muted/60 p-3.5">
                  <Row label="Perguntas respondidas" value={`${doneAll} de ${totalAll}`} />
                  {multi && <Row label="Etapas" value={`${completedRounds + 1} de ${rounds.length}`} />}
                </div>
                {!survey?.identified && (
                  <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> Nada disso fica ligado ao seu nome.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Revisar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmOpen(false); submitRound(); }}
              className="rounded-xl text-white"
              style={{ background: "var(--c-primary)" }}
            >
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SurveyShell>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}

function Message({
  icon, title, body, footer, tone = "neutral",
}: {
  icon: React.ReactNode; title: string; body: string; footer?: string; tone?: "neutral" | "success";
}) {
  return (
    <div className="max-w-md text-center duration-500 animate-in fade-in">
      <div
        className="mx-auto grid h-16 w-16 place-items-center rounded-full"
        style={{
          background: tone === "success"
            ? "color-mix(in srgb, var(--c-primary) 12%, #fff)"
            : "rgba(0,0,0,0.04)",
          color: tone === "success" ? "var(--c-primary)" : "#64748b",
        }}
      >
        {icon}
      </div>
      <h1 className="mt-5 text-[23px] font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-600">{body}</p>
      {footer && <p className="mt-7 text-[13px] text-slate-400">{footer}</p>}
    </div>
  );
}

function RoundDots({ rounds, current }: { rounds: Round[]; current: number }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      {rounds.map((r, i) => (
        <span
          key={i}
          title={r.type === "org" ? "A organização" : r.type === "self" ? "Autoavaliação" : r.leaderName ?? ""}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            r.completed ? "w-6" : i === current ? "w-6" : "w-1.5 bg-slate-200",
          )}
          style={
            r.completed
              ? { background: "var(--c-primary)" }
              : i === current
                ? { background: "color-mix(in srgb, var(--c-primary) 45%, #fff)" }
                : undefined
          }
        />
      ))}
    </div>
  );
}

/**
 * Escala comum.
 *
 * Um único markup para os dois tamanhos: no celular cada nota é uma faixa
 * larga com o número e o rótulo lado a lado, porque cinco alvos em linha num
 * telefone ficam pequenos demais para o dedo; em tela larga a lista vira uma
 * régua horizontal, que é o que faz a escala ser lida de uma vez e a nota
 * ficar comparável entre perguntas. Renderizar as duas versões e esconder uma
 * duplicaria o grupo de opções para o leitor de tela.
 */
function ScaleOptions({
  min, max, labels, value, onPick,
}: {
  min: number; max: number; labels: string[];
  value: number | undefined; onPick: (v: number) => void;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div role="radiogroup" className="flex flex-col gap-2.5 md:flex-row md:gap-2">
      {values.map((v) => {
        const on = value === v;
        const label = labels[v - min] || `Nota ${v}`;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={on}
            aria-label={label}
            onClick={() => onPick(v)}
            className={cn(
              "group flex items-center gap-3.5 rounded-2xl border-2 bg-white p-3.5 text-left transition-all active:scale-[0.99]",
              "md:flex-1 md:flex-col md:gap-2 md:px-2 md:py-4 md:text-center md:hover:-translate-y-0.5",
              on
                ? "shadow-[0_10px_28px_-14px_rgba(0,0,0,0.3)]"
                : "border-slate-200 md:hover:border-slate-300",
            )}
            style={on ? { borderColor: "var(--c-primary)", background: "color-mix(in srgb, var(--c-primary) 6%, #fff)" } : undefined}
          >
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-[14px] font-bold transition-colors md:h-10 md:w-10 md:text-[15px]",
                on ? "text-white" : "border-slate-200 text-slate-500 md:text-slate-400 md:group-hover:text-slate-600",
              )}
              style={on ? { borderColor: "var(--c-primary)", background: "var(--c-primary)" } : undefined}
            >
              {v}
            </span>
            <span
              className={cn(
                "text-[14.5px] font-medium md:text-[12px] md:leading-tight",
                on ? "text-slate-900 md:font-semibold" : "text-slate-700 md:text-slate-500",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** eNPS de 0 a 10, com as três faixas marcadas — a leitura da métrica. */
function EnpsScale({ value, onPick }: { value: number | undefined; onPick: (v: number) => void }) {
  const color = (v: number) => (v <= 6 ? "#C2382E" : v <= 8 ? "#C77A16" : "#1E8A5A");
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, v) => {
          const on = value === v;
          return (
            <button
              key={v}
              aria-label={`Nota ${v}`}
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={cn(
                "grid h-12 place-items-center rounded-xl border-2 text-[15px] font-bold transition-all",
                on ? "scale-105 border-transparent text-white shadow-lg" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
              style={on ? { background: color(v) } : undefined}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-between text-[12px] text-slate-500">
        <span>Nada provável</span>
        <span>Extremamente provável</span>
      </div>
    </div>
  );
}

function ChoiceOptions({
  options, value, onPick,
}: { options: string[]; value: string | undefined; onPick: (v: string) => void }) {
  return (
    <div role="radiogroup" className="space-y-2.5">
      {options.map((option, i) => {
        const on = value === option;
        return (
          <button
            key={option}
            role="radio"
            aria-checked={on}
            onClick={() => onPick(option)}
            className={cn(
              "flex w-full items-center gap-3.5 rounded-2xl border-2 bg-white p-4 text-left transition-all active:scale-[0.99]",
              on ? "shadow-[0_10px_28px_-14px_rgba(0,0,0,0.3)]" : "border-slate-200 hover:border-slate-300",
            )}
            style={on ? { borderColor: "var(--c-primary)", background: "color-mix(in srgb, var(--c-primary) 6%, #fff)" } : undefined}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 text-[11.5px] font-bold uppercase",
                on ? "text-white" : "border-slate-200 text-slate-400",
              )}
              style={on ? { borderColor: "var(--c-primary)", background: "var(--c-primary)" } : undefined}
            >
              {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : "abcdefghij"[i]}
            </span>
            <span className={cn("text-[14.5px] font-medium", on ? "text-slate-900" : "text-slate-700")}>
              {option}
            </span>
          </button>
        );
      })}
    </div>
  );
}
