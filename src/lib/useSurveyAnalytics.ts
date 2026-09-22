import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NEW_COLUMNS, selectCompat } from "@/lib/dbCompat";
import {
  MIN_GROUP, computeEnps, consensus, countPeople, distribution,
  groupByWithPrivacy, round2, scoreFromAverage, submissionKey,
  type Enps, type GroupStat, type ResponseRow,
} from "@/lib/climate";

/**
 * Carrega e agrega uma pesquisa inteira, uma vez só.
 *
 * Antes cada tela fazia a sua própria leitura — e cada uma carregava as
 * perguntas com um SELECT por seção, então uma pesquisa de oito seções batia
 * no banco nove vezes só para montar o questionário. Pior: o dashboard, o
 * relatório público e a exportação agregavam por conta própria, com regras
 * ligeiramente diferentes, e chegavam a números que não batiam entre si.
 * Aqui a leitura é uma e o resultado é o mesmo para todo mundo.
 */

export interface Section {
  id: string;
  title: string;
  section_type: string;
  sort_order: number;
}

export interface Question {
  id: string;
  text: string;
  section_id: string;
  section_title: string;
  section_type: string;
  question_type: string;
  scale_type: string | null;
  sort_order: number;
}

export interface QuestionStat {
  id: string;
  text: string;
  short: string;
  section: string;
  sectionId: string;
  avg: number;
  score: number;
  /** Pessoas distintas que responderam esta pergunta. */
  people: number;
  answers: number;
  dist: number[];
  /** 0–100: quanto o grupo respondeu parecido. */
  consensus: number;
}

export interface TextAnswer {
  questionId: string;
  question: string;
  text: string;
  /** Nota dada na mesma pergunta, quando o texto é uma justificativa. */
  value: number | null;
  leader: string | null;
  department: string | null;
  submittedAt: string;
}

export interface LeaderStat extends GroupStat {
  /** Média desta liderança em cada pergunta, para o comparativo e o radar. */
  byQuestion: Map<string, number>;
  /** Média por seção — a leitura que mais serve para conversa de feedback. */
  bySection: { section: string; avg: number; score: number }[];
  strengths: { id: string; text: string; avg: number }[];
  weaknesses: { id: string; text: string; avg: number }[];
}

export interface SurveyInfo {
  id: string;
  title: string;
  description: string | null;
  intro_text: string | null;
  status: string;
  scale_min: number;
  scale_max: number;
  open_access: boolean;
  leaders: { name: string; type: "company" | "department"; hidden?: boolean }[];
  closes_at: string | null;
  opens_at: string | null;
  wave_label: string | null;
}

export interface Analytics {
  loading: boolean;
  error: string | null;
  survey: SurveyInfo | null;
  company: { id: string; name: string; slug: string; logo_url: string | null; primary_color: string; secondary_color: string } | null;
  sections: Section[];
  questions: Question[];

  /** Participação. */
  invited: number;
  responded: number;
  started: number;
  responseRate: number;
  /** Pessoas distintas por trás das respostas — é o n real das análises. */
  people: number;

  overallAvg: number;
  overallScore: number;
  enps: Enps | null;

  questionStats: QuestionStat[];
  departments: { groups: GroupStat[]; suppressed: number };
  leaders: LeaderStat[];
  leadersSuppressed: number;
  /** Seções × lideranças, para o heatmap. */
  sectionsBySide: { section: string; values: Record<string, number> }[];
  textAnswers: TextAnswer[];
  /** Envios por dia, para a curva de participação. */
  timeline: { date: string; count: number }[];

  /**
   * Todas as pesquisas da empresa que já saíram do rascunho, da mais recente
   * para a mais antiga. O painel mostra uma por vez; sem esta lista, as
   * rodadas anteriores ficavam invisíveis — não havia como chegar nelas.
   */
  availableSurveys: { id: string; title: string; status: string; created_at: string; wave_label: string | null }[];

  reload: () => void;
}

const EMPTY: Omit<Analytics, "reload"> = {
  loading: true, error: null, survey: null, company: null, sections: [], questions: [],
  invited: 0, responded: 0, started: 0, responseRate: 0, people: 0,
  overallAvg: 0, overallScore: 0, enps: null,
  questionStats: [], departments: { groups: [], suppressed: 0 }, leaders: [],
  leadersSuppressed: 0, sectionsBySide: [], textAnswers: [], timeline: [],
  availableSurveys: [],
};

function parseLeaders(raw: unknown): SurveyInfo["leaders"] {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
    return (arr as unknown[]).map((l) =>
      typeof l === "string"
        ? { name: l, type: "company" as const }
        : { name: (l as any).name, type: (l as any).type || "company", hidden: !!(l as any).hidden },
    ).filter((l) => l.name);
  } catch {
    return [];
  }
}

/** Corta o texto da pergunta para caber em eixo de gráfico, sem partir palavra. */
function short(text: string, max = 46): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

export function useSurveyAnalytics(
  companyId: string | null | undefined,
  options: { leaderFilter?: string; departmentFilter?: string; surveyId?: string } = {},
): Analytics {
  const { leaderFilter = "all", departmentFilter = "all", surveyId } = options;
  const [state, setState] = useState<Omit<Analytics, "reload">>(EMPTY);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    let cancelled = false;

    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("id, name, slug, logo_url, primary_color, secondary_color")
          .eq("id", companyId)
          .single();

        // Todas as pesquisas que já saíram do rascunho, não só a última: é o
        // que permite abrir uma rodada anterior em vez de só a mais recente.
        const { data: surveyRows } = await supabase
          .from("surveys")
          .select("*")
          .eq("company_id", companyId)
          .in("status", ["active", "closed"])
          .order("created_at", { ascending: false });

        const availableSurveys = (surveyRows || []).map((r) => ({
          id: r.id, title: r.title, status: r.status, created_at: r.created_at,
          wave_label: (r as any).wave_label ?? null,
        }));

        // A pedida, ou a mais recente.
        const s = (surveyId && surveyRows?.find((r) => r.id === surveyId)) || surveyRows?.[0];
        if (!s) {
          if (!cancelled) {
            setState({ ...EMPTY, loading: false, company: (company as any) ?? null, availableSurveys });
          }
          return;
        }

        const survey: SurveyInfo = {
          id: s.id, title: s.title, description: s.description,
          intro_text: (s as any).intro_text ?? null, status: s.status,
          scale_min: s.scale_min, scale_max: s.scale_max,
          open_access: !!s.open_access, leaders: parseLeaders(s.leaders),
          closes_at: (s as any).closes_at ?? null,
          opens_at: (s as any).opens_at ?? null,
          wave_label: (s as any).wave_label ?? null,
        };

        // Seções e perguntas em duas consultas, não uma por seção.
        const { data: secRows } = await supabase
          .from("survey_sections").select("id, title, section_type, sort_order")
          .eq("survey_id", survey.id).order("sort_order");
        const sections: Section[] = (secRows || []).map((r) => ({
          id: r.id, title: r.title,
          section_type: (r as any).section_type || "organization",
          sort_order: r.sort_order,
        }));

        const { data: qRows } = sections.length
          ? await supabase
              .from("survey_questions")
              .select("id, text, section_id, question_type, scale_type, sort_order")
              .in("section_id", sections.map((x) => x.id))
              .order("sort_order")
          : { data: [] as any[] };

        const sectionById = new Map(sections.map((x) => [x.id, x]));
        const questions: Question[] = (qRows || []).map((q) => {
          const sec = sectionById.get(q.section_id);
          return {
            id: q.id, text: q.text, section_id: q.section_id,
            section_title: sec?.title ?? "", section_type: sec?.section_type ?? "organization",
            question_type: q.question_type, scale_type: (q as any).scale_type ?? null,
            sort_order: q.sort_order,
          };
        });
        const questionById = new Map(questions.map((q) => [q.id, q]));

        // Respostas. `submission_id` só existe depois da migração; sem ela,
        // a consulta inteira seria recusada e a tela ficaria vazia.
        const RESPONSE_COLS = [
          "question_id", "value", "text_value", "department",
          "company_leadership", "department_leadership", "evaluated_leader", "submitted_at",
        ];
        const { data: respRows, error: respErr } = await selectCompat(
          RESPONSE_COLS, [...NEW_COLUMNS.responses],
          (cols) => {
            let q = supabase.from("survey_responses").select(cols).eq("survey_id", survey.id);
            if (leaderFilter !== "all") q = q.eq("evaluated_leader", leaderFilter);
            if (departmentFilter !== "all") q = q.eq("department", departmentFilter);
            return q;
          },
        );
        if (respErr) throw new Error(respErr.message);

        const responses = (respRows ?? []) as ResponseRow[];

        // Participação.
        // `started_at` idem: sem o adaptador, a consulta falharia inteira e a
        // participação apareceria zerada mesmo com gente tendo respondido.
        const { data: respondents } = await selectCompat<{ status: string; responded_at: string | null; started_at?: string | null }>(
          ["status", "responded_at"], ["started_at"],
          (cols) => supabase.from("respondents").select(cols).eq("survey_id", survey.id),
        );
        const invited = respondents?.length ?? 0;
        const respondedTracked = respondents?.filter((r) => r.status === "responded").length ?? 0;
        const started = respondents?.filter((r) => (r as any).started_at && r.status !== "responded").length ?? 0;
        const people = countPeople(responses);
        // No link aberto não existe lista de convidados: o denominador não faz
        // sentido e a taxa vira quantas pessoas responderam, sem percentual.
        const responded = survey.open_access ? people : respondedTracked;
        const responseRate = survey.open_access || invited === 0
          ? 0
          : Math.round((respondedTracked / invited) * 100);

        // Estatística por pergunta — casada por id, não por prefixo de texto.
        const byQuestion = new Map<string, ResponseRow[]>();
        for (const r of responses) {
          const arr = byQuestion.get(r.question_id) || [];
          arr.push(r);
          byQuestion.set(r.question_id, arr);
        }

        const scaleQuestions = questions.filter(
          (q) => q.question_type === "scale" && q.scale_type !== "enps",
        );

        const questionStats: QuestionStat[] = scaleQuestions.map((q) => {
          const rows = (byQuestion.get(q.id) || []).filter((r) => r.value != null);
          const vals = rows.map((r) => r.value!);
          const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          return {
            id: q.id, text: q.text, short: short(q.text),
            section: q.section_title, sectionId: q.section_id,
            avg: round2(avg),
            score: scoreFromAverage(avg, survey.scale_min, survey.scale_max),
            people: countPeople(rows),
            answers: vals.length,
            dist: distribution(vals, survey.scale_min, survey.scale_max),
            consensus: consensus(vals, survey.scale_min, survey.scale_max),
          };
        }).filter((q) => q.answers > 0);

        // Score geral: só perguntas de escala normal. Um eNPS de 0 a 10
        // misturado numa escala de 1 a 5 puxaria a média para cima sem querer.
        const scaleIds = new Set(scaleQuestions.map((q) => q.id));
        const scaleValues = responses
          .filter((r) => r.value != null && scaleIds.has(r.question_id))
          .map((r) => r.value!);
        const overallAvg = scaleValues.length
          ? round2(scaleValues.reduce((a, b) => a + b, 0) / scaleValues.length)
          : 0;
        const overallScore = scaleValues.length
          ? scoreFromAverage(overallAvg, survey.scale_min, survey.scale_max)
          : 0;

        // eNPS — calculado como manda a métrica, não como média.
        const enpsIds = new Set(questions.filter((q) => q.scale_type === "enps").map((q) => q.id));
        const enps = enpsIds.size
          ? computeEnps(responses.filter((r) => enpsIds.has(r.question_id) && r.value != null).map((r) => r.value!))
          : null;

        // Recortes, com o corte de anonimato contando gente.
        const scaleRows = responses.filter((r) => scaleIds.has(r.question_id));
        const departments = groupByWithPrivacy(
          scaleRows, (r) => r.department, survey.scale_min, survey.scale_max,
        );

        const leaderGroups = groupByWithPrivacy(
          scaleRows,
          (r) => r.evaluated_leader || r.company_leadership,
          survey.scale_min, survey.scale_max,
        );

        const leaders: LeaderStat[] = leaderGroups.groups.map((g) => {
          const rows = scaleRows.filter((r) => (r.evaluated_leader || r.company_leadership) === g.name && r.value != null);

          const perQuestion = new Map<string, number[]>();
          const perSection = new Map<string, number[]>();
          for (const r of rows) {
            const q = questionById.get(r.question_id);
            if (!q) continue;
            (perQuestion.get(r.question_id) ?? perQuestion.set(r.question_id, []).get(r.question_id)!).push(r.value!);
            (perSection.get(q.section_title) ?? perSection.set(q.section_title, []).get(q.section_title)!).push(r.value!);
          }

          const byQ = new Map<string, number>();
          const ranked: { id: string; text: string; avg: number }[] = [];
          for (const [qid, vals] of perQuestion) {
            const avg = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
            byQ.set(qid, avg);
            const q = questionById.get(qid);
            if (q) ranked.push({ id: qid, text: q.text, avg });
          }
          ranked.sort((a, b) => a.avg - b.avg);

          const bySection = Array.from(perSection.entries()).map(([section, vals]) => {
            const avg = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
            return { section, avg, score: scoreFromAverage(avg, survey.scale_min, survey.scale_max) };
          });

          return {
            ...g,
            byQuestion: byQ,
            bySection,
            strengths: ranked.slice(-3).reverse(),
            weaknesses: ranked.slice(0, 3),
          };
        });

        // Heatmap: cada seção contra cada liderança.
        const sectionsBySide = sections
          .map((sec) => {
            const values: Record<string, number> = {};
            for (const l of leaders) {
              const hit = l.bySection.find((b) => b.section === sec.title);
              if (hit) values[l.name] = hit.score;
            }
            return { section: sec.title, values };
          })
          .filter((row) => Object.keys(row.values).length > 0);

        // Texto aberto: resposta aberta e justificativa, com a nota ao lado.
        const textAnswers: TextAnswer[] = [];
        for (const r of responses) {
          if (!r.text_value) continue;
          const q = questionById.get(r.question_id);
          if (!q) continue;
          // Escolha com justificativa é gravada como "opção|||justificativa".
          const text = r.text_value.includes("|||")
            ? r.text_value.split("|||").slice(1).join("|||").trim()
            : r.text_value.trim();
          if (!text) continue;
          textAnswers.push({
            questionId: q.id, question: q.text, text,
            value: r.value, leader: r.evaluated_leader,
            department: r.department, submittedAt: r.submitted_at,
          });
        }

        // Curva de participação: um ponto por dia, contando envios.
        const perDay = new Map<string, Set<string>>();
        for (const r of responses) {
          const day = r.submitted_at.slice(0, 10);
          (perDay.get(day) ?? perDay.set(day, new Set()).get(day)!).add(submissionKey(r));
        }
        const timeline = Array.from(perDay.entries())
          .map(([date, set]) => ({ date, count: set.size }))
          .sort((a, b) => a.date.localeCompare(b.date));

        if (cancelled) return;
        setState({
          loading: false, error: null,
          survey, company: (company as any) ?? null, sections, questions,
          invited, responded, started, responseRate, people,
          overallAvg, overallScore, enps,
          questionStats,
          departments: { groups: departments.groups, suppressed: departments.suppressed },
          leaders, leadersSuppressed: leaderGroups.suppressed,
          sectionsBySide, textAnswers, timeline, availableSurveys,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        setState({ ...EMPTY, loading: false, error: e instanceof Error ? e.message : "Falha ao carregar os dados." });
      }
    })();

    return () => { cancelled = true; };
  }, [companyId, leaderFilter, departmentFilter, surveyId, nonce]);

  return { ...state, reload };
}

export { MIN_GROUP };
