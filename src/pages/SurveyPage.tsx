import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, ArrowRight, ArrowLeft } from 'lucide-react';

interface Question {
  id: string;
  text: string;
  section_title: string;
  section_id: string;
}

interface SurveyData {
  id: string;
  title: string;
  description: string | null;
  scale_min: number;
  scale_max: number;
  scale_labels: string[];
}

interface CompanyBranding {
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

export default function SurveyPage() {
  const { slug, token } = useParams();
  const [status, setStatus] = useState<'loading' | 'ready' | 'already_responded' | 'invalid' | 'submitting' | 'done'>('loading');
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [respondent, setRespondent] = useState<any>(null);

  useEffect(() => {
    loadSurvey();
  }, [slug, token]);

  const loadSurvey = async () => {
    if (!slug || !token) { setStatus('invalid'); return; }

    // Find company
    const { data: company } = await supabase.from('companies').select('*').eq('slug', slug).single();
    if (!company) { setStatus('invalid'); return; }
    setBranding({ name: company.name, logo_url: company.logo_url, primary_color: company.primary_color, secondary_color: company.secondary_color });

    // Find respondent by token
    const { data: resp } = await supabase.from('respondents').select('*').eq('token', token).single();
    if (!resp) { setStatus('invalid'); return; }
    if (resp.status === 'responded') { setStatus('already_responded'); return; }
    setRespondent(resp);

    // Get survey
    const { data: surveyData } = await supabase.from('surveys').select('*').eq('id', resp.survey_id).eq('status', 'active').single();
    if (!surveyData) { setStatus('invalid'); return; }

    let labels: string[] = [];
    try {
      labels = typeof surveyData.scale_labels === 'string' ? JSON.parse(surveyData.scale_labels) : Array.isArray(surveyData.scale_labels) ? surveyData.scale_labels : [];
    } catch { labels = []; }

    setSurvey({ ...surveyData, scale_labels: labels } as any);

    // Get sections + questions
    const { data: sections } = await supabase.from('survey_sections').select('*').eq('survey_id', surveyData.id).order('sort_order');
    const allQuestions: Question[] = [];
    for (const sec of sections || []) {
      const { data: qs } = await supabase.from('survey_questions').select('*').eq('section_id', sec.id).order('sort_order');
      (qs || []).forEach(q => allQuestions.push({ id: q.id, text: q.text, section_title: sec.title, section_id: sec.id }));
    }
    setQuestions(allQuestions);
    setStatus('ready');
  };

  const handleAnswer = (value: number) => {
    const q = questions[currentIndex];
    setAnswers(a => ({ ...a, [q.id]: value }));
    // Auto-advance after short delay
    setTimeout(() => {
      if (currentIndex < questions.length - 1) setCurrentIndex(i => i + 1);
    }, 300);
  };

  const handleSubmit = async () => {
    if (!survey || !respondent) return;
    setStatus('submitting');

    // Insert anonymous responses (with aggregatable metadata, NO respondent ID)
    const responseRows = questions.map(q => ({
      survey_id: survey.id,
      question_id: q.id,
      value: answers[q.id] || 0,
      department: respondent.department,
      company_leadership: respondent.company_leadership,
      department_leadership: respondent.department_leadership,
    }));

    const { error: respError } = await supabase.from('survey_responses').insert(responseRows);
    if (respError) { setStatus('ready'); return; }

    // Mark respondent as responded (tracking only)
    await supabase.from('respondents').update({ status: 'responded', responded_at: new Date().toISOString() }).eq('id', respondent.id);

    setStatus('done');
  };

  const progress = questions.length > 0 ? Math.round(((Object.keys(answers).length) / questions.length) * 100) : 0;
  const estimatedMinutes = Math.max(1, Math.ceil(questions.length * 0.3));
  const allAnswered = questions.every(q => answers[q.id] !== undefined);
  const currentQ = questions[currentIndex];

  // Dynamic branding styles
  const primaryColor = branding?.primary_color || '#3B82F6';
  const secondaryColor = branding?.secondary_color || '#1E40AF';

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
          <p className="text-muted-foreground text-lg">Sua resposta foi registrada com sucesso. Suas respostas são completamente anônimas.</p>
          {branding && <p className="mt-6 text-sm text-muted-foreground">{branding.name}</p>}
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
          <span>{Object.keys(answers).length} de {questions.length} perguntas</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" style={{ '--progress-color': primaryColor } as any} />
      </div>

      {/* Question */}
      <div className="flex-1 flex items-center justify-center p-4">
        {currentQ && (
          <div className="w-full max-w-lg animate-in fade-in slide-in-from-right-4 duration-300" key={currentIndex}>
            {/* Section label */}
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: primaryColor }}>
              {currentQ.section_title}
            </p>

            <h2 className="text-xl md:text-2xl font-bold mb-8 leading-relaxed">
              {currentQ.text}
            </h2>

            {/* Scale buttons */}
            <div className="space-y-3">
              {survey && Array.from({ length: survey.scale_max - survey.scale_min + 1 }, (_, i) => survey.scale_min + i).map(value => {
                const isSelected = answers[currentQ.id] === value;
                const label = survey.scale_labels?.[value - survey.scale_min] || '';
                return (
                  <button
                    key={value}
                    onClick={() => handleAnswer(value)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                      isSelected ? 'border-current shadow-lg scale-[1.02]' : 'border-gray-200 hover:border-gray-300 bg-white'
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
          </div>
        )}
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
