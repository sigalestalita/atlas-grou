import { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Download, Copy, ExternalLink, Globe, Link2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ContextType { company: { id: string; slug: string } }

export default function Links() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [respondents, setRespondents] = useState<any[]>([]);
  const [companySlug, setCompanySlug] = useState('');
  const [openAccessSurvey, setOpenAccessSurvey] = useState<any>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: company } = await supabase.from('companies').select('slug').eq('id', companyId).single();
    if (company) setCompanySlug(company.slug);

    const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).neq('status', 'draft').order('created_at', { ascending: false });
    if (!surveys?.length) return;

    // Check for open access survey
    const openSurvey = surveys.find((s: any) => s.open_access);
    setOpenAccessSurvey(openSurvey || null);

    const { data } = await supabase.from('respondents').select('*').eq('survey_id', surveys[0].id).order('name');
    setRespondents(data || []);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const baseUrl = window.location.origin;

  const getLink = (token: string) => `${baseUrl}/survey/${companySlug}/${token}`;
  const getOpenLink = () => `${baseUrl}/survey/${companySlug}`;

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast({ title: 'Link copiado!' });
  };

  const exportLinks = () => {
    const data = respondents.map(r => ({
      Nome: r.name,
      Email: r.email || '',
      Departamento: r.department || '',
      Link: getLink(r.token),
      Status: r.status === 'responded' ? 'Respondido' : 'Pendente',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Links');
    XLSX.writeFile(wb, 'links_pesquisa.xlsx');
  };

  return (
    <div className="space-y-6">
      {/* Open access link */}
      {openAccessSurvey && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-primary" />
              Link Aberto da Pesquisa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link único para todos os colaboradores. Não é necessário cadastrar respondentes individualmente. Cada pessoa pode acessar e responder de forma anônima.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-background px-3 py-2 rounded-lg border truncate">
                {getOpenLink()}
              </code>
              <Button onClick={() => copyLink(getOpenLink())} size="sm">
                <Copy className="mr-2 h-4 w-4" />Copiar
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={getOpenLink()} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />Abrir
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual links */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Links Individuais
          </h2>
          <p className="text-sm text-muted-foreground">{respondents.length} links gerados</p>
        </div>
        <Button onClick={exportLinks} disabled={respondents.length === 0}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {respondents.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name || '(anônimo)'}</TableCell>
                  <TableCell>{r.email || '-'}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-xs block">{getLink(r.token)}</code></TableCell>
                  <TableCell><span className={`text-xs font-medium ${r.status === 'responded' ? 'text-green-600' : 'text-orange-500'}`}>{r.status === 'responded' ? 'Respondido' : 'Pendente'}</span></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => copyLink(getLink(r.token))}><Copy className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {respondents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {openAccessSurvey ? 'Esta pesquisa usa link aberto — links individuais são opcionais.' : 'Importe colaboradores primeiro'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
