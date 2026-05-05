import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, RadialBarChart, RadialBar } from 'recharts';
import { TrendingUp, TrendingDown, Users, CheckCircle, AlertTriangle, Trophy } from 'lucide-react';

interface ContextType {
  company: { id: string; name: string; primary_color: string };
}

export default function Dashboard() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;

  const [stats, setStats] = useState({ total: 0, responded: 0, rate: 0 });
  const [questionAvgs, setQuestionAvgs] = useState<{ name: string; avg: number; section: string }[]>([]);
  const [deptAvgs, setDeptAvgs] = useState<{ name: string; avg: number }[]>([]);
  const [leaderAvgs, setLeaderAvgs] = useState<{ name: string; avg: number }[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [scaleMax, setScaleMax] = useState(5);

  useEffect(() => {
    if (!companyId) return;
    loadData();
  }, [companyId]);

  const loadData = async () => {
    // Get active survey
    const { data: surveys } = await supabase.from('surveys').select('*').eq('company_id', companyId).in('status', ['active', 'closed']).limit(1);
    const survey = surveys?.[0];
    if (!survey) return;
    setScaleMax(survey.scale_max);

    // Response rate
    const { data: respondents } = await supabase.from('respondents').select('status').eq('survey_id', survey.id);
    const total = respondents?.length || 0;
    const responded = respondents?.filter(r => r.status === 'responded').length || 0;
    const rate = total > 0 ? Math.round((responded / total) * 100) : 0;
    setStats({ total, responded, rate });

    // Get questions with sections
    const { data: sections } = await supabase.from('survey_sections').select('id, title, sort_order').eq('survey_id', survey.id).order('sort_order');
    const { data: questions } = await supabase.from('survey_questions').select('id, text, section_id, sort_order').in('section_id', (sections || []).map(s => s.id)).order('sort_order');

    // Get responses
    const { data: responses } = await supabase.from('survey_responses').select('question_id, value, department, company_leadership').eq('survey_id', survey.id);
    if (!responses || responses.length === 0) return;

    // Question averages
    const qMap = new Map<string, number[]>();
    responses.forEach(r => {
      const arr = qMap.get(r.question_id) || [];
      arr.push(r.value);
      qMap.set(r.question_id, arr);
    });

    const qAvgs = (questions || []).map(q => {
      const vals = qMap.get(q.id) || [];
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const section = sections?.find(s => s.id === q.section_id)?.title || '';
      return { name: q.text.substring(0, 40) + (q.text.length > 40 ? '...' : ''), avg: Math.round(avg * 100) / 100, section };
    });
    setQuestionAvgs(qAvgs);

    // Department averages (min 3 anonymity)
    const deptMap = new Map<string, number[]>();
    responses.forEach(r => {
      if (!r.department) return;
      const arr = deptMap.get(r.department) || [];
      arr.push(r.value);
      deptMap.set(r.department, arr);
    });
    const dAvgs = Array.from(deptMap.entries())
      .filter(([_, vals]) => vals.length >= 3)
      .map(([name, vals]) => ({ name, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 }))
      .sort((a, b) => b.avg - a.avg);
    setDeptAvgs(dAvgs);

    // Leadership averages (min 3)
    const leadMap = new Map<string, number[]>();
    responses.forEach(r => {
      if (!r.company_leadership) return;
      const arr = leadMap.get(r.company_leadership) || [];
      arr.push(r.value);
      leadMap.set(r.company_leadership, arr);
    });
    const lAvgs = Array.from(leadMap.entries())
      .filter(([_, vals]) => vals.length >= 3)
      .map(([name, vals]) => ({ name, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 }))
      .sort((a, b) => b.avg - a.avg);
    setLeaderAvgs(lAvgs);

    // Overall score (0-100)
    const allVals = responses.map(r => r.value);
    const rawAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
    const score = Math.round((rawAvg / survey.scale_max) * 100);
    setOverallScore(score);
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'hsl(152, 60%, 42%)';
    if (score >= 50) return 'hsl(38, 92%, 50%)';
    return 'hsl(0, 72%, 51%)';
  };

  const getBarColor = (avg: number) => {
    const pct = (avg / scaleMax) * 100;
    if (pct >= 75) return 'hsl(152, 60%, 42%)';
    if (pct >= 50) return 'hsl(38, 92%, 50%)';
    return 'hsl(0, 72%, 51%)';
  };

  const insights = () => {
    const sorted = [...questionAvgs].sort((a, b) => a.avg - b.avg);
    const weak = sorted.slice(0, 3).filter(q => q.avg > 0);
    const strong = sorted.slice(-3).reverse().filter(q => q.avg > 0);
    return { weak, strong };
  };

  const { weak, strong } = insights();

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Score Geral</p>
                <p className="text-3xl font-bold" style={{ color: getScoreColor(overallScore) }}>{overallScore}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: getScoreColor(overallScore) + '20' }}>
                {overallScore >= 75 ? <TrendingUp style={{ color: getScoreColor(overallScore) }} /> : overallScore >= 50 ? <AlertTriangle style={{ color: getScoreColor(overallScore) }} /> : <TrendingDown style={{ color: getScoreColor(overallScore) }} />}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Resposta</p>
                <p className="text-3xl font-bold">{stats.rate}%</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center"><CheckCircle className="text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Respondidos</p>
                <p className="text-3xl font-bold">{stats.responded}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center"><Users className="text-green-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-3xl font-bold">{stats.total - stats.responded}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center"><AlertTriangle className="text-orange-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Question Averages */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Média por Pergunta</CardTitle></CardHeader>
          <CardContent>
            {questionAvgs.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(300, questionAvgs.length * 40)}>
                <BarChart data={questionAvgs} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, scaleMax]} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                    {questionAvgs.map((entry, i) => <Cell key={i} fill={getBarColor(entry.avg)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-8 text-sm">Sem dados disponíveis</p>}
          </CardContent>
        </Card>

        {/* Department Averages */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Média por Departamento</CardTitle></CardHeader>
          <CardContent>
            {deptAvgs.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deptAvgs}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, scaleMax]} />
                  <Tooltip />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {deptAvgs.map((entry, i) => <Cell key={i} fill={getBarColor(entry.avg)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-muted-foreground text-center py-8 text-sm">Grupos com menos de 3 respostas são ocultos</p>}
          </CardContent>
        </Card>
      </div>

      {/* Leadership Comparison */}
      {leaderAvgs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Comparação entre Lideranças</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={leaderAvgs}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, scaleMax]} />
                <Tooltip />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {leaderAvgs.map((entry, i) => <Cell key={i} fill={getBarColor(entry.avg)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      <div className="grid gap-6 lg:grid-cols-2">
        {strong.length > 0 && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Trophy className="h-5 w-5 text-green-600" />Pontos Fortes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {strong.map((q, i) => (
                <div key={i} className="flex justify-between items-center p-2 bg-white/80 rounded-lg">
                  <span className="text-sm">{q.name}</span>
                  <span className="font-bold text-green-600">{q.avg}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {weak.length > 0 && (
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" />Pontos de Atenção</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {weak.map((q, i) => (
                <div key={i} className="flex justify-between items-center p-2 bg-white/80 rounded-lg">
                  <span className="text-sm">{q.name}</span>
                  <span className="font-bold text-red-600">{q.avg}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
