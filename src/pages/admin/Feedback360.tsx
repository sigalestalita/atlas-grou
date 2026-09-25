import { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, ChevronRight, Download, Eye, FileDown, MoveDown, MoveUp,
  Users, UsersRound,
} from "lucide-react";
import jsPDF from "jspdf";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { use360, type Evaluatee } from "@/lib/use360";
import { scoreColor, truncate } from "@/lib/climate";

interface ContextType { company: { id: string; name: string } }

/** Mínimo de pares para mostrar o resultado de uma pessoa. */
const MIN_PEERS = 3;

/**
 * Rodada 360: o retorno de cada pessoa avaliada.
 *
 * O Atlas nasceu para ler o clima da empresa inteira, então todos os painéis
 * agregavam por área e por liderança. Num 360 a unidade é outra: o que
 * interessa é o retrato de cada pessoa — como os pares a veem, como ela se vê,
 * e o tamanho da diferença entre as duas coisas.
 */
export default function Feedback360() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;
  const { toast } = useToast();

  const r = use360(companyId);
  const [exporting, setExporting] = useState(false);

  const scale = { min: r.survey?.scale_min ?? 1, max: r.survey?.scale_max ?? 5 };

  const overall = useMemo(() => {
    const withPeers = r.evaluatees.filter((e) => e.peerAvg != null);
    if (!withPeers.length) return null;
    const avg = withPeers.reduce((a, e) => a + e.peerAvg!, 0) / withPeers.length;
    return Math.round(avg * 100) / 100;
  }, [r.evaluatees]);

  /** Gera o PDF de uma pessoa, ou de todas em sequência. */
  const exportPdf = async (only?: Evaluatee) => {
    if (!r.survey) return;
    setExporting(true);
    try {
      const list = only ? [only] : r.evaluatees.filter((e) => e.peers >= MIN_PEERS);
      if (!list.length) {
        toast({
          title: "Nada para exportar",
          description: `Nenhuma pessoa tem ao menos ${MIN_PEERS} avaliações de pares.`,
          variant: "destructive",
        });
        return;
      }
      for (const person of list) buildPdf(person, r, scale).save(fileName(person.name));
      toast({
        title: list.length === 1 ? "PDF gerado" : `${list.length} PDFs gerados`,
        description: "Um arquivo por pessoa avaliada.",
      });
    } finally {
      setExporting(false);
    }
  };

  if (r.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-32 rounded-[22px]" /><Skeleton className="h-32 rounded-[22px]" /><Skeleton className="h-32 rounded-[22px]" /></div>
        <Skeleton className="h-80 rounded-[22px]" />
      </div>
    );
  }

  if (r.error) {
    return <EmptyState icon={AlertTriangle} title="Não foi possível carregar" description={r.error}
      action={<Button onClick={r.reload}>Tentar de novo</Button>} />;
  }

  if (!r.survey) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Nenhuma avaliação 360 nesta empresa"
        description="Esta tela aparece quando existe uma pesquisa configurada no modo 360 — aquela em que cada pessoa avalia um conjunto de colegas e a si mesma."
      />
    );
  }

  const done = r.evaluatees.filter((e) => e.peers >= MIN_PEERS).length;

  return (
    <>
      <PageHeader
        title={r.survey.title}
        description={
          <>
            {r.finished} de {r.participants} concluíram
            {r.survey.wave_label && ` · rodada ${r.survey.wave_label}`}
            {r.survey.status === "closed" && " · encerrada"}
          </>
        }
        actions={
          <Button className="h-9 rounded-xl" onClick={() => exportPdf()} disabled={exporting || done === 0}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Gerando…" : "Baixar todos os PDFs"}
          </Button>
        }
      />

      {r.survey.identified && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-[13px] leading-relaxed text-amber-900">
            Esta rodada é <strong>identificada</strong>: abaixo você vê quem escreveu cada
            avaliação, e o respondente foi avisado disso antes de responder. O PDF entregue à
            pessoa avaliada sai <strong>sem</strong> os nomes de quem escreveu.
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="navy" icon={Users} label="Participação" value={`${r.participants ? Math.round((r.finished / r.participants) * 100) : 0}%`}
          hint={`${r.finished} de ${r.participants} concluíram todas as etapas`}>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white/90 transition-all duration-700"
              style={{ width: `${r.participants ? (r.finished / r.participants) * 100 : 0}%` }} />
          </div>
        </StatCard>
        <StatCard tone="teal" icon={UsersRound} label="Pessoas avaliadas" value={r.evaluatees.length}
          hint={`${done} com resultado liberado`} />
        <StatCard tone="sky" icon={MoveUp} label="Média da diretoria"
          value={overall ?? "—"} hint={`numa escala de ${scale.min} a ${scale.max}`} />
        <StatCard tone="amber" icon={MoveDown} label="Maior distância"
          value={biggestGapLabel(r.evaluatees)}
          hint="entre como a pessoa se vê e como os pares a veem" />
      </div>

      {r.evaluatees.length === 0 ? (
        <EmptyState icon={UsersRound} title="Ninguém atribuído ainda"
          description="Monte a matriz em 'Quem avalia quem' para definir quem avalia quem nesta rodada." />
      ) : (
        <div className="space-y-3">
          {r.evaluatees.map((e) => (
            <PersonCard key={e.name} person={e} scale={scale} identified={r.survey!.identified}
              onExport={() => exportPdf(e)} exporting={exporting} />
          ))}
        </div>
      )}
    </>
  );
}

function biggestGapLabel(list: Evaluatee[]): string {
  const withGap = list.filter((e) => e.gap != null);
  if (!withGap.length) return "—";
  const top = withGap.reduce((a, b) => (Math.abs(b.gap!) > Math.abs(a.gap!) ? b : a));
  return `${top.gap! > 0 ? "+" : ""}${top.gap!.toFixed(1)}`;
}

function PersonCard({
  person, scale, identified, onExport, exporting,
}: {
  person: Evaluatee;
  scale: { min: number; max: number };
  identified: boolean;
  onExport: () => void;
  exporting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const enough = person.peers >= MIN_PEERS;
  const pct = person.peerAvg != null
    ? ((person.peerAvg - scale.min) / (scale.max - scale.min)) * 100
    : 0;

  // Agrupa os textos por pergunta, na ordem em que foram feitas.
  const byQuestion = useMemo(() => {
    const m = new Map<string, typeof person.peerTexts>();
    for (const t of person.peerTexts) {
      (m.get(t.question) ?? m.set(t.question, []).get(t.question)!).push(t);
    }
    return Array.from(m.entries());
  }, [person.peerTexts]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden rounded-[22px]">
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-accent/40">
            <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />

            <div className="min-w-[180px] flex-1">
              <p className="text-[15px] font-semibold">{person.name}</p>
              {person.role && <p className="text-[12px] text-muted-foreground">{person.role}</p>}
            </div>

            {enough ? (
              <>
                <div className="w-40">
                  <div className="mb-1 flex items-baseline justify-between text-[11.5px] text-muted-foreground">
                    <span>pares</span>
                    <span className="text-[15px] font-bold tabular-nums" style={{ color: scoreColor(pct) }}>
                      {person.peerAvg?.toFixed(2)}
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>

                <div className="text-center">
                  <p className="text-[11.5px] text-muted-foreground">autoavaliação</p>
                  <p className="text-[15px] font-bold tabular-nums">
                    {person.selfRating ?? "—"}
                  </p>
                </div>

                <GapBadge gap={person.gap} />
              </>
            ) : (
              <Badge variant="secondary" className="rounded-full text-[11px]">
                {person.peers} de {person.expectedPeers} avaliações — falta{person.expectedPeers - person.peers === 1 ? "" : "m"} {Math.max(0, MIN_PEERS - person.peers)} para liberar
              </Badge>
            )}

            <span
              role="button"
              tabIndex={0}
              onClick={(ev) => { ev.stopPropagation(); if (enough) onExport(); }}
              onKeyDown={(ev) => { if (ev.key === "Enter") { ev.stopPropagation(); if (enough) onExport(); } }}
              aria-disabled={!enough || exporting}
              className={`inline-flex h-9 items-center rounded-xl border border-border px-3 text-[13px] font-medium transition-colors ${
                enough && !exporting ? "hover:bg-accent" : "pointer-events-none opacity-40"
              }`}
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" />PDF
            </span>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="border-t border-border pt-5">
            {!enough ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                O resultado só aparece a partir de {MIN_PEERS} avaliações de pares — abaixo disso
                ficaria fácil demais deduzir quem escreveu o quê.
              </p>
            ) : (
              <div className="space-y-6">
                {person.selfTexts.length > 0 && (
                  <section>
                    <h4 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Como {person.name.split(" ")[0]} se vê
                    </h4>
                    <div className="space-y-2.5">
                      {person.selfTexts.map((t, i) => (
                        <div key={i} className="rounded-xl bg-secondary/60 p-3.5">
                          <p className="mb-1 text-[11.5px] text-muted-foreground">{truncate(t.question, 90)}</p>
                          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{t.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {byQuestion.map(([question, texts]) => (
                  <section key={question}>
                    <h4 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {truncate(question, 110)}
                    </h4>
                    <div className="space-y-2.5">
                      {texts.map((t, i) => (
                        <blockquote key={i} className="rounded-xl border-l-[3px] border-primary bg-card p-3.5 shadow-sm">
                          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{t.text}</p>
                          {identified && t.evaluator && (
                            <p className="mt-2 text-[11.5px] text-muted-foreground">— {t.evaluator}</p>
                          )}
                        </blockquote>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/**
 * A distância entre a autoavaliação e a média dos pares.
 *
 * O sinal importa mais que o tamanho: quem se vê acima do que os pares veem
 * tende a não buscar ajuda; quem se vê abaixo costuma estar sendo duro demais
 * consigo. Perto de zero é leitura alinhada, que é o resultado saudável.
 */
function GapBadge({ gap }: { gap: number | null }) {
  if (gap == null) {
    return <Badge variant="outline" className="rounded-full text-[11px]">sem autoavaliação</Badge>;
  }
  const big = Math.abs(gap) >= 1;
  const label = Math.abs(gap) < 0.25 ? "leitura alinhada" : gap > 0 ? "se vê acima" : "se vê abaixo";
  const color = !big ? "hsl(var(--climate-good))" : gap > 0 ? "hsl(var(--climate-low))" : "hsl(var(--climate-mid))";
  return (
    <div className="text-center">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-bold tabular-nums" style={{ color }}>
        {gap > 0 ? "+" : ""}{gap.toFixed(2)}
      </p>
    </div>
  );
}

function fileName(name: string): string {
  return `360-${name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
}

/**
 * O PDF que vai para a pessoa avaliada.
 *
 * Sai sempre sem os nomes de quem escreveu, mesmo numa rodada identificada: a
 * coordenação precisa saber a origem para conduzir o processo, a pessoa
 * avaliada precisa do conteúdo. Misturar as duas coisas transformaria a
 * devolutiva num acerto de contas.
 */
function buildPdf(
  person: Evaluatee,
  r: ReturnType<typeof use360>,
  scale: { min: number; max: number },
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 56;
  const maxW = W - M * 2;
  let y = M;

  const space = (n: number) => { y += n; };
  const page = (need = 60) => {
    if (y + need > doc.internal.pageSize.getHeight() - M) { doc.addPage(); y = M; }
  };

  const text = (str: string, size: number, style: "normal" | "bold" = "normal", color = "#16161A") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(str, maxW) as string[];
    for (const line of lines) {
      page(size + 6);
      doc.text(line, M, y);
      y += size + 4;
    }
  };

  // Capa
  text(r.company?.name ?? "", 10, "normal", "#6B7280");
  space(2);
  text(r.survey?.title ?? "Avaliação 360", 20, "bold");
  space(6);
  text(person.name, 16, "bold");
  if (person.role) text(person.role, 11, "normal", "#6B7280");
  space(14);

  // Números
  doc.setDrawColor("#E5E7EB");
  doc.setFillColor("#F6F7F9");
  page(84);
  doc.roundedRect(M, y, maxW, 70, 10, 10, "F");
  const cellY = y + 26;
  const col = maxW / 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#16161A");
  doc.text(person.peerAvg?.toFixed(2) ?? "—", M + 18, cellY);
  doc.text(person.selfRating != null ? String(person.selfRating) : "—", M + col + 18, cellY);
  doc.text(person.gap != null ? `${person.gap > 0 ? "+" : ""}${person.gap.toFixed(2)}` : "—", M + col * 2 + 18, cellY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#6B7280");
  doc.text(`média dos pares (${person.peers} avaliações)`, M + 18, cellY + 16);
  doc.text("autoavaliação", M + col + 18, cellY + 16);
  doc.text("diferença", M + col * 2 + 18, cellY + 16);
  y += 88;

  text(`Escala de ${scale.min} a ${scale.max}. ${(r.survey?.scale_labels ?? []).join(" · ")}`, 8.5, "normal", "#9CA3AF");
  space(12);

  // Autoavaliação
  if (person.selfTexts.length) {
    page(70);
    text("Autoavaliação", 13, "bold");
    space(4);
    for (const t of person.selfTexts) {
      text(t.question, 9, "bold", "#6B7280");
      space(1);
      text(t.text, 10.5);
      space(8);
    }
    space(6);
  }

  // Pares, agrupados por pergunta e sem assinatura
  const grouped = new Map<string, string[]>();
  for (const t of person.peerTexts) {
    (grouped.get(t.question) ?? grouped.set(t.question, []).get(t.question)!).push(t.text);
  }
  for (const [question, texts] of grouped) {
    page(70);
    text(question, 11, "bold");
    space(4);
    texts.forEach((t, i) => {
      text(`${i + 1}. ${t}`, 10.5);
      space(6);
    });
    space(6);
  }

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#9CA3AF");
    doc.text(
      "As avaliações dos pares são apresentadas sem identificação de quem as escreveu.",
      M, doc.internal.pageSize.getHeight() - 30,
    );
    doc.text(`${i}/${pages}`, W - M, doc.internal.pageSize.getHeight() - 30, { align: "right" });
  }

  return doc;
}
