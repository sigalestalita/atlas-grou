import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, Clock, ArrowRight, ArrowLeft, Shield, Users, UserX } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Question {
  id: string;
  text: string;
  section_title: string;
  section_id: string;
  section_type: string;
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
  leaders: { name: string; type: 'company' | 'department'; hidden?: boolean }[];
}

interface CompanyBranding {
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

interface EvaluationRound {
  leaderName: string | null; // null = org round
  roundType: 'org' | 'leadership';
  completed: boolean;
}

type SurveyStatus = 'loading' | 'select_dept_leader' | 'round_intro' | 'ready' | 'already_responded' | 'invalid' | 'submitting' | 'round_done' | 'done' | 'no_evaluation';


const SCALE_LABELS: Record<string, string[]> = {
  avaliacao: ['Muito Ruim', 'Ruim', 'Regular', 'Bom', 'Muito Bom'],
  satisfacao: ['Muito Insatisfeito', 'Insatisfeito', 'Neutro', 'Satisfeito', 'Muito Satisfeito'],
  concordancia: ['Discordo totalmente', 'Discordo parcialmente', 'Neutro', 'Concordo parcialmente', 'Concordo totalmente'],
  frequencia: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre'],
  confianca: ['Muito Baixo', 'Baixo', 'Moderado', 'Alto', 'Muito Alto'],
  alinhamento: ['Totalmente Desalinhado', 'Pouco Alinhado', 'Parcialmente', 'Bem Alinhado', 'Totalmente Alinhado'],
};

export default function SurveyPage() {
  const { slug, token } = useParams();
  const [status, setStatus] = useState<SurveyStatus>('loading');
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [respondent, setRespondent] = useState<any>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Multi-round evaluation state
  const [evaluationRounds, setEvaluationRounds] = useState<EvaluationRound[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);

  // Department leader selection
  const [selectedDeptLeader, setSelectedDeptLeader] = useState<string | null>(null);
  const [respondentRole, setRespondentRole] = useState<'collaborator' | 'department_leader' | 'company_leader'>('collaborator');
  const [pendingDeptLeaderSelection, setPendingDeptLeaderSelection] = useState(false);

  // Current round's questions
  const currentRound = evaluationRounds[currentRoundIndex];
  const questions = currentRound?.roundType === 'leadership'
    ? allQuestions.filter(q => q.section_type === 'leadership')
    : allQuestions.filter(q => q.section_type !== 'leadership');

  // localStorage key for draft persistence (per token)
  const draftKey = token ? `survey_draft_${token}` : null;

  // Persist draft to localStorage whenever answers/justifications change
  useEffect(() => {
    if (!draftKey) return;
    if (status === 'loading' || status === 'invalid' || status === 'already_responded' || status === 'done' || status === 'no_evaluation') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        answers, justifications, currentIndex, currentRoundIndex,
        selectedDeptLeader, savedAt: Date.now(),
      }));
    } catch {}
  }, [answers, justifications, currentIndex, currentRoundIndex, selectedDeptLeader, status, draftKey]);

  // Warn before unload when there are unsaved answers
  useEffect(() => {
    const hasUnsaved = Object.keys(answers).length > 0 &&
      status !== 'done' && status !== 'already_responded' && status !== 'no_evaluation' && status !== 'invalid';
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [answers, status]);

  useEffect(() => { loadSurvey(); }, [slug, token]);

  const loadSurvey = async () => {
    if (!slug) { setStatus('invalid'); return; }

    const { data: company } = await supabase.from('companies').select('*').eq('slug', slug).single();
    if (!company) { setStatus('invalid'); return; }
    setBranding({ name: company.name, logo_url: company.logo_url, primary_color: company.primary_color, secondary_color: company.secondary_color });

    let surveyData: any = null;
    let resp: any = null;

    if (token) {
      const { data: respData } = await supabase.from('respondents').select('*').eq('token', token).single();
      if (!respData) { setStatus('invalid'); return; }
      if (respData.status === 'responded') { setStatus('already_responded'); return; }
      resp = respData;
      setRespondent(resp);

      const { data: sd } = await supabase.from('surveys').select('*').eq('id', resp.survey_id).eq('status', 'active').single();
      surveyData = sd;
    } else {
      const { data: sd } = await supabase.from('surveys').select('*').eq('company_id', company.id).eq('status', 'active').eq('open_access', true).order('created_at', { ascending: false }).limit(1).single();
      surveyData = sd;
      if (surveyData) {
        resp = { id: null, survey_id: surveyData.id, name: '', department: null, company_leadership: null, department_leadership: null };
        setRespondent(resp);
      }
    }

    if (!surveyData) { setStatus('invalid'); return; }

    let labels: string[] = [];
    try {
      labels = typeof surveyData.scale_labels === 'string' ? JSON.parse(surveyData.scale_labels) : Array.isArray(surveyData.scale_labels) ? surveyData.scale_labels as string[] : [];
    } catch { labels = []; }

    let leaders: { name: string; type: 'company' | 'department'; hidden?: boolean }[] = [];
    try {
      const raw = surveyData.leaders;
      if (Array.isArray(raw)) {
        leaders = raw.map((l: any) => ({ name: l.name || l, type: l.type || 'company', hidden: !!l.hidden }));
      }
    } catch { leaders = []; }

    const surveyParsed: SurveyData = { ...surveyData, scale_labels: labels, leaders } as any;
    setSurvey(surveyParsed);

    // Load questions with section_type
    const { data: sections } = await supabase.from('survey_sections').select('*').eq('survey_id', surveyData.id).order('sort_order');
    const loadedQuestions: Question[] = [];
    for (const sec of sections || []) {
      const { data: qs } = await supabase.from('survey_questions').select('*').eq('section_id', sec.id).order('sort_order');
      (qs || []).forEach(q => {
        let opts: string[] | null = null;
        if (q.options) {
          try { opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options as string[]; } catch { opts = null; }
        }
        loadedQuestions.push({
          id: q.id, text: q.text, section_title: sec.title, section_id: sec.id,
          section_type: (sec as any).section_type || 'organization',
          question_type: q.question_type, scale_type: q.scale_type,
          options: opts, has_justification: q.has_justification,
          justification_prompt: q.justification_prompt,
        });
      });
    }
    setAllQuestions(loadedQuestions);

    const hasLeadershipQuestions = loadedQuestions.some(q => q.section_type === 'leadership');

    // Determine respondent role
    const companyLeaders = leaders.filter(l => l.type === 'company');
    const deptLeaders = leaders.filter(l => l.type === 'department');
    const respondentName = resp.name?.trim().toLowerCase() || '';

    const isCompanyLeader = companyLeaders.some(l => l.name.trim().toLowerCase() === respondentName);
    const isDeptLeader = deptLeaders.some(l => l.name.trim().toLowerCase() === respondentName);

    if (isCompanyLeader) {
      setRespondentRole('company_leader');
      setStatus('no_evaluation');
      return;
    }

    if (isDeptLeader) {
      setRespondentRole('department_leader');
      // Dept leaders: org questions first, then evaluate company leaders
      const rounds: EvaluationRound[] = [
        { leaderName: null, roundType: 'org', completed: false },
        ...companyLeaders.map(l => ({ leaderName: l.name, roundType: 'leadership' as const, completed: false })),
      ];
      setEvaluationRounds(rounds);
      setCurrentRoundIndex(0);
      setStatus('round_intro');
      return;
    }

    // Collaborator
    setRespondentRole('collaborator');
    if (deptLeaders.length > 0 && hasLeadershipQuestions) {
      // Start with org round; dept leader selection will appear after org round completes
      setPendingDeptLeaderSelection(true);
      const rounds: EvaluationRound[] = [
        { leaderName: null, roundType: 'org', completed: false },
      ];
      setEvaluationRounds(rounds);
      setCurrentRoundIndex(0);
      setStatus('round_intro');
    } else if (hasLeadershipQuestions && companyLeaders.length > 0) {
      // No dept leaders, org + company leaders
      const rounds: EvaluationRound[] = [
        { leaderName: null, roundType: 'org', completed: false },
        ...companyLeaders.map(l => ({ leaderName: l.name, roundType: 'leadership' as const, completed: false })),
      ];
      setEvaluationRounds(rounds);
      setCurrentRoundIndex(0);
      setStatus('round_intro');
    } else {
      // No leadership questions or no leaders - just org questions
      const rounds: EvaluationRound[] = [
        { leaderName: null, roundType: 'org', completed: false },
      ];
      setEvaluationRounds(rounds);
      setCurrentRoundIndex(0);
      setStatus('round_intro');
    }

    // Restore draft from localStorage if present
    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft?.answers) setAnswers(draft.answers);
          if (draft?.justifications) setJustifications(draft.justifications);
          if (typeof draft?.currentIndex === 'number') setCurrentIndex(Math.max(0, draft.currentIndex));
          if (typeof draft?.currentRoundIndex === 'number') setCurrentRoundIndex(Math.max(0, draft.currentRoundIndex));
          if (draft?.selectedDeptLeader) setSelectedDeptLeader(draft.selectedDeptLeader);
          // If user had progressed past intro, jump straight back into the questions
          if (draft?.answers && Object.keys(draft.answers).length > 0) setStatus('ready');
        }
      } catch {}
    }
  };

  const confirmDeptLeaderSelection = () => {
    if (!selectedDeptLeader || !survey) return;
    setPendingDeptLeaderSelection(false);
    const companyLeaders = survey.leaders.filter(l => l.type === 'company');
    // Leadership rounds: dept leader first, then company leaders
    const leadershipRounds: EvaluationRound[] = [
      { leaderName: selectedDeptLeader, roundType: 'leadership', completed: false },
      ...companyLeaders.map(l => ({ leaderName: l.name, roundType: 'leadership' as const, completed: false })),
    ];
    // Append to existing rounds (org already completed)
    const updatedRounds = [...evaluationRounds, ...leadershipRounds];
    setEvaluationRounds(updatedRounds);
    setCurrentRoundIndex(evaluationRounds.length); // first leadership round
    setStatus('round_intro');
  };

  const startRound = () => {
    setAnswers({});
    setJustifications({});
    setCurrentIndex(0);
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

  const submitRound = async () => {
    if (!survey || !respondent) return;
    setSubmitError(null);
    setStatus('submitting');

    const currentLeader = currentRound?.leaderName || null;

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
        department_leadership: respondent.department_leadership,
        evaluated_leader: currentLeader,
      };
    }).filter(r => r.value !== null || r.text_value !== null);

    // Merge justifications for scale/choice answers
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

    // Retry with backoff: 0s, 2s, 5s. Timeout 30s per attempt.
    const delays = [0, 2000, 5000];
    let lastError: any = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 30000);
        const insertPromise = supabase.from('survey_responses').insert(responseRows).abortSignal(ctrl.signal);
        const { error } = await insertPromise;
        clearTimeout(timeoutId);
        if (error) { lastError = error; continue; }
        lastError = null;
        break;
      } catch (e: any) {
        lastError = e;
      }
    }

    if (lastError) {
      console.error('Submit error after retries:', lastError);
      setSubmitError(
        'Não foi possível enviar suas respostas agora. Suas respostas estão salvas no seu navegador. Verifique sua conexão e clique em "Reenviar".'
      );
      setStatus('ready');
      return;
    }

    // Mark this round as completed
    const updatedRounds = [...evaluationRounds];
    updatedRounds[currentRoundIndex] = { ...updatedRounds[currentRoundIndex], completed: true };
    setEvaluationRounds(updatedRounds);

    const nextIncomplete = updatedRounds.findIndex((r, i) => i > currentRoundIndex && !r.completed);
    if (nextIncomplete !== -1) {
      setCurrentRoundIndex(nextIncomplete);
      setStatus('round_done');
    } else if (pendingDeptLeaderSelection && !selectedDeptLeader) {
      // Org round done, now ask for dept leader selection before leadership rounds
      setStatus('select_dept_leader');
    } else {
      if (respondent.id) {
        try {
          await supabase.from('respondents').update({ status: 'responded', responded_at: new Date().toISOString() }).eq('id', respondent.id);
        } catch (e) { console.error('Failed to mark respondent responded:', e); }
      }
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
      setStatus('done');
    }
  };

  const answeredCount = questions.filter(q => answers[q.id] !== undefined).length;
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const orgQCount = allQuestions.filter(q => q.section_type !== 'leadership').length;
  const leaderQCount = allQuestions.filter(q => q.section_type === 'leadership').length;
  const leaderRounds = evaluationRounds.filter(r => r.roundType === 'leadership').length;
  const estimatedMinutes = Math.max(1, Math.ceil((orgQCount + leaderQCount * leaderRounds) * 0.4));

  // Global progress across all rounds
  const questionsPerRound = (round: EvaluationRound) =>
    round.roundType === 'leadership' ? leaderQCount : orgQCount;
  const totalQuestionsAllRounds = evaluationRounds.reduce((acc, r) => acc + questionsPerRound(r), 0);
  const completedQuestionsAllRounds = evaluationRounds.reduce((acc, r, i) => {
    if (r.completed) return acc + questionsPerRound(r);
    if (i === currentRoundIndex) return acc + answeredCount;
    return acc;
  }, 0);
  const overallProgress = totalQuestionsAllRounds > 0
    ? Math.round((completedQuestionsAllRounds / totalQuestionsAllRounds) * 100)
    : 0;
  const remainingQuestions = Math.max(0, totalQuestionsAllRounds - completedQuestionsAllRounds);
  const minutesRemaining = Math.max(1, Math.ceil(remainingQuestions * 0.4));
  const isLastRound = currentRoundIndex >= evaluationRounds.length - 1 && !pendingDeptLeaderSelection;
  const allAnswered = questions.every(q => {
    const ans = answers[q.id];
    if (ans === undefined) return false;
    if ((q.question_type === 'open_text' || q.question_type === 'text') && typeof ans === 'string' && ans.trim() === '') return false;
    if (q.has_justification && (!justifications[q.id] || justifications[q.id].trim() === '')) return false;
    return true;
  });
  const currentQ = questions[currentIndex];
  const currentQuestionBlocksAdvance = (() => {
    if (!currentQ) return false;
    const ans = answers[currentQ.id];
    // Block if open text question has no answer
    if ((currentQ.question_type === 'open_text' || currentQ.question_type === 'text') &&
      (ans === undefined || (typeof ans === 'string' && ans.trim() === ''))) return true;
    // Block if any other question type has no answer selected
    if (ans === undefined || (typeof ans === 'string' && ans.trim() === '')) return true;
    // Block if justification is required but missing
    if (currentQ.has_justification && (
      !justifications[currentQ.id] ||
      justifications[currentQ.id].trim() === ''
    )) return true;
    return false;
  })();
  const currentLeaderName = currentRound?.leaderName || null;
  const completedRounds = evaluationRounds.filter(r => r.completed).length;
  const totalRounds = evaluationRounds.length;

  const primaryColor = branding?.primary_color || '#3B82F6';
  const secondaryColor = branding?.secondary_color || '#1E40AF';

  const getScaleLabels = (q: Question): string[] => {
    if (q.scale_type && SCALE_LABELS[q.scale_type]) return SCALE_LABELS[q.scale_type];
    return survey?.scale_labels || [];
  };

  const getRoundLabel = (round: EvaluationRound, idx: number): string => {
    if (round.roundType === 'org') return 'Perguntas sobre a organização';
    return round.leaderName || `Avaliação ${idx + 1}`;
  };

  // --- SCREENS ---

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

  if (status === 'no_evaluation') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
        <div className="text-center max-w-md animate-in fade-in duration-500">
          <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15` }}>
            <UserX className="h-8 w-8" style={{ color: primaryColor }} />
          </div>
          <h1 className="text-2xl font-bold mb-3">Sem avaliações pendentes</h1>
          <p className="text-muted-foreground">
            Como liderança empresarial, você não possui avaliações para responder nesta pesquisa.
          </p>
          {branding && <p className="mt-6 text-sm text-muted-foreground">{branding.name}</p>}
        </div>
      </div>
    );
  }

  // Department leader selection screen
  if (status === 'select_dept_leader') {
    const deptLeaders = survey?.leaders.filter(l => l.type === 'department' && !l.hidden) || [];
    return (
      <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
        <header className="p-4 flex items-center gap-3 border-b bg-white/80 backdrop-blur-sm">
          {branding?.logo_url && <img src={branding.logo_url} alt="" className="h-8 w-auto" />}
          <span className="font-semibold text-sm">{branding?.name}</span>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-lg animate-in fade-in duration-500">
            <div className="text-center mb-8">
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt={branding.name} className="h-20 w-auto mx-auto mb-4 object-contain" />
              ) : (
                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15` }}>
                  <Users className="h-8 w-8" style={{ color: primaryColor }} />
                </div>
              )}
              <h1 className="text-2xl font-bold mb-2">{survey?.title}</h1>
              {(survey as any)?.intro_text ? (
                <p className="text-muted-foreground mb-4">{(survey as any).intro_text}</p>
              ) : survey?.description ? (
                <p className="text-muted-foreground mb-4">{survey.description}</p>
              ) : null}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
                <Clock className="h-4 w-4" />
                <span>~{estimatedMinutes} min no total</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border mb-6">
              <h2 className="text-lg font-bold mb-2">Quem é seu líder de área?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Selecione a liderança direta da sua área.{survey?.leaders.some(l => l.type === 'company') ? ' Você responderá primeiro sobre a organização, depois avaliará esta pessoa e os líderes empresariais.' : ' Você avaliará esta pessoa.'}
              </p>

              <div className="space-y-2">
                {deptLeaders.map(leader => {
                  const isSelected = selectedDeptLeader === leader.name;
                  return (
                    <button
                      key={leader.name}
                      onClick={() => setSelectedDeptLeader(leader.name)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                        isSelected ? 'shadow-lg scale-[1.02]' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                      style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10` } : {}}
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? '' : 'border-gray-300'
                      }`} style={isSelected ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                      </span>
                      <span className="font-medium">{leader.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-center">
              <Button
                onClick={confirmDeptLeaderSelection}
                disabled={!selectedDeptLeader}
                style={selectedDeptLeader ? { backgroundColor: primaryColor } : {}}
                className={selectedDeptLeader ? 'text-white px-8' : 'px-8'}
                size="lg"
              >
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/60 px-3 py-1 rounded-full">
                <Shield className="h-3 w-3" />
                Sua seleção não será vinculada às suas respostas
              </div>
            </div>
          </div>
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
          <p className="text-muted-foreground text-lg">
            {totalRounds > 1
              ? `Todas as ${totalRounds} etapas foram concluídas com sucesso.`
              : 'Sua resposta foi registrada com sucesso.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Suas respostas são completamente anônimas.</span>
          </div>
          {branding && <p className="mt-6 text-sm text-muted-foreground">{branding.name}</p>}
        </div>
      </div>
    );
  }

  // Round intro screen
  if (status === 'round_intro') {
    const isOrgRound = currentRound?.roundType === 'org';
    return (
      <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
        <header className="p-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {branding?.logo_url && <img src={branding.logo_url} alt="" className="h-8 w-auto" />}
            <span className="font-semibold text-sm">{branding?.name}</span>
          </div>
          {totalRounds > 1 && (
            <div className="text-sm text-muted-foreground">
              Etapa {currentRoundIndex + 1} de {totalRounds}
            </div>
          )}
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-lg text-center animate-in fade-in duration-500">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt={branding.name} className="h-20 w-auto mx-auto mb-6 object-contain" />
            ) : (
              <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15` }}>
                <Users className="h-8 w-8" style={{ color: primaryColor }} />
              </div>
            )}

            {completedRounds === 0 && currentRoundIndex === 0 && (
              <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2">{survey?.title}</h1>
                {(survey as any)?.intro_text ? (
                  <p className="text-muted-foreground">{(survey as any).intro_text}</p>
                ) : survey?.description ? (
                  <p className="text-muted-foreground">{survey.description}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>~{estimatedMinutes} min no total · {totalRounds} etapa{totalRounds > 1 ? 's' : ''}</span>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 shadow-sm border mb-6">
              {isOrgRound ? (
                <>
                  <p className="text-sm text-muted-foreground mb-2">
                    {completedRounds === 0 ? 'Primeiro, responda sobre:' : 'Próxima etapa:'}
                  </p>
                  <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>
                    A Organização
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    Responda as perguntas pensando na empresa/instituição como um todo.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-2">
                    {completedRounds === 0 ? 'Sua avaliação será sobre:' : 'Próxima avaliação sobre:'}
                  </p>
                  <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>
                    {currentRound?.leaderName}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    Responda todas as perguntas pensando nesta liderança.
                  </p>
                </>
              )}
            </div>

            {totalRounds > 1 && (
              <div className="flex justify-center gap-2 mb-6">
                {evaluationRounds.map((round, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full transition-all ${
                      round.completed ? 'scale-100' : i === currentRoundIndex ? 'scale-110 ring-2 ring-offset-2' : 'bg-gray-200'
                    }`}
                    style={
                      round.completed || i === currentRoundIndex
                        ? { backgroundColor: round.completed ? primaryColor : `${primaryColor}80` }
                        : {}
                    }
                    title={getRoundLabel(round, i)}
                  />
                ))}
              </div>
            )}

            <Button
              onClick={startRound}
              style={{ backgroundColor: primaryColor }}
              className="text-white px-8"
              size="lg"
            >
              {completedRounds === 0 && currentRoundIndex === 0 ? 'Iniciar' : 'Continuar'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <div className="mt-6 flex justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/60 px-3 py-1 rounded-full">
                <Shield className="h-3 w-3" />
                Respostas 100% anônimas
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Between-rounds screen
  if (status === 'round_done') {
    const lastCompletedName = (() => {
      const last = evaluationRounds.filter(r => r.completed).pop();
      if (!last) return '';
      return last.roundType === 'org' ? 'Perguntas sobre a organização' : last.leaderName || '';
    })();
    const nextRound = evaluationRounds[currentRoundIndex];
    const nextIsOrg = nextRound?.roundType === 'org';

    return (
      <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
        <header className="p-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {branding?.logo_url && <img src={branding.logo_url} alt="" className="h-8 w-auto" />}
            <span className="font-semibold text-sm">{branding?.name}</span>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-lg text-center animate-in fade-in duration-500">
            <CheckCircle className="h-16 w-16 mx-auto mb-4" style={{ color: primaryColor }} />
            <h2 className="text-2xl font-bold mb-2">Etapa concluída!</h2>
            <p className="text-muted-foreground mb-6">
              Você concluiu: <strong>{lastCompletedName}</strong>.
            </p>

            <div className="flex justify-center gap-2 mb-6">
              {evaluationRounds.map((round, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-all ${
                    round.completed ? '' : i === currentRoundIndex ? 'ring-2 ring-offset-2' : 'bg-gray-200'
                  }`}
                  style={
                    round.completed || i === currentRoundIndex
                      ? { backgroundColor: round.completed ? primaryColor : `${primaryColor}40` }
                      : {}
                  }
                  title={getRoundLabel(round, i)}
                />
              ))}
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              {completedRounds} de {totalRounds} etapas concluídas. Falta{totalRounds - completedRounds > 1 ? 'm' : ''} {totalRounds - completedRounds}.
            </p>

            <div className="bg-white rounded-2xl p-6 shadow-sm border mb-6">
              <p className="text-sm text-muted-foreground mb-2">Próxima etapa:</p>
              <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>
                {nextIsOrg ? 'A Organização' : nextRound?.leaderName}
              </h2>
              {!nextIsOrg && (
                <p className="text-sm text-muted-foreground mt-2">
                  Responda pensando nesta liderança.
                </p>
              )}
            </div>

            <Button
              onClick={() => setStatus('round_intro')}
              style={{ backgroundColor: primaryColor }}
              className="text-white px-8"
              size="lg"
            >
              Continuar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Main survey screen
  return (
    <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
      <header className="p-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {branding?.logo_url && <img src={branding.logo_url} alt="" className="h-8 w-auto" />}
          <span className="font-semibold text-sm">{branding?.name}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {currentRound?.roundType === 'org' ? (
            <span className="font-medium px-2 py-1 rounded-lg text-xs" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
              Sobre a organização
            </span>
          ) : currentLeaderName ? (
            <span className="font-medium px-2 py-1 rounded-lg text-xs" style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
              Avaliando: {currentLeaderName}
            </span>
          ) : null}
          {totalRounds > 1 && (
            <span className="text-xs">Etapa {currentRoundIndex + 1}/{totalRounds}</span>
          )}
        </div>
      </header>

      {/* Progress */}
      <div className="px-4 py-2 bg-white/50">
        <div className="flex justify-between text-xs text-muted-foreground mb-1 gap-2 flex-wrap">
          <span>
            {totalRounds > 1 ? (
              <>Progresso geral: {completedQuestionsAllRounds} de {totalQuestionsAllRounds} perguntas</>
            ) : (
              <>{answeredCount} de {questions.length} perguntas</>
            )}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{minutesRemaining} min restantes</span>
            <span className="font-medium">{totalRounds > 1 ? overallProgress : progress}%</span>
          </span>
        </div>
        <Progress value={totalRounds > 1 ? overallProgress : progress} className="h-2" />
        {totalRounds > 1 && (
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Etapa atual: {answeredCount}/{questions.length}</span>
            <span>{progress}% desta etapa</span>
          </div>
        )}
      </div>

      {submitError && (
        <div className="mx-4 mt-3 p-4 rounded-xl border-2 border-red-200 bg-red-50 text-sm">
          <p className="font-medium text-red-800 mb-2">Falha ao enviar</p>
          <p className="text-red-700 mb-3">{submitError}</p>
          <Button onClick={submitRound} size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
            Reenviar respostas
          </Button>
        </div>
      )}

      {/* Question */}
      <div className="flex-1 flex items-center justify-center p-4">
        {currentQ && (
          <div className="w-full max-w-lg animate-in fade-in slide-in-from-right-4 duration-300" key={`${currentRoundIndex}-${currentIndex}`}>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: primaryColor }}>
              {currentQ.section_title}
            </p>

            <h2 className="text-xl md:text-2xl font-bold mb-8 leading-relaxed">
              {currentQ.text}
            </h2>

            {/* NPS question (0-10) */}
            {currentQ.question_type === 'scale' && currentQ.scale_type === 'enps' && (
              <div className="space-y-2">
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, i) => i).map(value => {
                    const isSelected = answers[currentQ.id] === value;
                    const bgColor = value <= 6 ? '#EF4444' : value <= 8 ? '#F59E0B' : '#22C55E';
                    return (
                      <button
                        key={value}
                        onClick={() => handleScaleAnswer(value)}
                        className={`p-3 rounded-lg border-2 text-center transition-all font-bold text-sm ${
                          isSelected ? 'shadow-lg scale-105 text-white' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                        style={isSelected ? { borderColor: bgColor, backgroundColor: bgColor } : {}}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground px-1">
                  <span>Nada provável</span>
                  <span>Extremamente provável</span>
                </div>
              </div>
            )}

            {/* Scale question (1-5) */}
            {currentQ.question_type === 'scale' && currentQ.scale_type !== 'enps' && survey && (
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
                      <span className="text-sm font-medium">{label}</span>
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
            {(currentQ.question_type === 'open_text' || currentQ.question_type === 'text') && (
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
                <label className="text-sm font-medium mb-2 block" style={{ color: primaryColor }}>
                  ✎ {currentQ.justification_prompt} <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={justifications[currentQ.id] || ''}
                  onChange={e => setJustifications(j => ({ ...j, [currentQ.id]: e.target.value }))}
                  placeholder=""
                  className="min-h-[80px] text-sm"
                />
                {justifications[currentQ.id] !== undefined && justifications[currentQ.id].trim() === '' && (
                  <p className="text-sm text-red-500 mt-2">A justificativa é obrigatória.</p>
                )}
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
              onClick={() => isLastRound ? setConfirmOpen(true) : submitRound()}
              disabled={status === 'submitting'}
              style={{ backgroundColor: primaryColor }}
              className="text-white"
            >
              {status === 'submitting' ? 'Enviando...' : (
                !isLastRound
                  ? 'Finalizar e Próxima Etapa'
                  : 'Revisar e Enviar'
              )}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
              disabled={currentIndex === questions.length - 1 || currentQuestionBlocksAdvance}
            >
              Próxima<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar suas respostas?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Você está prestes a finalizar a pesquisa. Após o envio, <strong>não será possível alterar</strong> suas respostas.
                </p>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Etapas concluídas:</span><strong>{completedRounds + 1} de {totalRounds}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Perguntas respondidas:</span><strong>{completedQuestionsAllRounds + (allAnswered ? 0 : 0)}/{totalQuestionsAllRounds}</strong></div>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" /> Suas respostas são 100% anônimas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmOpen(false); submitRound(); }}
              style={{ backgroundColor: primaryColor }}
              className="text-white"
            >
              Confirmar envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
