import { useEffect, useState, useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, X, Save, Users, UserCheck } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ContextType { company: { id: string; name: string } }

export default function EvaluationMatrix() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [surveys, setSurveys] = useState<any[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<string>('');
  const [respondents, setRespondents] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Set<string>>>({});
  const [evaluatees, setEvaluatees] = useState<string[]>([]);
  const [newEvaluatee, setNewEvaluatee] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  // Load surveys for this company
  useEffect(() => {
    if (!companyId) return;
    supabase.from('surveys').select('*')
      .eq('company_id', companyId)
      .eq('is_template', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSurveys(data || []);
        if (data?.[0] && !selectedSurvey) setSelectedSurvey(data[0].id);
      });
  }, [companyId]);

  // Load respondents & existing assignments when survey changes
  useEffect(() => {
    if (!selectedSurvey || !companyId) return;

    const loadData = async () => {
      // Load respondents
      const { data: resp } = await supabase.from('respondents').select('*')
        .eq('survey_id', selectedSurvey)
        .eq('company_id', companyId)
        .order('name');
      setRespondents(resp || []);

      // Load existing assignments
      const { data: assigns } = await supabase.from('evaluation_assignments').select('*')
        .eq('survey_id', selectedSurvey)
        .eq('company_id', companyId);

      // Build assignment map and evaluatee list
      const map: Record<string, Set<string>> = {};
      const evaluateeSet = new Set<string>();

      for (const a of assigns || []) {
        if (!map[a.evaluator_name]) map[a.evaluator_name] = new Set();
        map[a.evaluator_name].add(a.evaluatee_name);
        evaluateeSet.add(a.evaluatee_name);
      }

      // Also add respondent names as potential evaluatees
      for (const r of resp || []) {
        if (r.name) evaluateeSet.add(r.name);
      }

      // Also add leaders from survey
      const { data: survey } = await supabase.from('surveys').select('leaders').eq('id', selectedSurvey).single();
      if (survey?.leaders) {
        const leaders = Array.isArray(survey.leaders) ? survey.leaders : [];
        for (const l of leaders) {
          if (typeof l === 'string') evaluateeSet.add(l);
        }
      }

      setAssignments(map);
      setEvaluatees(Array.from(evaluateeSet).sort());
      setDirty(false);
    };

    loadData();
  }, [selectedSurvey, companyId]);

  const evaluatorNames = useMemo(() => {
    return respondents
      .map(r => r.name || r.email || `Respondente ${r.id.slice(0, 6)}`)
      .sort();
  }, [respondents]);

  const toggleAssignment = (evaluator: string, evaluatee: string) => {
    setAssignments(prev => {
      const copy = { ...prev };
      if (!copy[evaluator]) copy[evaluator] = new Set();
      else copy[evaluator] = new Set(copy[evaluator]);

      if (copy[evaluator].has(evaluatee)) {
        copy[evaluator].delete(evaluatee);
      } else {
        copy[evaluator].add(evaluatee);
      }
      return copy;
    });
    setDirty(true);
  };

  const selectAll = (evaluatee: string) => {
    setAssignments(prev => {
      const copy = { ...prev };
      for (const name of evaluatorNames) {
        if (!copy[name]) copy[name] = new Set();
        else copy[name] = new Set(copy[name]);
        copy[name].add(evaluatee);
      }
      return copy;
    });
    setDirty(true);
  };

  const deselectAll = (evaluatee: string) => {
    setAssignments(prev => {
      const copy = { ...prev };
      for (const name of evaluatorNames) {
        if (copy[name]) {
          copy[name] = new Set(copy[name]);
          copy[name].delete(evaluatee);
        }
      }
      return copy;
    });
    setDirty(true);
  };

  const addEvaluatee = () => {
    const name = newEvaluatee.trim();
    if (!name || evaluatees.includes(name)) return;
    setEvaluatees(prev => [...prev, name].sort());
    setNewEvaluatee('');
  };

  const removeEvaluatee = (name: string) => {
    setEvaluatees(prev => prev.filter(e => e !== name));
    setAssignments(prev => {
      const copy = { ...prev };
      for (const key of Object.keys(copy)) {
        copy[key] = new Set(copy[key]);
        copy[key].delete(name);
      }
      return copy;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!selectedSurvey || !companyId) return;
    setSaving(true);

    try {
      // Delete existing assignments for this survey
      await supabase.from('evaluation_assignments')
        .delete()
        .eq('survey_id', selectedSurvey)
        .eq('company_id', companyId);

      // Insert new assignments
      const rows: any[] = [];
      for (const [evaluator, evaluateeSet] of Object.entries(assignments)) {
        for (const evaluatee of evaluateeSet) {
          rows.push({
            survey_id: selectedSurvey,
            company_id: companyId,
            evaluator_name: evaluator,
            evaluatee_name: evaluatee,
          });
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('evaluation_assignments').insert(rows);
        if (error) throw error;
      }

      setDirty(false);
      toast({ title: 'Atribuições salvas com sucesso' });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const totalAssignments = Object.values(assignments).reduce((acc, set) => acc + set.size, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Quem Avalia Quem
          </h2>
          <p className="text-sm text-muted-foreground">Configure as atribuições de avaliação para cada pesquisa</p>
        </div>
        <div className="flex items-center gap-3">
          {surveys.length > 0 && (
            <Select value={selectedSurvey} onValueChange={setSelectedSurvey}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Selecione a pesquisa" /></SelectTrigger>
              <SelectContent>
                {surveys.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {dirty && (
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          )}
        </div>
      </div>

      {!selectedSurvey && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma pesquisa encontrada para esta empresa.</CardContent></Card>
      )}

      {selectedSurvey && (
        <>
          {/* Add evaluatee */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Avaliados</CardTitle>
              <CardDescription>Adicione as pessoas que serão avaliadas. Colaboradores e lideranças são importados automaticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {evaluatees.map(name => (
                  <Badge key={name} variant="secondary" className="text-sm py-1.5 px-3 gap-1.5">
                    {name}
                    <button onClick={() => removeEvaluatee(name)} className="hover:text-destructive transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {evaluatees.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum avaliado adicionado ainda.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newEvaluatee}
                  onChange={e => setNewEvaluatee(e.target.value)}
                  placeholder="Nome do avaliado..."
                  onKeyDown={e => e.key === 'Enter' && addEvaluatee()}
                />
                <Button onClick={addEvaluatee} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Matrix */}
          {evaluatorNames.length > 0 && evaluatees.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Matriz de Avaliação</CardTitle>
                    <CardDescription>
                      {evaluatorNames.length} avaliadores · {evaluatees.length} avaliados · {totalAssignments} atribuições
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full">
                  <div className="min-w-max">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="text-left p-2 border-b font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[200px]">
                            Avaliador ↓ / Avaliado →
                          </th>
                          {evaluatees.map(name => (
                            <th key={name} className="p-2 border-b text-center min-w-[120px]">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-medium text-xs leading-tight">{name}</span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => selectAll(name)}
                                    className="text-[10px] text-primary hover:underline"
                                  >
                                    Todos
                                  </button>
                                  <span className="text-muted-foreground text-[10px]">|</span>
                                  <button
                                    onClick={() => deselectAll(name)}
                                    className="text-[10px] text-muted-foreground hover:underline"
                                  >
                                    Nenhum
                                  </button>
                                </div>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {evaluatorNames.map((evaluator, i) => (
                          <tr key={evaluator} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                            <td className="p-2 border-b font-medium sticky left-0 bg-inherit z-10">
                              {evaluator}
                            </td>
                            {evaluatees.map(evaluatee => (
                              <td key={evaluatee} className="p-2 border-b text-center">
                                <Checkbox
                                  checked={assignments[evaluator]?.has(evaluatee) || false}
                                  onCheckedChange={() => toggleAssignment(evaluator, evaluatee)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {evaluatorNames.length === 0
                  ? 'Adicione colaboradores na aba "Colaboradores" para configurar avaliações.'
                  : 'Adicione avaliados acima para montar a matriz.'}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
