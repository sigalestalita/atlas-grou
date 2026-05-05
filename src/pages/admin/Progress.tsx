import { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle, Clock } from 'lucide-react';

interface ContextType { company: { id: string } }

export default function ProgressPage() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [respondents, setRespondents] = useState<any[]>([]);
  const [deptStats, setDeptStats] = useState<{ name: string; total: number; responded: number }[]>([]);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: surveys } = await supabase.from('surveys').select('id').eq('company_id', companyId).neq('status', 'draft').limit(1);
    if (!surveys?.[0]) return;
    const { data } = await supabase.from('respondents').select('*').eq('survey_id', surveys[0].id).order('responded_at', { ascending: false, nullsFirst: false });
    setRespondents(data || []);

    // Dept breakdown
    const deptMap = new Map<string, { total: number; responded: number }>();
    (data || []).forEach(r => {
      const dept = r.department || 'Sem departamento';
      const cur = deptMap.get(dept) || { total: 0, responded: 0 };
      cur.total++;
      if (r.status === 'responded') cur.responded++;
      deptMap.set(dept, cur);
    });
    setDeptStats(Array.from(deptMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total));
  }, [companyId]);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const total = respondents.length;
  const responded = respondents.filter(r => r.status === 'responded').length;
  const rate = total > 0 ? Math.round((responded / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Progresso em Tempo Real</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-8 w-8 mx-auto text-primary mb-2" />
            <p className="text-3xl font-bold">{total}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-8 w-8 mx-auto text-green-600 mb-2" />
            <p className="text-3xl font-bold text-green-600">{responded}</p>
            <p className="text-sm text-muted-foreground">Respondidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="h-8 w-8 mx-auto text-orange-500 mb-2" />
            <p className="text-3xl font-bold text-orange-500">{total - responded}</p>
            <p className="text-sm text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Taxa de Resposta</CardTitle>
            <span className="text-2xl font-bold">{rate}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={rate} className="h-4" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Por Departamento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {deptStats.map(d => {
            const pct = d.total > 0 ? Math.round((d.responded / d.total) * 100) : 0;
            return (
              <div key={d.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-muted-foreground">{d.responded}/{d.total} ({pct}%)</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
          {deptStats.length === 0 && <p className="text-muted-foreground text-center py-4 text-sm">Sem dados</p>}
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Atividade Recente</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {respondents.filter(r => r.status === 'responded').slice(0, 10).map(r => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Resposta recebida</span>
                {r.department && <Badge variant="outline" className="text-xs">{r.department}</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">{r.responded_at ? new Date(r.responded_at).toLocaleString('pt-BR') : ''}</span>
            </div>
          ))}
          {respondents.filter(r => r.status === 'responded').length === 0 && <p className="text-muted-foreground text-center py-4 text-sm">Nenhuma resposta ainda</p>}
        </CardContent>
      </Card>
    </div>
  );
}
