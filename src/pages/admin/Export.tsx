import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Download, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  DoughnutController,
  ArcElement,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title, DoughnutController, ArcElement);

// Render a Chart.js config to PNG buffer (offscreen canvas)
async function renderChartPng(config: any, width = 900, height = 450): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // Hidden but in DOM for safety
  canvas.style.position = 'fixed';
  canvas.style.left = '-99999px';
  document.body.appendChild(canvas);
  const chart = new Chart(canvas, { ...config, options: { ...(config.options || {}), animation: false, responsive: false, devicePixelRatio: 2 } });
  chart.update('none');
  const dataUrl = canvas.toDataURL('image/png');
  chart.destroy();
  canvas.remove();
  const res = await fetch(dataUrl);
  return await res.arrayBuffer();
}

interface ContextType { company: { id: string } }

export default function ExportPage() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId, isSuperAdmin } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [groupBy, setGroupBy] = useState<string>('department');
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const exportData = async () => {
    if (!companyId) return;
    setGenerating(true);
    try {
      const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).neq('status', 'draft').limit(1);
      const survey = surveys?.[0];
      if (!survey) { toast({ title: 'Nenhuma pesquisa encontrada', variant: 'destructive' }); return; }

      const { data: sections } = await supabase.from('survey_sections').select('*').eq('survey_id', survey.id).order('sort_order');
      const { data: questions } = await supabase.from('survey_questions').select('*').in('section_id', (sections || []).map(s => s.id)).order('sort_order');
      const { data: responses } = await supabase.from('survey_responses').select('*').eq('survey_id', survey.id);

      if (!responses?.length || !questions?.length) { toast({ title: 'Sem dados para exportar', variant: 'destructive' }); return; }

      const qList = questions || [];
      const sectionsList = sections || [];
      const scaleQuestions = qList.filter(q => q.question_type === 'scale' || q.value != null || true).filter(q => q.question_type !== 'open_text');

      // Group responses
      const groups = new Map<string, Map<string, number[]>>();
      responses.forEach(r => {
        const key = (groupBy === 'department' ? r.department : groupBy === 'company_leadership' ? r.company_leadership : r.department_leadership) || 'N/A';
        if (!groups.has(key)) groups.set(key, new Map());
        const qMap = groups.get(key)!;
        const arr = qMap.get(r.question_id) || [];
        if (r.value != null) arr.push(r.value);
        qMap.set(r.question_id, arr);
      });

      // Filter groups with min 3 responses per question on average
      const visibleGroups: { name: string; qMap: Map<string, number[]>; overall: number; count: number }[] = [];
      groups.forEach((qMap, name) => {
        const allVals = Array.from(qMap.values()).flat();
        if (allVals.length < 3 * scaleQuestions.length) return;
        const overall = allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
        visibleGroups.push({ name, qMap, overall: Math.round(overall * 100) / 100, count: allVals.length });
      });
      visibleGroups.sort((a, b) => b.overall - a.overall);

      // Per-question averages overall
      const perQuestion = scaleQuestions.map(q => {
        const allVals: number[] = [];
        responses.forEach(r => { if (r.question_id === q.id && r.value != null) allVals.push(r.value); });
        const avg = allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
        return { q, avg: Math.round(avg * 100) / 100, n: allVals.length };
      });
      const sortedQ = [...perQuestion].sort((a, b) => b.avg - a.avg);
      const topQ = sortedQ.slice(0, 5);
      const bottomQ = sortedQ.slice(-5).reverse();

      // Distribution (1..N)
      const scaleMax = (survey as any).scale_max || 5;
      const dist = new Array(scaleMax).fill(0);
      responses.forEach(r => { if (r.value != null && r.value >= 1 && r.value <= scaleMax) dist[r.value - 1]++; });

      // Per-section averages
      const perSection = sectionsList.map(s => {
        const qIds = new Set(qList.filter(q => q.section_id === s.id).map(q => q.id));
        const vals = responses.filter(r => qIds.has(r.question_id) && r.value != null).map(r => r.value as number);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        return { title: s.title, avg: Math.round(avg * 100) / 100, n: vals.length };
      }).filter(s => s.n > 0);

      // === Render chart images ===
      const palette = ['#ff5700', '#03104f', '#ff9431', '#041023', '#5b6cae', '#f6b48c'];
      const truncate = (s: string, n = 40) => s.length > n ? s.substring(0, n - 1) + '…' : s;

      const chartGroups = await renderChartPng({
        type: 'bar',
        data: {
          labels: visibleGroups.map(g => truncate(g.name, 25)),
          datasets: [{ label: 'Média geral', data: visibleGroups.map(g => g.overall), backgroundColor: '#ff5700' }],
        },
        options: { plugins: { title: { display: true, text: `Média por ${groupBy === 'department' ? 'Departamento' : groupBy === 'company_leadership' ? 'Liderança Empresarial' : 'Liderança de Área'}`, font: { size: 16 } }, legend: { display: false } }, scales: { y: { beginAtZero: true, max: scaleMax } } },
      }, 1000, 480);

      const chartSections = await renderChartPng({
        type: 'bar',
        data: {
          labels: perSection.map(s => truncate(s.title, 30)),
          datasets: [{ label: 'Média', data: perSection.map(s => s.avg), backgroundColor: '#03104f' }],
        },
        options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Média por Seção', font: { size: 16 } }, legend: { display: false } }, scales: { x: { beginAtZero: true, max: scaleMax } } },
      }, 1000, Math.max(300, perSection.length * 40 + 80));

      const chartTop = await renderChartPng({
        type: 'bar',
        data: {
          labels: topQ.map(p => truncate(p.q.text, 50)),
          datasets: [{ label: 'Média', data: topQ.map(p => p.avg), backgroundColor: '#10b981' }],
        },
        options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Top 5 — Perguntas mais bem avaliadas', font: { size: 16 } }, legend: { display: false } }, scales: { x: { beginAtZero: true, max: scaleMax } } },
      }, 1000, 380);

      const chartBottom = await renderChartPng({
        type: 'bar',
        data: {
          labels: bottomQ.map(p => truncate(p.q.text, 50)),
          datasets: [{ label: 'Média', data: bottomQ.map(p => p.avg), backgroundColor: '#ef4444' }],
        },
        options: { indexAxis: 'y', plugins: { title: { display: true, text: 'Bottom 5 — Perguntas com menor avaliação', font: { size: 16 } }, legend: { display: false } }, scales: { x: { beginAtZero: true, max: scaleMax } } },
      }, 1000, 380);

      const scaleLabels = ((survey as any).scale_labels as string[]) || dist.map((_, i) => `${i + 1}`);
      const chartDist = await renderChartPng({
        type: 'doughnut',
        data: {
          labels: scaleLabels.slice(0, scaleMax),
          datasets: [{ data: dist, backgroundColor: palette.slice(0, scaleMax) }],
        },
        options: { plugins: { title: { display: true, text: 'Distribuição das respostas', font: { size: 16 } }, legend: { position: 'right' } } },
      }, 700, 450);

      // === Build workbook with ExcelJS ===
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Atlas';
      wb.created = new Date();

      // Resumo
      const resumo = wb.addWorksheet('Resumo');
      resumo.columns = [{ width: 40 }, { width: 20 }];
      resumo.addRow([survey.title]).font = { bold: true, size: 16 };
      resumo.addRow([]);
      resumo.addRow(['Total de respostas', responses.length]);
      resumo.addRow(['Grupos exibidos', visibleGroups.length]);
      resumo.addRow(['Perguntas', scaleQuestions.length]);
      const allVals = responses.map(r => r.value).filter((v): v is number => v != null);
      const overallAvg = allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
      resumo.addRow(['Média geral', Math.round(overallAvg * 100) / 100]);
      resumo.addRow([]);
      resumo.addRow(['Agrupado por', groupBy === 'department' ? 'Departamento' : groupBy === 'company_leadership' ? 'Liderança Empresarial' : 'Liderança de Área']);

      // Gráficos sheet
      const charts = wb.addWorksheet('Gráficos');
      charts.getColumn(1).width = 2;
      let rowCursor = 2;
      const addImage = (buf: ArrayBuffer, height: number) => {
        const id = wb.addImage({ buffer: buf as any, extension: 'png' });
        charts.addImage(id, { tl: { col: 1, row: rowCursor } as any, ext: { width: 900, height } });
        rowCursor += Math.ceil(height / 18) + 2;
      };
      addImage(chartGroups, 440);
      addImage(chartSections, Math.max(280, perSection.length * 36 + 80));
      addImage(chartTop, 340);
      addImage(chartBottom, 340);
      addImage(chartDist, 410);

      // Por Grupo (full matrix)
      const grupo = wb.addWorksheet('Por Grupo');
      const headers = ['Grupo', 'Respostas', 'Média', ...scaleQuestions.map(q => q.text.substring(0, 60))];
      grupo.addRow(headers).font = { bold: true };
      grupo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF041023' } };
      grupo.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      visibleGroups.forEach(g => {
        const row: any[] = [g.name, g.count, g.overall];
        scaleQuestions.forEach(q => {
          const vals = g.qMap.get(q.id) || [];
          row.push(vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : '');
        });
        grupo.addRow(row);
      });
      grupo.columns.forEach((c, i) => { c.width = i === 0 ? 28 : i < 3 ? 12 : 22; });
      // Conditional formatting on average column
      grupo.addConditionalFormatting({
        ref: `C2:C${visibleGroups.length + 1}`,
        rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'num', value: 1 }, { type: 'num', value: scaleMax / 2 }, { type: 'num', value: scaleMax }], color: [{ argb: 'FFEF4444' }, { argb: 'FFFBBF24' }, { argb: 'FF10B981' }] } as any],
      });

      // Por Pergunta
      const perg = wb.addWorksheet('Por Pergunta');
      perg.addRow(['Seção', 'Pergunta', 'Média', 'Respostas']).font = { bold: true };
      perg.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF041023' } };
      perg.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      perQuestion.forEach(p => {
        const sec = sectionsList.find(s => s.id === p.q.section_id);
        perg.addRow([sec?.title || '—', p.q.text, p.avg, p.n]);
      });
      perg.columns = [{ width: 30 }, { width: 70 }, { width: 12 }, { width: 14 }];
      perg.addConditionalFormatting({
        ref: `C2:C${perQuestion.length + 1}`,
        rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'num', value: 1 }, { type: 'num', value: scaleMax / 2 }, { type: 'num', value: scaleMax }], color: [{ argb: 'FFEF4444' }, { argb: 'FFFBBF24' }, { argb: 'FF10B981' }] } as any],
      });

      // Por Seção
      const sec = wb.addWorksheet('Por Seção');
      sec.addRow(['Seção', 'Média', 'Respostas']).font = { bold: true };
      sec.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF041023' } };
      sec.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      perSection.forEach(s => sec.addRow([s.title, s.avg, s.n]));
      sec.columns = [{ width: 40 }, { width: 12 }, { width: 14 }];

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resultados_clima_${groupBy}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Relatório exportado com gráficos!' });
    } catch (e: any) {
      toast({ title: 'Erro ao exportar', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const sanitizeSheetName = (name: string) => {
    return (name || 'Sem nome').replace(/[\\/?*[\]:]/g, ' ').substring(0, 31);
  };

  const exportIndividual = async () => {
    if (!companyId) return;
    setGenerating(true);
    try {
      const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).neq('status', 'draft').limit(1);
      const survey = surveys?.[0];
      if (!survey) { toast({ title: 'Nenhuma pesquisa encontrada', variant: 'destructive' }); return; }

      const [sectionsRes, respondentsRes, responsesRes] = await Promise.all([
        supabase.from('survey_sections').select('*').eq('survey_id', survey.id).order('sort_order'),
        supabase.from('respondents').select('*').eq('survey_id', survey.id).order('name'),
        supabase.from('survey_responses').select('*').eq('survey_id', survey.id).order('submitted_at'),
      ]);
      const sections = sectionsRes.data || [];
      const respondents = respondentsRes.data || [];
      const allResponses = responsesRes.data || [];

      const { data: questions } = await supabase
        .from('survey_questions')
        .select('*')
        .in('section_id', sections.map(s => s.id))
        .order('sort_order');
      const qList = questions || [];

      // Group responses into submissions by submitted_at (within 5min window) + dept + leader keys
      type Submission = { key: string; submitted_at: string; rows: any[] };
      const submissions: Submission[] = [];
      const WINDOW_MS = 5 * 60 * 1000;
      allResponses.forEach(r => {
        const t = new Date(r.submitted_at).getTime();
        const key = `${r.department || ''}__${r.company_leadership || ''}__${r.department_leadership || ''}__${r.evaluated_leader || ''}`;
        let sub = submissions.find(s => s.key === key && Math.abs(new Date(s.submitted_at).getTime() - t) < WINDOW_MS);
        if (!sub) {
          sub = { key, submitted_at: r.submitted_at, rows: [] };
          submissions.push(sub);
        }
        sub.rows.push(r);
      });

      const wb = XLSX.utils.book_new();
      const indexRows: any[][] = [['Nome', 'Email', 'Departamento', 'Líder do Depto', 'Líder Empresarial', 'Respondido em', 'Status']];
      const usedNames = new Set<string>();

      respondents.forEach((person: any) => {
        // Find best matching submission
        const candidates = submissions.filter(s => {
          const r0 = s.rows[0];
          return (r0.department || '') === (person.department || '') &&
            (r0.department_leadership || '') === (person.department_leadership || '') &&
            (r0.company_leadership || '') === (person.company_leadership || '');
        });
        let match: Submission | null = null;
        if (person.responded_at) {
          const t = new Date(person.responded_at).getTime();
          match = candidates.reduce<Submission | null>((best, s) => {
            const d = Math.abs(new Date(s.submitted_at).getTime() - t);
            if (!best || d < Math.abs(new Date(best.submitted_at).getTime() - t)) return s;
            return best;
          }, null);
        } else if (candidates.length === 1) {
          match = candidates[0];
        }

        const status = match ? 'Respondido' : 'Sem resposta encontrada';
        indexRows.push([
          person.name || '—',
          person.email || '—',
          person.department || '—',
          person.department_leadership || '—',
          person.company_leadership || '—',
          match ? new Date(match.submitted_at).toLocaleString('pt-BR') : '—',
          status,
        ]);

        // Build sheet
        let baseName = sanitizeSheetName(person.name || person.email || 'Anônimo');
        let sheetName = baseName;
        let counter = 2;
        while (usedNames.has(sheetName)) {
          sheetName = sanitizeSheetName(`${baseName} (${counter})`);
          counter++;
        }
        usedNames.add(sheetName);

        const rows: any[][] = [];
        rows.push(['Nome', person.name || '—']);
        rows.push(['Email', person.email || '—']);
        rows.push(['Departamento', person.department || '—']);
        rows.push(['Líder do Depto', person.department_leadership || '—']);
        rows.push(['Líder Empresarial', person.company_leadership || '—']);
        rows.push(['Status', status]);
        rows.push(['Respondido em', match ? new Date(match.submitted_at).toLocaleString('pt-BR') : '—']);
        rows.push([]);

        if (match) {
          const respByQ = new Map<string, any>();
          match.rows.forEach(r => respByQ.set(r.question_id, r));
          // Group questions by section
          sections.forEach(section => {
            const sQuestions = qList.filter(q => q.section_id === section.id);
            if (sQuestions.length === 0) return;
            rows.push([`— ${section.title} —`]);
            rows.push(['Pergunta', 'Resposta', 'Comentário']);
            sQuestions.forEach(q => {
              const r = respByQ.get(q.id);
              const ans = r ? (r.value != null ? r.value : (r.text_value || '—')) : '—';
              rows.push([q.text, ans, r?.text_value && r?.value != null ? r.text_value : '']);
            });
            rows.push([]);
          });
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 60 }, { wch: 30 }, { wch: 50 }];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const idxWs = XLSX.utils.aoa_to_sheet(indexRows);
      idxWs['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 22 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, idxWs, 'Índice');
      // Move Índice to first position
      wb.SheetNames = ['Índice', ...wb.SheetNames.filter(n => n !== 'Índice')];

      XLSX.writeFile(wb, `relatorio_individual_${survey.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`);
      toast({ title: 'Relatório individual gerado!', description: `${respondents.length} colaboradores exportados.` });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar relatório', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Exportar Resultados</h2>

      <Card>
        <CardHeader><CardTitle>Dados Agregados</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Exporte médias por grupo. Grupos com menos de 3 respostas são omitidos para garantir anonimato.</p>
          <div className="flex gap-4 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium">Agrupar por</label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="department">Departamento</SelectItem>
                  <SelectItem value="company_leadership">Liderança Empresarial</SelectItem>
                  <SelectItem value="department_leadership">Liderança de Área</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={exportData}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button>
          </div>
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-destructive" />
              Relatório Individual (super admin)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Quebra de anonimato</AlertTitle>
              <AlertDescription>
                Este relatório vincula nominalmente cada colaborador às respostas, usando timestamp e metadata de grupo. 
                <strong className="block mt-1">Use apenas em casos excepcionais e nunca compartilhe com gestores avaliados.</strong>
              </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground">
              Gera um Excel com uma aba "Índice" e uma aba por colaborador, contendo todas as respostas organizadas por seção.
            </p>
            <Button onClick={exportIndividual} disabled={generating} variant="destructive">
              <Download className="mr-2 h-4 w-4" />
              {generating ? 'Gerando...' : 'Gerar relatório individual'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
