import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react';

interface Company { id: string; name: string; slug: string }
interface AccessCode {
  id: string;
  code: string;
  label: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export default function ReportAccess() {
  const { company } = useOutletContext<{ company: Company }>();
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState(generateCode());
  const [loading, setLoading] = useState(true);

  const reportUrl = `${window.location.origin}/relatorio/${company.slug}`;

  const load = async () => {
    const { data } = await supabase
      .from('report_access_codes')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setCodes((data ?? []) as AccessCode[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [company.id]);

  const create = async () => {
    if (!code.trim()) return;
    const { error } = await supabase.from('report_access_codes').insert({
      company_id: company.id,
      code: code.trim().toUpperCase(),
      label: label.trim() || null,
    });
    if (error) return toast.error('Não foi possível criar o código: ' + error.message);
    toast.success('Código de acesso criado');
    setLabel('');
    setCode(generateCode());
    load();
  };

  const toggle = async (c: AccessCode) => {
    const { error } = await supabase
      .from('report_access_codes')
      .update({ is_active: !c.is_active })
      .eq('id', c.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (c: AccessCode) => {
    const { error } = await supabase.from('report_access_codes').delete().eq('id', c.id);
    if (error) return toast.error(error.message);
    toast.success('Código removido');
    load();
  };

  const copy = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  const activeCount = codes.filter((c) => c.is_active).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5 text-primary" />
            Acesso ao relatório
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enquanto existir pelo menos um código ativo, o relatório público só abre depois que a empresa
            informar o código. Sem códigos ativos, o link fica aberto.
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <span className="font-mono break-all">{reportUrl}</span>
            <Button size="sm" variant="outline" onClick={() => copy(reportUrl, 'Link copiado')}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar link
            </Button>
            <Badge variant={activeCount > 0 ? 'default' : 'secondary'}>
              {activeCount > 0 ? `${activeCount} código(s) ativo(s)` : 'Aberto (sem código)'}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Identificação (opcional)</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Diretoria / RH" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Código de acesso</label>
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" />
                <Button variant="outline" size="icon" onClick={() => setCode(generateCode())} title="Gerar novo">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={create}>Criar acesso</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Códigos existentes</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum código criado — o relatório está aberto.</p>
          ) : (
            <div className="divide-y">
              {codes.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-mono text-sm font-semibold">{c.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.label ? `${c.label} · ` : ''}
                      {c.last_used_at
                        ? `último acesso ${new Date(c.last_used_at).toLocaleString('pt-BR')}`
                        : 'nunca utilizado'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copy(`${reportUrl}\nCódigo: ${c.code}`, 'Link + código copiados')}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Link + código
                    </Button>
                    <div className="flex items-center gap-2">
                      <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} />
                      <span className="text-xs text-muted-foreground">{c.is_active ? 'Ativo' : 'Inativo'}</span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => remove(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
