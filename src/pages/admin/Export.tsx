import { useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, Loader2, ShieldCheck, Table2 } from "lucide-react";
import ExcelJS from "exceljs";
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend, Title, DoughnutController, ArcElement,
} from "chart.js";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { useSurveyAnalytics } from "@/lib/useSurveyAnalytics";
import { MIN_GROUP, climateBand, truncate } from "@/lib/climate";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title, DoughnutController, ArcElement);

/** Paleta da marca, para os gráficos embutidos na planilha. */
const NAVY = "#071A34";
const BLUE = "#15498D";

const GOOD = "#2E8B62";
const WARN = "#C07A11";
const BAD = "#C2382E";

interface ContextType { company: { id: string; name: string } }

type GroupBy = "department" | "company_leadership" | "department_leadership" | "evaluated_leader";

const GROUP_LABELS: Record<GroupBy, string> = {
  department: "Área",
  company_leadership: "Liderança empresarial",
  department_leadership: "Liderança de área",
  evaluated_leader: "Liderança avaliada",
};

/** Desenha um gráfico do Chart.js fora da tela e devolve o PNG. */
async function chartToPng(config: unknown, width = 900, height = 450): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = "fixed";
  canvas.style.left = "-99999px";
  document.body.appendChild(canvas);
  const chart = new Chart(canvas, {
    ...(config as any),
    options: { ...((config as any).options || {}), animation: false, responsive: false, devicePixelRatio: 2 },
  });
  chart.update("none");
  const dataUrl = canvas.toDataURL("image/png");
  chart.destroy();
  canvas.remove();
  return (await fetch(dataUrl)).arrayBuffer();
}

/**
 * Exportação dos resultados.
 *
 * Tudo aqui sai da mesma agregação que alimenta o dashboard, então a planilha
 * e a tela contam a mesma história — antes cada uma fazia a sua conta e os
 * números divergiam.
 *
 * O "relatório individual" que existia nesta tela foi removido. Ele ligava
 * cada colaborador, pelo nome, às respostas dele, adivinhando a autoria pela
 * proximidade entre o horário do envio e o horário em que a pessoa foi marcada
 * como respondida. Isso contrariava a promessa feita ao colaborador na tela da
 * pesquisa e a regra do próprio produto ("nunca exportar resposta vinculada a
 * nome") — e ainda por cima era um chute: duas pessoas da mesma área
 * respondendo perto uma da outra saíam com as respostas trocadas.
 */
export default function ExportPage() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;
  const { toast } = useToast();

  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [generating, setGenerating] = useState(false);

  const a = useSurveyAnalytics(companyId);

  const exportWorkbook = async () => {
    if (!a.survey) return;
    setGenerating(true);
    try {
      const { scale_min: min, scale_max: max } = a.survey;
      const label = GROUP_LABELS[groupBy];
      const band = climateBand(a.overallScore);

      const groupRows = groupBy === "department"
        ? a.departments.groups
        : groupBy === "evaluated_leader"
          ? a.leaders.map((l) => ({ name: l.name, avg: l.avg, score: l.score, people: l.people, answers: l.answers }))
          : [];

      const cut = (s: string, n = 42) => truncate(s, n);
      const ranked = [...a.questionStats].sort((x, y) => y.avg - x.avg);
      const top = ranked.slice(0, 5);
      const bottom = ranked.slice(-5).reverse();

      const barColor = (score: number) => (score >= 70 ? GOOD : score >= 55 ? WARN : BAD);

      const charts: { buffer: ArrayBuffer; height: number }[] = [];

      if (groupRows.length) {
        charts.push({
          height: Math.max(280, groupRows.length * 34 + 90),
          buffer: await chartToPng({
            type: "bar",
            data: {
              labels: groupRows.map((g) => cut(g.name, 30)),
              datasets: [{
                label: `Média por ${label.toLowerCase()}`,
                data: groupRows.map((g) => g.avg),
                backgroundColor: groupRows.map((g) => barColor(g.score)),
              }],
            },
            options: {
              indexAxis: "y",
              scales: { x: { min, max } },
              plugins: { legend: { display: false }, title: { display: true, text: `Média por ${label.toLowerCase()}` } },
            },
          }, 900, Math.max(280, groupRows.length * 34 + 90)),
        });
      }

      const sectionRows = a.sections.map((sec) => {
        const qs = a.questionStats.filter((q) => q.sectionId === sec.id);
        const total = qs.reduce((acc, q) => acc + q.avg * q.answers, 0);
        const n = qs.reduce((acc, q) => acc + q.answers, 0);
        return { title: sec.title, avg: n ? Math.round((total / n) * 100) / 100 : 0, answers: n };
      }).filter((s) => s.answers > 0);

      if (sectionRows.length) {
        charts.push({
          height: Math.max(260, sectionRows.length * 34 + 90),
          buffer: await chartToPng({
            type: "bar",
            data: {
              labels: sectionRows.map((s) => cut(s.title, 34)),
              datasets: [{ label: "Média", data: sectionRows.map((s) => s.avg), backgroundColor: BLUE }],
            },
            options: {
              indexAxis: "y",
              scales: { x: { min, max } },
              plugins: { legend: { display: false }, title: { display: true, text: "Média por categoria" } },
            },
          }, 900, Math.max(260, sectionRows.length * 34 + 90)),
        });
      }

      if (top.length) {
        charts.push({
          height: 320,
          buffer: await chartToPng({
            type: "bar",
            data: {
              labels: top.map((q) => cut(q.text, 42)),
              datasets: [{ label: "Média", data: top.map((q) => q.avg), backgroundColor: GOOD }],
            },
            options: {
              indexAxis: "y", scales: { x: { min, max } },
              plugins: { legend: { display: false }, title: { display: true, text: "Melhores resultados" } },
            },
          }, 900, 320),
        });
      }

      if (bottom.length) {
        charts.push({
          height: 320,
          buffer: await chartToPng({
            type: "bar",
            data: {
              labels: bottom.map((q) => cut(q.text, 42)),
              datasets: [{ label: "Média", data: bottom.map((q) => q.avg), backgroundColor: BAD }],
            },
            options: {
              indexAxis: "y", scales: { x: { min, max } },
              plugins: { legend: { display: false }, title: { display: true, text: "Pontos de atenção" } },
            },
          }, 900, 320),
        });
      }

      // Distribuição somada de todas as perguntas de escala.
      const dist = new Array(max - min + 1).fill(0);
      for (const q of a.questionStats) q.dist.forEach((n, i) => { dist[i] += n; });
      if (dist.some((n) => n > 0)) {
        charts.push({
          height: 380,
          buffer: await chartToPng({
            type: "doughnut",
            data: {
              labels: dist.map((_, i) => `Nota ${min + i}`),
              datasets: [{
                data: dist,
                backgroundColor: dist.map((_, i) => {
                  const pct = ((min + i - min) / (max - min)) * 100;
                  return pct >= 70 ? GOOD : pct >= 45 ? WARN : BAD;
                }),
              }],
            },
            options: { plugins: { title: { display: true, text: "Como as notas se distribuíram" } } },
          }, 760, 380),
        });
      }

      // ── Planilha ──
      const wb = new ExcelJS.Workbook();
      wb.creator = "Atlas";
      wb.created = new Date();

      const header = (ws: ExcelJS.Worksheet, cols: string[]) => {
        const row = ws.addRow(cols);
        row.font = { bold: true, color: { argb: "FFFFFFFF" } };
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${NAVY.slice(1)}` } };
        });
      };

      const resumo = wb.addWorksheet("Resumo");
      resumo.columns = [{ width: 42 }, { width: 28 }];
      const title = resumo.addRow([a.survey.title]);
      title.font = { bold: true, size: 15, color: { argb: `FF${NAVY.slice(1)}` } };
      resumo.addRow([]);
      resumo.addRow(["Score de clima (0–100)", a.overallScore]);
      resumo.addRow(["Leitura", band.label]);
      resumo.addRow(["Média na escala", `${a.overallAvg} de ${max}`]);
      resumo.addRow(["Pessoas que responderam", a.people]);
      if (!a.survey.open_access) {
        resumo.addRow(["Convidados", a.invited]);
        resumo.addRow(["Taxa de resposta", `${a.responseRate}%`]);
      }
      if (a.enps) {
        resumo.addRow([]);
        resumo.addRow(["eNPS", a.enps.score]);
        resumo.addRow(["Promotores (9–10)", `${a.enps.promoters} (${a.enps.promoterPct}%)`]);
        resumo.addRow(["Neutros (7–8)", `${a.enps.passives} (${a.enps.passivePct}%)`]);
        resumo.addRow(["Detratores (0–6)", `${a.enps.detractors} (${a.enps.detractorPct}%)`]);
      }
      resumo.addRow([]);
      resumo.addRow(["Agrupado por", label]);
      resumo.addRow([
        "Anonimato",
        `Recortes com menos de ${MIN_GROUP} pessoas foram omitidos.`,
      ]);
      resumo.addRow(["Gerado em", new Date().toLocaleString("pt-BR")]);

      if (charts.length) {
        const ws = wb.addWorksheet("Gráficos");
        ws.getColumn(1).width = 3;
        let cursor = 1;
        for (const c of charts) {
          const id = wb.addImage({ buffer: c.buffer as never, extension: "png" });
          ws.addImage(id, { tl: { col: 1, row: cursor } as never, ext: { width: 900, height: c.height } });
          cursor += Math.ceil(c.height / 20) + 3;
        }
      }

      const perguntas = wb.addWorksheet("Perguntas");
      perguntas.columns = [{ width: 64 }, { width: 26 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 10 }];
      header(perguntas, ["Pergunta", "Categoria", "Média", "Score", "Concordância", "Pessoas"]);
      for (const q of [...a.questionStats].sort((x, y) => x.avg - y.avg)) {
        perguntas.addRow([q.text, q.section, q.avg, q.score, `${q.consensus}%`, q.people]);
      }

      const distribuicao = wb.addWorksheet("Distribuição");
      distribuicao.columns = [{ width: 64 }, { width: 11 }, ...dist.map(() => ({ width: 9 })), { width: 10 }];
      header(distribuicao, ["Pergunta", "Respostas", ...dist.map((_, i) => `Nota ${min + i}`), "Média"]);
      for (const q of a.questionStats) distribuicao.addRow([q.text, q.answers, ...q.dist, q.avg]);

      if (sectionRows.length) {
        const cat = wb.addWorksheet("Categorias");
        cat.columns = [{ width: 46 }, { width: 10 }, { width: 12 }];
        header(cat, ["Categoria", "Média", "Respostas"]);
        for (const s of sectionRows) cat.addRow([s.title, s.avg, s.answers]);
      }

      if (groupRows.length) {
        const ws = wb.addWorksheet(label.slice(0, 28));
        ws.columns = [{ width: 40 }, { width: 10 }, { width: 10 }, { width: 11 }];
        header(ws, [label, "Média", "Score", "Pessoas"]);
        for (const g of groupRows) ws.addRow([g.name, g.avg, g.score, g.people]);
      }

      if (a.textAnswers.length) {
        const ws = wb.addWorksheet("Comentários");
        ws.columns = [{ width: 52 }, { width: 80 }, { width: 8 }, { width: 22 }];
        header(ws, ["Pergunta", "Comentário", "Nota", "Área"]);
        for (const t of a.textAnswers) {
          const row = ws.addRow([t.question, t.text, t.value ?? "", t.department ?? ""]);
          row.getCell(2).alignment = { wrapText: true, vertical: "top" };
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clima-${(a.company?.name ?? "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: "Planilha gerada", description: "Resumo, gráficos, perguntas, categorias e comentários." });
    } catch (e) {
      toast({
        title: "Não foi possível exportar",
        description: e instanceof Error ? e.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  if (a.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-52 rounded-[22px]" />
      </div>
    );
  }

  if (!a.survey || a.people === 0) {
    return (
      <>
        <PageHeader title="Exportar" description="Baixe os resultados em planilha." />
        <EmptyState
          icon={FileSpreadsheet}
          title="Nada para exportar ainda"
          description="A exportação fica disponível assim que as primeiras respostas chegarem."
        />
      </>
    );
  }

  const available: GroupBy[] = [
    ...(a.departments.groups.length ? (["department"] as GroupBy[]) : []),
    ...(a.leaders.length ? (["evaluated_leader"] as GroupBy[]) : []),
  ];

  return (
    <>
      <PageHeader
        title="Exportar"
        description="Uma planilha com o resumo, os gráficos e os dados por trás de cada número do painel."
      />

      <Card className="rounded-[22px]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="h-4 w-4 text-primary" />Planilha de resultados
          </CardTitle>
          <CardDescription>
            Abas de resumo, gráficos, resultado por pergunta, distribuição de notas, categorias e
            comentários. Os números são exatamente os do painel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {available.length > 1 && (
            <div className="max-w-xs">
              <label className="mb-1.5 block text-[13px] font-medium">Aba de recorte</label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {available.map((g) => <SelectItem key={g} value={g}>{GROUP_LABELS[g]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-accent/50 p-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Nada sai vinculado a nome. Recortes com menos de {MIN_GROUP} pessoas ficam de fora,
              para que ninguém possa ser identificado por eliminação.
            </p>
          </div>

          <Button className="h-10 rounded-xl" onClick={exportWorkbook} disabled={generating}>
            {generating
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando…</>
              : <><Download className="mr-2 h-4 w-4" />Baixar planilha</>}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
