import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, Clock, ArrowRight, ArrowLeft, Shield, Users } from 'lucide-react';

interface Question {
  id: string;
  text: string;
  section_title: string;
  section_id: string;
  question_type: string;
  scale_type: string | null;
  options: string[] | null;
  has_justification: boolean;
  justification_prompt: string | null;
}

interface SurveyData {
  id: string;
  title: string;
  description: string | null;
  scale_min: number;
  scale_max: number;
  scale_labels: string[];
  leaders: string[];
}

interface CompanyBranding {
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

const SCALE_LABELS: Record<string, string[]> = {
  avaliacao: ['Muito Ruim', 'Ruim', 'Regular', 'Bom', 'Muito Bom'],
  satisfacao: ['Muito Insatisfeito', 'Insatisfeito', 'Neutro', 'Satisfeito', 'Muito Satisfeito'],
  concordancia: ['Discordo Totalmente', 'Discordo', 'Neutro', 'Concordo', 'Concordo Totalmente'],
  frequencia: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre'],
  confianca: ['Muito Baixo', 'Baixo', 'Moderado', 'Alto', 'Muito Alto'],
  alinhamento: ['Totalmente Desalinhado', 'Pouco Alinhado', 'Parcialmente', 'Bem Alinhado', 'Totalmente Alinhado'],
};

export default function SurveyPage() {
  const { slug, token } = useParams();
  const [status, setStatus] = useState<'loading' | 'leader_select' | 'ready' | 'already_responded' | 'invalid' | 'submitting' | 'done'>('loading');
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [respondent, setRespondent] = useState<any>(null);
  const [selectedLeader, setSelectedLeader] = useState<string | null>(null);

  const parseLeaderNames = (raw: any): string[] => {
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
      return arr.map((l: any) => typeof l === 'string' ? l : l.name);
    } catch { return []; }
  };

  useEffect(() => { loadSurvey(); }, [slug, token]);

  const loadSurvey = async () => {
    if (!slug || !token) { setStatus('invalid'); return; }

    const { data: company } = await supabase.from('companies').select('*').eq('slug', slug).single();
    if (!company) { setStatus('invalid'); return; }
    setBranding({ name: company.name, logo_url: company.logo_url, primary_color: company.primary_color, secondary_color: company.secondary_color });

    const { data: resp } = await supabase.from('respondents').select('*').eq('token', token).single();
    if (!resp) { setStatus('invalid'); return; }
    if (resp.status === 'responded') { setStatus('already_responded'); return; }
    setRespondent(resp);

    const { data: surveyData } = await supabase.from('surveys').select('*').eq('id', resp.survey_id).eq('status', 'active').single();
    if (!surveyData) { setStatus('invalid'); return; }

    let labels: string[] = [];
    try {
      labels = typeof surveyData.scale_labels === 'string' ? JSON.parse(surveyData.scale_labels) : Array.isArray(surveyData.scale_labels) ? surveyData.scale_labels as string[] : [];
    } catch { labels = []; }

    let leaders: string[] = parseLeaderNames(surveyData.leaders);

    setSurvey({ ...surveyData, scale_labels: labels, leaders } as any);

    const { data: sections } = await supabase.from('survey_sections').select('*').eq('survey_id', surveyData.id).order('sort_order');
    const allQuestions: Question[] = [];
    for (const sec of sections || []) {
      const { data: qs } = await supabase.from('survey_questions').select('*').eq('section_id', sec.id).order('sort_order');
      (qs || []).forEach(q => {
        let opts: string[] | null = null;
        if (q.options) {
          try { opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options as string[]; } catch { opts = null; }
        }
        allQuestions.push({
          id: q.id, text: q.text, section_title: sec.title, section_id: sec.id,
          question_type: q.question_type, scale_type: q.scale_type,
          options: opts, has_justification: q.has_justification,
          justification_prompt: q.justification_prompt,
        });
      });
    }
    setQuestions(allQuestions);

    // If leaders are configured, show leader selection first
    if (leaders.length > 0) {
      setStatus('leader_select');
    } else {
      setStatus('ready');
    }
  };

  const handleLeaderConfirm = () => {
    if (!selectedLeader) return;
    setStatus('ready');
  };

  const handleScaleAnswer = (value: number) => {
    const q = questions[currentIndex];
    setAnswers(a => ({ ...a, [q.id]: value }));
    if (!q.has_justification) {
      setTimeout(() => { if (currentIndex < questions.length - 1) setCurrentIndex(i => i + 1); }, 400);
    }
  };

  const handleChoiceAnswer = (option: string) => {
    const q = questions[currentIndex];
    setAnswers(a => ({ ...a, [q.id]: option }));
    if (!q.has_justification) {
      setTimeout(() => { if (currentIndex < questions.length - 1) setCurrentIndex(i => i + 1); }, 400);
    }
  };

  const handleSubmit = async () => {
    if (!survey || !respondent) return;
    setStatus('submitting');

    const responseRows = questions.map(q => {
      const ans = answers[q.id];
      const justification = justifications[q.id] || null;
      return {
        survey_id: survey.id,
        question_id: q.id,
        value: typeof ans === 'number' ? ans : null,
        text_value: typeof ans === 'string' ? ans : justification,
        department: respondent.department,
        company_leadership: respondent.company_leadership,
        department_leadership: selectedLeader || respondent.department_leadership,
      };
    }).filter(r => r.value !== null || r.text_value !== null);

    for (const q of questions) {
      const justification = justifications[q.id];
      if (justification && q.has_justification && answers[q.id] !== undefined) {
        const existingRow = responseRows.find(r => r.question_id === q.id);
        if (existingRow) {
          if (typeof answers[q.id] === 'number') {
            existingRow.text_value = justification;
          } else {
            existingRow.text_value = `${answers[q.id]}|||${justification}`;
          }
        }
      }
    }

    const { error } = await supabase.from('survey_responses').insert(responseRows);
    if (error) { console.error('Submit error:', error); setStatus('ready'); return; }

    await supabase.from('respondents').update({ status: 'responded', responded_at: new Date().toISOString() }).eq('id', respondent.id);
    setStatus('done');
  };

  const answeredCount = questions.filter(q => answers[q.id] !== undefined).length;
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const estimatedMinutes = Math.max(1, Math.ceil(questions.length * 0.4));
  // ALL questions are now mandatory, including open_text
  const allAnswered = questions.every(q => {
    const ans = answers[q.id];
    if (ans === undefined) return false;
    if (q.question_type === 'open_text' && typeof ans === 'string' && ans.trim() === '') return false;
    return true;
  });
  const currentQ = questions[currentIndex];

  const primaryColor = branding?.primary_color || '#3B82F6';
  const secondaryColor = branding?.secondary_color || '#1E40AF';

  const getScaleLabels = (q: Question): string[] => {
    if (q.scale_type && SCALE_LABELS[q.scale_type]) return SCALE_LABELS[q.scale_type];
    return survey?.scale_labels || [];
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}10, ${secondaryColor}10)` }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: primaryColor }} />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${primaryColor}10, ${secondaryColor}10)` }}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">Link inválido</h1>
          <p className="text-muted-foreground">Este link de pesquisa não é válido ou a pesquisa não está mais ativa.</p>
        </div>
      </div>
    );
  }

  if (status === 'already_responded') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${primaryColor}10, ${secondaryColor}10)` }}>
        <div className="text-center max-w-md">
          <CheckCircle className="h-16 w-16 mx-auto mb-4" style={{ color: primaryColor }} />
          <h1 className="text-2xl font-bold mb-2">Você já respondeu</h1>
          <p className="text-muted-foreground">Sua resposta já foi registrada. Obrigado pela participação!</p>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${primaryColor}10, ${secondaryColor}10)` }}>
        <div className="text-center max-w-md animate-in fade-in duration-500">
          <CheckCircle className="h-20 w-20 mx-auto mb-4" style={{ color: primaryColor }} />
          <h1 className="text-3xl font-bold mb-3">Obrigado!</h1>
          <p className="text-muted-foreground text-lg">Sua resposta foi registrada com sucesso.</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Suas respostas são completamente anônimas.</span>
          </div>
          {branding && <p className="mt-6 text-sm text-muted-foreground">{branding.name}</p>}
        </div>
      </div>
    );
  }

  // Leader selection screen
  if (status === 'leader_select' && survey) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
        <header className="p-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {branding?.logo_url && <img src={branding.logo_url} alt="" className="h-8 w-auto" />}
            <span className="font-semibold text-sm">{branding?.name}</span>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl animate-in fade-in duration-500 space-y-8">
            {/* Company leadership */}
            {typedLeaders.filter(l => l.type === 'company').length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Users className="h-6 w-6" style={{ color: primaryColor }} />
                  <h2 className="text-xl md:text-2xl font-bold">Liderança Empresarial</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Selecione a liderança empresarial que você deseja avaliar:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {typedLeaders.filter(l => l.type === 'company').map(leader => {
                    const isSelected = selectedCompanyLeader === leader.name;
                    return (
                      <button
                        key={leader.name}
                        onClick={() => setSelectedCompanyLeader(leader.name)}
                        className={`p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                          isSelected ? 'shadow-lg scale-[1.02]' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor } : {}}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? '' : 'border-gray-300'
                        }`} style={isSelected ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                        </span>
                        <span className="text-sm font-medium">{leader.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Department leadership */}
            {typedLeaders.filter(l => l.type === 'department').length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Users className="h-6 w-6" style={{ color: primaryColor }} />
                  <h2 className="text-xl md:text-2xl font-bold">Liderança de Departamento</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Selecione a liderança do seu departamento:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {typedLeaders.filter(l => l.type === 'department').map(leader => {
                    const isSelected = selectedDeptLeader === leader.name;
                    return (
                      <button
                        key={leader.name}
                        onClick={() => setSelectedDeptLeader(leader.name)}
                        className={`p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                          isSelected ? 'shadow-lg scale-[1.02]' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor } : {}}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? '' : 'border-gray-300'
                        }`} style={isSelected ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                        </span>
                        <span className="text-sm font-medium">{leader.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <Button
                onClick={handleLeaderConfirm}
                disabled={
                  (typedLeaders.filter(l => l.type === 'company').length > 0 && !selectedCompanyLeader) ||
                  (typedLeaders.filter(l => l.type === 'department').length > 0 && !selectedDeptLeader)
                }
                style={{ backgroundColor: primaryColor }}
                className="text-white px-8"
              >
                Iniciar Pesquisa <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="flex justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/60 px-3 py-1 rounded-full">
                <Shield className="h-3 w-3" />
                Sua escolha não será associada às suas respostas
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {branding?.logo_url && <img src={branding.logo_url} alt="" className="h-8 w-auto" />}
          <span className="font-semibold text-sm">{branding?.name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          ~{estimatedMinutes} min
        </div>
      </header>

      {/* Progress */}
      <div className="px-4 py-2 bg-white/50">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{answeredCount} de {questions.length} perguntas</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Question */}
      <div className="flex-1 flex items-center justify-center p-4">
        {currentQ && (
          <div className="w-full max-w-lg animate-in fade-in slide-in-from-right-4 duration-300" key={currentIndex}>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: primaryColor }}>
              {currentQ.section_title}
            </p>

            <h2 className="text-xl md:text-2xl font-bold mb-8 leading-relaxed">
              {currentQ.text}
            </h2>

            {/* Scale question */}
            {currentQ.question_type === 'scale' && survey && (
              <div className="space-y-3">
                {Array.from({ length: survey.scale_max - survey.scale_min + 1 }, (_, i) => survey.scale_min + i).map(value => {
                  const isSelected = answers[currentQ.id] === value;
                  const labels = getScaleLabels(currentQ);
                  const label = labels[value - survey.scale_min] || '';
                  return (
                    <button
                      key={value}
                      onClick={() => handleScaleAnswer(value)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                        isSelected ? 'shadow-lg scale-[1.02]' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor } : {}}
                    >
                      <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        isSelected ? '' : 'border-gray-300'
                      }`} style={isSelected ? { borderColor: primaryColor, backgroundColor: primaryColor, color: 'white' } : {}}>
                        {value}
                      </span>
                      {label && <span className="text-sm">{label}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Choice question */}
            {currentQ.question_type === 'choice' && currentQ.options && (
              <div className="space-y-3">
                {currentQ.options.map(option => {
                  const isSelected = answers[currentQ.id] === option;
                  return (
                    <button
                      key={option}
                      onClick={() => handleChoiceAnswer(option)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                        isSelected ? 'shadow-lg scale-[1.02]' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor } : {}}
                    >
                      <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? '' : 'border-gray-300'
                      }`} style={isSelected ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                      <span className="text-sm font-medium">{option}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Open text question */}
            {currentQ.question_type === 'open_text' && (
              <div>
                <Textarea
                  value={(answers[currentQ.id] as string) || ''}
                  onChange={e => setAnswers(a => ({ ...a, [currentQ.id]: e.target.value }))}
                  placeholder="Escreva sua resposta aqui... (obrigatório)"
                  className="min-h-[120px] text-base"
                />
                {answers[currentQ.id] !== undefined && typeof answers[currentQ.id] === 'string' && (answers[currentQ.id] as string).trim() === '' && (
                  <p className="text-sm text-red-500 mt-2">Esta resposta é obrigatória.</p>
                )}
              </div>
            )}

            {/* Justification field */}
            {currentQ.has_justification && answers[currentQ.id] !== undefined && (
              <div className="mt-6 animate-in fade-in duration-300">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  ✎ {currentQ.justification_prompt}
                </label>
                <Textarea
                  value={justifications[currentQ.id] || ''}
                  onChange={e => setJustifications(j => ({ ...j, [currentQ.id]: e.target.value }))}
                  placeholder="Opcional – sua justificativa enriquece a análise..."
                  className="min-h-[80px] text-sm"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Anonymity badge */}
      <div className="flex justify-center pb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/60 px-3 py-1 rounded-full">
          <Shield className="h-3 w-3" />
          Respostas 100% anônimas
        </div>
      </div>

      {/* Navigation */}
      <footer className="p-4 border-t bg-white/80 backdrop-blur-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />Anterior
          </Button>

          {currentIndex === questions.length - 1 && allAnswered ? (
            <Button
              onClick={handleSubmit}
              disabled={status === 'submitting'}
              style={{ backgroundColor: primaryColor }}
              className="text-white"
            >
              {status === 'submitting' ? 'Enviando...' : 'Enviar Respostas'}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
              disabled={currentIndex === questions.length - 1}
            >
              Próxima<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
