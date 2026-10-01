import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, BarChart3, CalendarX2, Clock, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Message, ScaleOptions, SurveyHeaderBar, SurveyShell } from "@/pages/SurveyPage";
import {
  DIMENSIONS, formatPhone, submitErrorMessage, validateLead,
  type Answers, type DiagnosticQuestion,
} from "@/lib/diagnostic";

/**
 * O diagnóstico como quem responde o vê: link aberto, identificação antes das
 * perguntas, oito afirmações de 0 a 5 e o relatório individual logo em seguida.
 *
 * Usa a casca, o cabeçalho e a escala da pesquisa de clima — mesmo layout,
 * mesma marca da empresa —, mas é outro fluxo: aqui a pessoa se identifica, e
 * por isso nada do selo nem dos textos de anonimato da pesquisa aparece.
 */

// As tabelas do diagnóstico ainda não estão no tipo gerado do banco.
const db = supabase as unknown as SupabaseClient;

interface Diagnostic {
  id: string;
  title: string;
  subtitle: string | null;
  intro_text: string | null;
  questions: DiagnosticQuestion[];
  scale_min: number;
  scale_max: number;
  scale_labels: string[];
}

interface Branding {
  name: string;
  logo_url: string | null;
  primary: string;
  secondary: string;
}

interface Lead { name: string; email: string; phone: string; company: string }

type Status = "loading" | "invalid" | "closed" | "intro" | "questions" | "submitting";

const EMPTY_LEAD: Lead = { name: "", email: "", phone: "", company: "" };
/** Quanto a tela espera depois do toque antes de passar para a próxima. */
const ADVANCE_MS = 380;

export default function DiagnosticPage() {
  const { companySlug, diagnosticSlug } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>("loading");
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);

  const [lead, setLead] = useState<Lead>(EMPTY_LEAD);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [touched, setTouched] = useState(false);

  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const advanceTimer = useRef<number | null>(null);

  const draftKey = diag ? `atlas_diag_${diag.id}` : null;

  // ── Carga ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companySlug || !diagnosticSlug) { setStatus("invalid"); return; }
    const { data: company } = await supabase.from("companies").select("*").eq("slug", companySlug).single();
    if (!company) { setStatus("invalid"); return; }
    setBranding({
      name: company.name, logo_url: company.logo_url,
      primary: company.primary_color || "#15498D",
      secondary: company.secondary_color || "#071A34",
    });

    const { data: row } = await db
      .from("diagnostics").select("*")
      .eq("company_id", company.id).eq("slug", diagnosticSlug).eq("status", "active")
      .maybeSingle();
    if (!row) { setStatus("invalid"); return; }

    const now = Date.now();
    if ((row.closes_at && new Date(row.closes_at).getTime() < now) ||
        (row.opens_at && new Date(row.opens_at).getTime() > now)) {
      setStatus("closed");
      return;
    }

    const parse = <T,>(raw: unknown, fallback: T): T => {
      try { return (typeof raw === "string" ? JSON.parse(raw) : raw ?? fallback) as T; } catch { return fallback; }
    };
    const d: Diagnostic = {
      id: row.id, title: row.title, subtitle: row.subtitle, intro_text: row.intro_text,
      questions: parse<DiagnosticQuestion[]>(row.questions, []),
      scale_min: row.scale_min, scale_max: row.scale_max,
      scale_labels: parse<string[]>(row.scale_labels, []),
    };
    setDiag(d);

    // Rascunho: quem fechou a aba no meio volta de onde parou.
    try {
      const saved = JSON.parse(localStorage.getItem(`atlas_diag_${d.id}`) || "null");
      if (saved) {
        if (saved.lead) setLead({ ...EMPTY_LEAD, ...saved.lead });
        if (saved.answers) setAnswers(saved.answers);
        if (saved.consent) setConsent(true);
        if (typeof saved.index === "number") setIndex(Math.min(saved.index, d.questions.length - 1));
        if (saved.started) { setStatus("questions"); return; }
      }
    } catch { /* rascunho ilegível: começa do zero */ }
    setStatus("intro");
  }, [companySlug, diagnosticSlug]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!draftKey || status === "loading" || status === "invalid" || status === "closed") return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        lead, consent, answers, index, started: status === "questions" || status === "submitting",
      }));
    } catch { /* modo privado: segue sem rascunho */ }
  }, [draftKey, lead, consent, answers, index, status]);

  // Cores da empresa no documento inteiro — o diálogo e o foco dos campos
  // também precisam delas, e eles não moram dentro da casca.
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--c-primary", branding?.primary ?? "#15498D");
    raiz.style.setProperty("--c-secondary", branding?.secondary ?? "#071A34");
    return () => {
      raiz.style.removeProperty("--c-primary");
      raiz.style.removeProperty("--c-secondary");
    };
  }, [branding?.primary, branding?.secondary]);

  useEffect(() => {
    if (diag && branding) document.title = `${diag.title} · ${branding.name}`;
  }, [diag, branding]);

  const shellStyle = useMemo(() => ({
    ["--c-primary" as string]: branding?.primary ?? "#15498D",
    ["--c-secondary" as string]: branding?.secondary ?? "#071A34",
  }) as React.CSSProperties, [branding]);

  // ── Perguntas ──────────────────────────────────────────────────────────────
  const questions = diag?.questions ?? [];
  const current = questions[index];
  const answered = questions.filter((q) => typeof answers[q.key] === "number").length;
  const allAnswered = questions.length > 0 && answered === questions.length;
  const isLast = index === questions.length - 1;

  const cancelAdvance = () => {
    if (advanceTimer.current) { window.clearTimeout(advanceTimer.current); advanceTimer.current = null; }
  };

  const pick = useCallback((value: number) => {
    if (!current) return;
    setAnswers((a) => ({ ...a, [current.key]: value }));
    // Trocar de nota reinicia a espera em vez de empilhar avanços: dois toques
    // seguidos não podem pular uma pergunta.
    cancelAdvance();
    if (!isLast) {
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null;
        setIndex((i) => Math.min(i + 1, questions.length - 1));
      }, ADVANCE_MS);
    }
  }, [current, isLast, questions.length]);

  useEffect(() => () => cancelAdvance(), []);

  const goBack = () => { cancelAdvance(); setIndex((i) => Math.max(0, i - 1)); };
  const goNext = () => { cancelAdvance(); setIndex((i) => Math.min(questions.length - 1, i + 1)); };

  // Números do teclado respondem; setas navegam.
  useEffect(() => {
    if (status !== "questions" || !diag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (e.key.length === 1 && Number.isInteger(n) && n >= diag.scale_min && n <= diag.scale_max) pick(n);
      else if (e.key === "ArrowLeft") goBack();
      else if (e.key === "ArrowRight" && current && typeof answers[current.key] === "number") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, diag, pick, current, answers]);

  // ── Envio ──────────────────────────────────────────────────────────────────
  const errors = validateLead(lead);
  const leadOk = Object.keys(errors).length === 0 && consent;

  const start = () => {
    setTouched(true);
    if (!leadOk) return;
    setStatus("questions");
  };

  const submit = async () => {
    if (!diag || !allAnswered) return;
    setSubmitError(null);
    setStatus("submitting");

    // Campo invisível que só robô preenche. Para ele, a tela segue como se
    // tivesse dado certo; nada é gravado.
    if (honeypot) { setStatus("questions"); return; }

    const { data, error } = await db.rpc("submit_diagnostic", {
      p_diagnostic_id: diag.id,
      p_name: lead.name.trim(),
      p_email: lead.email.trim(),
      p_phone: lead.phone,
      p_company: lead.company.trim(),
      p_answers: answers,
      p_consent: consent,
    });

    if (error || !data) {
      setSubmitError(submitErrorMessage(error?.message));
      setStatus("questions");
      return;
    }
    try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* sem rascunho */ }
    navigate(`/diagnostico/resultado/${data}`, { replace: true });
  };

  // ── Telas de estado ────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <SurveyShell style={shellStyle} center>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--c-primary)" }} />
        <p className="mt-4 text-sm text-slate-500">Carregando o diagnóstico…</p>
      </SurveyShell>
    );
  }

  if (status === "invalid") {
    return (
      <SurveyShell style={shellStyle} center>
        <Message
          icon={<WifiOff className="h-7 w-7" />}
          title="Link inválido"
          body="Este diagnóstico não existe ou não está mais no ar. Confira se o link veio completo."
        />
      </SurveyShell>
    );
  }

  if (status === "closed") {
    return (
      <SurveyShell style={shellStyle} center>
        <Message
          icon={<CalendarX2 className="h-7 w-7" />}
          title="Diagnóstico encerrado"
          body="Este diagnóstico não está recebendo respostas no momento."
          footer={branding?.name}
        />
      </SurveyShell>
    );
  }

  // ── Identificação ──────────────────────────────────────────────────────────
  if (status === "intro" && diag) {
    const minutes = Math.max(1, Math.round((questions.length * 12 + 30) / 60));
    const show = (k: keyof Lead) => (touched ? errors[k] : undefined);
    return (
      <SurveyShell style={shellStyle}>
        <SurveyHeaderBar branding={branding} />
        <div className="flex flex-1 items-start justify-center px-4 py-8 md:items-center md:py-12">
          <div className="w-full max-w-lg duration-500 animate-in fade-in slide-in-from-bottom-2">
            <div className="text-center">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--c-primary)" }}>
                Diagnóstico de liderança
              </p>
              <h1 className="mt-2.5 text-[26px] font-semibold leading-tight tracking-tight text-slate-900 md:text-[30px]">
                {diag.title}
              </h1>
              {diag.subtitle && <p className="mt-2 text-[16px] font-medium text-slate-700">{diag.subtitle}</p>}
              {diag.intro_text && <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600">{diag.intro_text}</p>}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Chip><Clock className="h-3.5 w-3.5" /> cerca de {minutes} min</Chip>
                <Chip><BarChart3 className="h-3.5 w-3.5" style={{ color: "var(--c-primary)" }} /> Resultado na hora</Chip>
              </div>
            </div>

            <form
              noValidate
              onSubmit={(e) => { e.preventDefault(); start(); }}
              className="mt-7 rounded-3xl border border-black/[0.06] bg-white p-5 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.35)] md:p-6"
            >
              <p className="text-[13.5px] font-semibold text-slate-800">Antes de começar, quem está respondendo?</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
                O relatório sai com o seu nome e a sua empresa.
              </p>

              <div className="mt-5 grid gap-3.5">
                <Field label="Nome" error={show("name")}>
                  <input
                    autoComplete="name" value={lead.name}
                    onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))}
                    className={inputClass(!!show("name"))} placeholder="Seu nome completo"
                  />
                </Field>
                <Field label="E-mail" error={show("email")}>
                  <input
                    type="email" inputMode="email" autoComplete="email" value={lead.email}
                    onChange={(e) => setLead((l) => ({ ...l, email: e.target.value }))}
                    className={inputClass(!!show("email"))} placeholder="voce@empresa.com.br"
                  />
                </Field>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field label="Telefone (WhatsApp)" error={show("phone")}>
                    <input
                      type="tel" inputMode="tel" autoComplete="tel" value={lead.phone}
                      onChange={(e) => setLead((l) => ({ ...l, phone: formatPhone(e.target.value) }))}
                      className={inputClass(!!show("phone"))} placeholder="(51) 99999-9999"
                    />
                  </Field>
                  <Field label="Empresa" error={show("company")}>
                    <input
                      autoComplete="organization" value={lead.company}
                      onChange={(e) => setLead((l) => ({ ...l, company: e.target.value }))}
                      className={inputClass(!!show("company"))} placeholder="Onde você trabalha"
                    />
                  </Field>
                </div>

                {/* Armadilha para robô: fora da tela e fora do leitor de tela. */}
                <input
                  tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website"
                />

                <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-3.5">
                  <input
                    type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                    style={{ accentColor: "var(--c-primary)" }}
                  />
                  <span className="text-[12.5px] leading-relaxed text-slate-600">
                    Concordo que a {branding?.name ?? "empresa"} use estes dados para me enviar o resultado e
                    entrar em contato sobre o diagnóstico.
                  </span>
                </label>
                {touched && !consent && (
                  <p className="-mt-1.5 text-[12px] text-red-600">Marque a caixa para continuar.</p>
                )}
              </div>

              <Button
                type="submit" size="lg"
                className="mt-5 h-12 w-full rounded-2xl text-[15px] font-semibold text-white"
                style={{ background: "var(--c-primary)" }}
              >
                {answered > 0 ? "Continuar diagnóstico" : "Começar diagnóstico"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </SurveyShell>
    );
  }

  // ── Perguntas ──────────────────────────────────────────────────────────────
  if (!diag || !current) return null;
  const submitting = status === "submitting";
  const pct = Math.round((answered / questions.length) * 100);
  const hasAnswer = typeof answers[current.key] === "number";

  return (
    <SurveyShell style={shellStyle}>
      <SurveyHeaderBar
        branding={branding}
        right={
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={{ background: "color-mix(in srgb, var(--c-primary) 11%, #fff)", color: "var(--c-primary)" }}
          >
            Diagnóstico de liderança
          </span>
        }
      />

      <div className="border-b border-black/[0.05] bg-white/70 px-4 py-2.5 md:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: "var(--c-primary)" }} />
          </div>
          <span className="shrink-0 text-[11.5px] tabular-nums text-slate-500">{answered}/{questions.length}</span>
        </div>
      </div>

      {submitError && (
        <div className="mx-auto mt-3 w-full max-w-2xl px-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-[13.5px] font-semibold text-red-900">Não foi possível enviar</p>
            <p className="mt-1 text-[13px] leading-relaxed text-red-800">{submitError}</p>
          </div>
        </div>
      )}

      <main className="flex flex-1 items-start justify-center px-4 py-7 md:items-center md:py-10">
        <div key={index} className="w-full max-w-2xl duration-300 animate-in fade-in slide-in-from-right-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.13em]" style={{ color: "var(--c-primary)" }}>
            {DIMENSIONS[current.dimension]?.label ?? "Liderança"}
          </p>
          <h2 className="mt-2.5 text-[21px] font-semibold leading-snug tracking-tight text-slate-900 md:text-[25px]">
            “{current.text}”
          </h2>
          <p className="mt-2 text-[13px] text-slate-500">
            De {diag.scale_min} a {diag.scale_max}: quanto isso descreve a sua empresa hoje?
          </p>
          <div className="mt-6">
            <ScaleOptions
              min={diag.scale_min} max={diag.scale_max} labels={diag.scale_labels}
              value={answers[current.key]} onPick={pick}
            />
          </div>
          <p className="mt-6 hidden text-[11.5px] text-slate-400 md:block">
            Dica: use os números do teclado ({diag.scale_min} a {diag.scale_max}) para responder e as setas para navegar.
          </p>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-black/[0.06] bg-white/90 px-4 py-3 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Button
            variant="ghost" onClick={index === 0 ? () => { cancelAdvance(); setStatus("intro"); } : goBack}
            className="h-11 rounded-xl text-slate-600"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">{index === 0 ? "Meus dados" : "Anterior"}</span>
          </Button>

          <div className="text-[11.5px] text-slate-400">{index + 1} de {questions.length}</div>

          {isLast ? (
            <Button
              onClick={allAnswered ? submit : () => setIndex(questions.findIndex((q) => typeof answers[q.key] !== "number"))}
              disabled={submitting || !hasAnswer}
              className="h-11 rounded-xl px-5 text-[14.5px] font-semibold text-white disabled:opacity-30"
              style={{ background: "var(--c-primary)" }}
            >
              {submitting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando…</>
                : allAnswered
                  ? <>Ver meu resultado<ArrowRight className="ml-2 h-4 w-4" /></>
                  : <>Ir para a que falta<ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          ) : (
            <Button
              onClick={goNext} disabled={!hasAnswer}
              className="h-11 rounded-xl px-5 text-[14.5px] font-semibold text-white disabled:opacity-30"
              style={{ background: "var(--c-primary)" }}
            >
              Próxima<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
    </SurveyShell>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-[12px] text-slate-600">
      {children}
    </span>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-slate-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-[12px] text-red-600">{error}</span>}
    </label>
  );
}

const inputClass = (invalid: boolean) => cn(
  "h-12 w-full rounded-2xl border bg-white px-4 text-[15px] text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-[var(--c-primary)]",
  invalid ? "border-red-300" : "border-slate-200",
);
