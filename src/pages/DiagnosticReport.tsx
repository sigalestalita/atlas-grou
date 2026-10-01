import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, CheckCircle2, Link2, Loader2, Printer, Target, TrendingUp } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import {
  DIMENSIONS, LEVELS, RECOMMENDATIONS, dimensionScores, itemBand, levelByKey, priorities, strengths,
  type Answers, type DiagnosticQuestion,
} from "@/lib/diagnostic";

/**
 * Relatório individual do diagnóstico de maturidade da liderança.
 *
 * Abre logo depois do envio e continua no mesmo endereço depois — o token do
 * link é o que dá acesso, então dá para guardar, imprimir ou encaminhar. Segue
 * a identidade do relatório público: cores e logo da empresa que conduz.
 *
 * Índice e faixa vêm gravados do banco; pilares, forças e prioridades são
 * recalculados aqui a partir das notas, por `src/lib/diagnostic.ts`.
 */

const db = supabase as unknown as SupabaseClient;

interface ReportData {
  submission: { name: string; company_name: string; answers: Answers; score: number; level: string; created_at: string };
  diagnostic: {
    title: string; subtitle: string | null; questions: DiagnosticQuestion[];
    scale_min: number; scale_max: number; scale_labels: string[];
    cta_label: string | null; cta_url: string | null;
  };
  company: { name: string; logo_url: string | null; primary_color: string | null; secondary_color: string | null };
}

export default function DiagnosticReport() {
  const { token } = useParams();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) { setError("Link incompleto."); return; }
    db.rpc("get_diagnostic_report", { p_token: token }).then(({ data: row, error: err }) => {
      if (err || !row) { setError("Este relatório não existe ou o link veio incompleto."); return; }
      setData(row as ReportData);
    });
  }, [token]);

  useEffect(() => {
    if (data) document.title = `Diagnóstico de liderança · ${data.submission.name}`;
  }, [data]);

  const view = useMemo(() => {
    if (!data) return null;
    const { questions, scale_min, scale_max } = data.diagnostic;
    const answers = data.submission.answers;
    return {
      level: levelByKey(data.submission.level),
      dims: dimensionScores(questions, answers, scale_min, scale_max),
      strong: strengths(questions, answers),
      weak: priorities(questions, answers),
    };
  }, [data]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Não foi possível abrir o relatório</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !view) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Montando o seu relatório…</p>
        </div>
      </div>
    );
  }

  const { submission: sub, diagnostic: diag, company } = data;
  const { level, dims, strong, weak } = view;
  const brand = {
    "--c-primary": company.primary_color || "#15498D",
    "--c-secondary": company.secondary_color || "#071A34",
  } as React.CSSProperties;
  const date = new Date(sub.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const firstName = sub.name.split(/\s+/)[0];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* navegador bloqueou: o endereço continua na barra */ }
  };

  return (
    <div style={brand} className="min-h-screen bg-background [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* Topo */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md print:static print:bg-transparent">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-9 w-auto max-w-[160px] object-contain" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: "var(--c-primary)" }}>
                {company.name[0]}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Diagnóstico de liderança</p>
              <p className="truncate text-[14px] font-semibold">Maturidade da liderança</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={copyLink}>
              <Link2 className="mr-2 h-4 w-4" />{copied ? "Link copiado" : "Copiar link"}
            </Button>
            <Button size="sm" className="h-9 rounded-xl text-white" style={{ background: "var(--c-primary)" }} onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />Salvar PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-7 md:px-8 md:py-10">
        {/* Para quem */}
        <section className="mb-7">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--c-primary)" }}>
            Relatório individual
          </p>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight md:text-[32px]">
            {firstName}, este é o retrato da liderança da {sub.company_name}
          </h1>
          <p className="mt-2 text-[13.5px] text-muted-foreground">
            {sub.name} · {sub.company_name} · {date}
          </p>
        </section>

        {/* Índice e faixa */}
        <section className="mb-9 grid gap-5 lg:grid-cols-[minmax(0,330px)_1fr] print:break-inside-avoid">
          <div
            className="relative overflow-hidden rounded-[26px] p-6 text-white"
            style={{ backgroundImage: "linear-gradient(135deg, var(--c-secondary) 0%, var(--c-primary) 100%)" }}
          >
            <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
            <p className="relative text-[12px] font-medium uppercase tracking-[0.14em] text-white/70">Índice de maturidade</p>
            <p className="relative mt-2 text-[60px] font-bold leading-none tabular-nums">{sub.score}</p>
            <p className="relative mt-1 text-[13px] text-white/70">de 100</p>
            <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white/90 transition-all duration-1000" style={{ width: `${sub.score}%` }} />
            </div>
            <p className="relative mt-4 text-[13px] text-white/70">Nível {level.step} de 5</p>
            <p className="relative text-[22px] font-semibold">{level.label}</p>
          </div>

          <div className="flex flex-col justify-between gap-5 rounded-[22px] border border-border bg-card p-5 md:p-6">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">O que esse nível significa</p>
              <p className="mt-2 text-[15px] leading-relaxed">{level.meaning}</p>
            </div>
            <LevelRuler score={sub.score} current={level.key} />
            <div className="rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--c-primary) 7%, transparent)" }}>
              <p className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--c-primary)" }}>
                <ArrowRight className="h-4 w-4" /> Para chegar ao próximo nível
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/85">{level.next}</p>
            </div>
          </div>
        </section>

        {/* Pilares */}
        <section className="mb-9 print:break-inside-avoid">
          <SectionTitle title="Os quatro pilares" hint="Cada pilar reúne duas afirmações. O formato do gráfico mostra onde a liderança está mais apoiada e onde está descoberta." />
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-[22px] border border-border bg-card p-4">
              <div className="h-[280px] w-full md:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={dims.map((d) => ({ pilar: d.short, score: d.score }))} outerRadius="70%" margin={{ top: 8, right: 44, bottom: 8, left: 44 }}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="pilar" tick={{ fontSize: 12.5, fill: "hsl(var(--foreground))", fontWeight: 600 }} />
                    <PolarRadiusAxis domain={[0, 100]} tickCount={6} tick={false} axisLine={false} />
                    <Radar dataKey="score" stroke="var(--c-primary)" fill="var(--c-primary)" fillOpacity={0.22} strokeWidth={2.5} isAnimationActive={false} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {dims.map((d) => (
                <div key={d.key} className="rounded-[20px] border border-border bg-card p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[14px] font-semibold">{d.label}</p>
                    <p className="text-[20px] font-bold tabular-nums" style={{ color: d.level.color }}>{d.score}</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: d.level.color }} />
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{d.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Afirmação por afirmação */}
        <section className="mb-9 print:break-inside-avoid">
          <SectionTitle title="Afirmação por afirmação" hint={`A sua nota em cada uma, de ${diag.scale_min} a ${diag.scale_max}.`} />
          <div className="mt-4 divide-y divide-border rounded-[22px] border border-border bg-card">
            {diag.questions.map((q) => {
              const v = sub.answers[q.key];
              const b = itemBand(v, diag.scale_min, diag.scale_max);
              const cells = diag.scale_max - diag.scale_min;
              return (
                <div key={q.key} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-center md:gap-6">
                  <div className="min-w-0">
                    <p className="text-[14px] leading-snug">{q.text}</p>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">{DIMENSIONS[q.dimension]?.label}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-1 gap-1" aria-label={`Nota ${v} de ${diag.scale_max}`}>
                      {Array.from({ length: cells }, (_, i) => (
                        <span key={i} className="h-2.5 flex-1 rounded-full" style={{ background: i < v - diag.scale_min ? b.color : "hsl(var(--muted))" }} />
                      ))}
                    </div>
                    <span className="w-6 text-right text-[17px] font-bold tabular-nums" style={{ color: b.color }}>{v}</span>
                    <span className="hidden w-[118px] text-[11.5px] text-muted-foreground sm:block">{b.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Forças e prioridades */}
        <section className="mb-9 grid gap-5 lg:grid-cols-2 print:break-inside-avoid">
          <div className="rounded-[22px] border border-border bg-card p-5">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <CheckCircle2 className="h-4 w-4" style={{ color: "hsl(var(--climate-good))" }} /> O que já sustenta a liderança
            </p>
            {strong.length ? (
              <ul className="mt-3 space-y-2.5">
                {strong.map((s) => (
                  <li key={s.key} className="flex items-start justify-between gap-3 rounded-2xl bg-muted/50 p-3.5">
                    <p className="text-[13.5px] leading-snug">{s.text}</p>
                    <span className="text-[17px] font-bold tabular-nums" style={{ color: "hsl(var(--climate-good))" }}>{s.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                Nenhuma afirmação chegou a 4. Não há ainda uma prática consolidada para servir de apoio — por isso
                vale começar pelas prioridades, na ordem em que aparecem.
              </p>
            )}
          </div>

          <div className="rounded-[22px] border border-border bg-card p-5">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <Target className="h-4 w-4" style={{ color: "hsl(var(--climate-low))" }} /> Onde agir primeiro
            </p>
            {weak.length ? (
              <ol className="mt-3 space-y-2.5">
                {weak.map((w, i) => (
                  <li key={w.key} className="rounded-2xl bg-muted/50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13.5px] font-semibold leading-snug">{i + 1}. {w.text}</p>
                      <span className="text-[17px] font-bold tabular-nums" style={{ color: itemBand(w.value, diag.scale_min, diag.scale_max).color }}>{w.value}</span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{RECOMMENDATIONS[w.key]}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                Nenhuma afirmação ficou abaixo de 4. O trabalho agora é de manutenção: revisar o modelo de liderança
                com a estratégia e medir para não perder o que foi construído.
              </p>
            )}
          </div>
        </section>

        {/* Próximo passo */}
        {diag.cta_url && (
          <section className="mb-9 print:hidden">
            <div
              className="relative overflow-hidden rounded-[26px] p-6 text-white md:flex md:items-center md:justify-between md:gap-6 md:p-7"
              style={{ backgroundImage: "linear-gradient(135deg, var(--c-secondary) 0%, var(--c-primary) 100%)" }}
            >
              <div className="relative">
                <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-white/70">
                  <TrendingUp className="h-4 w-4" /> Próximo passo
                </p>
                <p className="mt-2 text-[19px] font-semibold leading-snug">
                  Quer transformar este diagnóstico em um plano para a sua liderança?
                </p>
              </div>
              <a
                href={diag.cta_url} target="_blank" rel="noopener noreferrer"
                className="relative mt-5 inline-flex h-11 shrink-0 items-center rounded-xl bg-white px-5 text-[14px] font-semibold md:mt-0"
                style={{ color: "var(--c-secondary)" }}
              >
                {diag.cta_label || `Falar com a ${company.name}`}<ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </div>
          </section>
        )}

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Como ler: cada afirmação vale de {diag.scale_min} a {diag.scale_max}. O índice soma os pontos e divide pelo
          máximo possível, em escala de 0 a 100. Os pilares fazem a mesma conta com as duas afirmações de cada um.
          O resultado reflete a percepção de quem respondeu, não uma auditoria.
        </p>
      </main>

      <footer className="border-t border-border py-7 text-center">
        <p className="text-[12px] text-muted-foreground">{company.name}</p>
      </footer>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** As cinco faixas lado a lado, com a atual marcada e o ponteiro no índice. */
function LevelRuler({ score, current }: { score: number; current: string }) {
  return (
    <div>
      <div className="relative">
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <div
              key={l.key}
              className="h-2.5 flex-1 rounded-full transition-opacity"
              style={{ background: l.color, opacity: l.key === current ? 1 : 0.25 }}
            />
          ))}
        </div>
        <div
          className="absolute -top-1.5 h-5 w-1 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-background"
          style={{ left: `${Math.min(99, Math.max(1, score))}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-2 flex gap-1">
        {LEVELS.map((l) => (
          <p
            key={l.key}
            className={`flex-1 text-center text-[10.5px] leading-tight ${l.key === current ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            {l.label}
          </p>
        ))}
      </div>
    </div>
  );
}
