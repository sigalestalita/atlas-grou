import { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Users, Plus, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ContextType { company: { id: string } }

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
}

export default function Respondents() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [respondents, setRespondents] = useState<any[]>([]);
  const [survey, setSurvey] = useState<any>(null);
  const [manualForm, setManualForm] = useState({ name: '', email: '', department: '', company_leadership: '', department_leadership: '' });
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).neq('status', 'draft').limit(1);
    const s = surveys?.[0];
    setSurvey(s);
    if (!s) return;
    const { data } = await supabase.from('respondents').select('*').eq('survey_id', s.id).order('created_at');
    setRespondents(data || []);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !survey) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws);

    const newRespondents = rows.map(row => ({
      company_id: companyId!,
      survey_id: survey.id,
      name: String(row['Nome'] || row['name'] || '').trim(),
      email: String(row['Email'] || row['email'] || '').trim() || null,
      department: String(row['Departamento'] || row['department'] || '').trim() || null,
      company_leadership: String(row['Liderança Empresarial'] || row['company_leadership'] || '').trim() || null,
      department_leadership: String(row['Liderança Departamento'] || row['department_leadership'] || '').trim() || null,
      token: generateToken(),
    }));

    if (newRespondents.length === 0) {
      toast({ title: 'Nenhum colaborador encontrado na planilha', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('respondents').insert(newRespondents);
    if (error) { toast({ title: 'Erro ao importar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `${newRespondents.length} colaboradores importados` });
    load();
    e.target.value = '';
  };

  const addManual = async () => {
    if (!survey) return;
    const { error } = await supabase.from('respondents').insert({
      company_id: companyId!, survey_id: survey.id, name: manualForm.name.trim() || '',
      email: manualForm.email.trim() || null, department: manualForm.department.trim() || null,
      company_leadership: manualForm.company_leadership.trim() || null,
      department_leadership: manualForm.department_leadership.trim() || null,
      token: generateToken(),
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    setManualForm({ name: '', email: '', department: '', company_leadership: '', department_leadership: '' });
    load();
  };

  const deleteRespondent = async (id: string) => {
    await supabase.from('respondents').delete().eq('id', id);
    load();
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Nome', 'Email', 'Departamento', 'Liderança Empresarial', 'Liderança Departamento'], ['João Silva', 'joao@empresa.com', 'TI', 'Carlos Souza', 'Ana Lima']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
    XLSX.writeFile(wb, 'modelo_colaboradores.xlsx');
  };

  if (!survey) return <Card><CardContent className="py-12 text-center text-muted-foreground">Ative uma pesquisa antes de importar colaboradores</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Colaboradores</h2>
          <p className="text-sm text-muted-foreground">{respondents.length} cadastrados • {respondents.filter(r => r.status === 'responded').length} respondidos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Modelo Excel</Button>
          <label>
            <Button variant="default" size="sm" asChild><span><Upload className="mr-2 h-4 w-4" />Importar Planilha</span></Button>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {/* Manual add */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Adicionar manualmente</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <Input placeholder="Nome (opcional)" value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Email" value={manualForm.email} onChange={e => setManualForm(f => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Departamento" value={manualForm.department} onChange={e => setManualForm(f => ({ ...f, department: e.target.value }))} />
            <Input placeholder="Lid. Empresarial" value={manualForm.company_leadership} onChange={e => setManualForm(f => ({ ...f, company_leadership: e.target.value }))} />
            <Input placeholder="Lid. Departamento" value={manualForm.department_leadership} onChange={e => setManualForm(f => ({ ...f, department_leadership: e.target.value }))} />
            <Button onClick={addManual}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Lid. Empresarial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respondents.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.email || '-'}</TableCell>
                  <TableCell>{r.department || '-'}</TableCell>
                  <TableCell>{r.company_leadership || '-'}</TableCell>
                  <TableCell><Badge variant={r.status === 'responded' ? 'default' : 'secondary'}>{r.status === 'responded' ? 'Respondido' : 'Pendente'}</Badge></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => deleteRespondent(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
              {respondents.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum colaborador cadastrado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
