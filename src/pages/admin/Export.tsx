import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ContextType { company: { id: string } }

export default function ExportPage() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [groupBy, setGroupBy] = useState<string>('department');
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

    // Group responses
    const groups = new Map<string, Map<string, number[]>>();
    responses.forEach(r => {
      const key = (groupBy === 'department' ? r.department : groupBy === 'company_leadership' ? r.company_leadership : r.department_leadership) || 'N/A';
      if (!groups.has(key)) groups.set(key, new Map());
      const qMap = groups.get(key)!;
      const arr = qMap.get(r.question_id) || [];
      arr.push(r.value);
      qMap.set(r.question_id, arr);
    });

    // Build sheet - filter groups with < 3
    const headers = ['Grupo', ...(questions || []).map(q => q.text.substring(0, 50))];
    const rows: any[][] = [headers];

    groups.forEach((qMap, groupName) => {
      const totalResponses = Array.from(qMap.values()).reduce((sum, arr) => sum + arr.length, 0);
      if (totalResponses < 3 * (questions?.length || 1)) return; // anonymity check

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
    </div>
  );
}
