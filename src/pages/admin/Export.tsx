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
    const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).neq('status', 'draft').limit(1);
    const survey = surveys?.[0];
    if (!survey) { toast({ title: 'Nenhuma pesquisa encontrada', variant: 'destructive' }); return; }

    const { data: sections } = await supabase.from('survey_sections').select('*').eq('survey_id', survey.id).order('sort_order');
    const { data: questions } = await supabase.from('survey_questions').select('*').in('section_id', (sections || []).map(s => s.id)).order('sort_order');
    const { data: responses } = await supabase.from('survey_responses').select('*').eq('survey_id', survey.id);

    if (!responses?.length || !questions?.length) { toast({ title: 'Sem dados para exportar', variant: 'destructive' }); return; }

    const groups = new Map<string, Map<string, number[]>>();
    responses.forEach(r => {
      const key = (groupBy === 'department' ? r.department : groupBy === 'company_leadership' ? r.company_leadership : r.department_leadership) || 'N/A';
      if (!groups.has(key)) groups.set(key, new Map());
      const qMap = groups.get(key)!;
      const arr = qMap.get(r.question_id) || [];
      if (r.value != null) arr.push(r.value);
      qMap.set(r.question_id, arr);
    });

    const headers = ['Grupo', ...(questions || []).map(q => q.text.substring(0, 50))];
    const rows: any[][] = [headers];

    groups.forEach((qMap, groupName) => {
      const totalResponses = Array.from(qMap.values()).reduce((sum, arr) => sum + arr.length, 0);
      if (totalResponses < 3 * (questions?.length || 1)) return;

      const row = [groupName];
      (questions || []).forEach(q => {
        const vals = qMap.get(q.id) || [];
        const avg = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : '';
        row.push(avg as any);
      });
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
    XLSX.writeFile(wb, `resultados_clima_${groupBy}.xlsx`);
    toast({ title: 'Relatório exportado!' });
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
