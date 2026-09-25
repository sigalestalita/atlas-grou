import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NEW_COLUMNS, selectCompat } from "@/lib/dbCompat";
import { round2, scoreFromAverage } from "@/lib/climate";

/**
 * Leitura de uma rodada 360.
 *
 * O retrato aqui é por PESSOA AVALIADA, não pela empresa: cada diretor recebe
 * as avaliações que os colegas fizeram dele, mais a própria autoavaliação, e a
 * diferença entre as duas. Essa diferença é o que o 360 tem de próprio — quem
 * se vê muito acima do que os pares veem, e quem se vê muito abaixo, são dois
 * problemas distintos e nenhum deles aparece numa média só.
 */

export interface PeerText {
  question: string;
  text: string;
  /** Preenchido só em pesquisa identificada. */
  evaluator: string | null;
}

export interface Evaluatee {
  name: string;
  role: string | null;
  /** Média das notas dos pares, sem a autoavaliação. */
  peerAvg: number | null;
  peerScore: number | null;
  /** Quantos colegas avaliaram. */
  peers: number;
  /** Quantos colegas deveriam avaliar, pela matriz. */
  expectedPeers: number;
  selfRating: number | null;
  /** Autoavaliação menos média dos pares. Positivo = se vê acima. */
  gap: number | null;
  /** Textos dos pares, por pergunta. */
  peerTexts: PeerText[];
  /** Textos da própria pessoa. */
  selfTexts: { question: string; text: string }[];
  /** Notas dos pares, para a distribuição. */
  peerRatings: number[];
}

export interface Round360 {
  loading: boolean;
  error: string | null;
  survey: {
    id: string; title: string; status: string;
    scale_min: number; scale_max: number; scale_labels: string[];
    identified: boolean; wave_label: string | null;
  } | null;
  company: { id: string; name: string; logo_url: string | null; primary_color: string } | null;
  evaluatees: Evaluatee[];
  /** Quantas pessoas concluíram todas as etapas atribuídas a elas. */
  finished: number;
  participants: number;
  reload: () => void;
}

const EMPTY: Omit<Round360, "reload"> = {
  loading: true, error: null, survey: null, company: null,
  evaluatees: [], finished: 0, participants: 0,
};

export function use360(companyId: string | null | undefined, surveyId?: string): Round360 {
  const [state, setState] = useState<Omit<Round360, "reload">>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setState({ ...EMPTY, loading: false }); return; }
    let cancelled = false;

    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { data: company } = await supabase
          .from("companies").select("id, name, logo_url, primary_color")
          .eq("id", companyId).single();

        const { data: surveys } = await supabase
          .from("surveys").select("*").eq("company_id", companyId)
          .in("status", ["active", "closed"])
          .order("created_at", { ascending: false });

        const only360 = (surveys || []).filter((s) => (s as any).survey_mode === "360");
        const s = (surveyId && only360.find((x) => x.id === surveyId)) || only360[0];
        if (!s) {
          if (!cancelled) setState({ ...EMPTY, loading: false, company: (company as any) ?? null });
          return;
        }

        const scaleLabels: string[] = (() => {
          try {
            const raw = s.scale_labels;
            if (typeof raw === "string") return JSON.parse(raw);
            return Array.isArray(raw) ? (raw as string[]) : [];
          } catch { return []; }
        })();

        const survey = {
          id: s.id, title: s.title, status: s.status,
          scale_min: s.scale_min, scale_max: s.scale_max, scale_labels: scaleLabels,
          identified: !!(s as any).identified,
          wave_label: (s as any).wave_label ?? null,
        };

        // Perguntas, para dar nome a cada texto no relatório.
        const { data: secs } = await supabase
          .from("survey_sections").select("id, title, section_type")
          .eq("survey_id", s.id).order("sort_order");
        const { data: qs } = secs?.length
          ? await supabase.from("survey_questions")
              .select("id, text, section_id, question_type, sort_order")
              .in("section_id", secs.map((x) => x.id)).order("sort_order")
          : { data: [] as any[] };
        const questionById = new Map((qs || []).map((q) => [q.id, q]));

        // A matriz diz quem deveria avaliar quem — é o denominador.
        const { data: assigns } = await selectCompat<{
          evaluator_name: string; evaluatee_name: string;
          evaluatee_role?: string | null; is_self?: boolean;
        }>(
          ["evaluator_name", "evaluatee_name"], [...NEW_COLUMNS.assignments],
          (cols) => supabase.from("evaluation_assignments").select(cols).eq("survey_id", s.id),
        );

        const { data: responses } = await selectCompat<{
          question_id: string; value: number | null; text_value: string | null;
          evaluated_leader: string | null; submitted_at: string;
          is_self?: boolean; respondent_id?: string | null; submission_id?: string | null;
        }>(
          ["question_id", "value", "text_value", "evaluated_leader", "submitted_at"],
          [...NEW_COLUMNS.responses],
          (cols) => supabase.from("survey_responses").select(cols).eq("survey_id", s.id),
        );

        const { data: people } = await supabase
          .from("respondents").select("id, name, department, status").eq("survey_id", s.id);

        const nameById = new Map((people || []).map((p) => [p.id, p.name]));
        const roleByName = new Map((people || []).map((p) => [p.name, p.department]));

        // Quem é avaliado: sai da matriz, para que quem ainda não recebeu
        // nenhuma avaliação apareça na lista com zero em vez de sumir dela.
        const evaluateeNames = new Map<string, string | null>();
        const expected = new Map<string, number>();
        for (const a of assigns ?? []) {
          const isSelf = a.is_self ?? a.evaluator_name.trim().toLowerCase() === a.evaluatee_name.trim().toLowerCase();
          if (!evaluateeNames.has(a.evaluatee_name)) {
            evaluateeNames.set(a.evaluatee_name, a.evaluatee_role ?? roleByName.get(a.evaluatee_name) ?? null);
          }
          if (!isSelf) expected.set(a.evaluatee_name, (expected.get(a.evaluatee_name) ?? 0) + 1);
        }

        const rows = responses ?? [];
        const evaluatees: Evaluatee[] = Array.from(evaluateeNames.entries()).map(([name, role]) => {
          const mine = rows.filter((r) => r.evaluated_leader === name);
          const selfRows = mine.filter((r) => r.is_self);
          const peerRows = mine.filter((r) => !r.is_self);

          const peerRatings = peerRows.filter((r) => r.value != null).map((r) => r.value!);
          const peerAvg = peerRatings.length
            ? round2(peerRatings.reduce((a, b) => a + b, 0) / peerRatings.length)
            : null;
          const selfRating = selfRows.find((r) => r.value != null)?.value ?? null;

          const textOf = (r: typeof rows[number]) => {
            const raw = r.text_value ?? "";
            return (raw.includes("|||") ? raw.split("|||").slice(1).join("|||") : raw).trim();
          };

          const peerTexts: PeerText[] = peerRows
            .filter((r) => textOf(r))
            .map((r) => ({
              question: questionById.get(r.question_id)?.text ?? "",
              text: textOf(r),
              evaluator: survey.identified && r.respondent_id
                ? nameById.get(r.respondent_id) ?? null
                : null,
            }));

          const selfTexts = selfRows
            .filter((r) => textOf(r))
            .map((r) => ({ question: questionById.get(r.question_id)?.text ?? "", text: textOf(r) }));

          return {
            name, role,
            peerAvg,
            peerScore: peerAvg != null ? scoreFromAverage(peerAvg, survey.scale_min, survey.scale_max) : null,
            peers: peerRatings.length,
            expectedPeers: expected.get(name) ?? 0,
            selfRating,
            gap: peerAvg != null && selfRating != null ? round2(selfRating - peerAvg) : null,
            peerTexts, selfTexts, peerRatings,
          };
        }).sort((a, b) => (b.peerAvg ?? -1) - (a.peerAvg ?? -1));

        // Concluiu quem enviou todas as etapas atribuídas a ele.
        const participants = new Set((assigns ?? []).map((a) => a.evaluator_name)).size;
        const finished = (people || []).filter((p) => p.status === "responded").length;

        if (cancelled) return;
        setState({
          loading: false, error: null, survey,
          company: (company as any) ?? null,
          evaluatees, finished, participants,
        });
      } catch (e) {
        if (cancelled) return;
        setState({ ...EMPTY, loading: false, error: e instanceof Error ? e.message : "Falha ao carregar." });
      }
    })();

    return () => { cancelled = true; };
  }, [companyId, surveyId, nonce]);

  return { ...state, reload };
}
