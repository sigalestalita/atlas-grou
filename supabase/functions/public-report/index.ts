// Public read-only aggregated survey report (no auth)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CID = "Cid Lauro Vale Junior";
const ALEX = "Alexandre Daguano";

// Janela de pareamento sessão↔respondent. Cada respondent finaliza ao enviar o último
// bloco — então a sessão "real" daquele bucket fica a poucos segundos do responded_at.
// Janela apertada evita que sessões duplicadas (resubmissões antigas) sejam contadas.
const WINDOW_BEFORE = 8 * 60 * 1000;  // 8 min antes
const WINDOW_AFTER = 8 * 60 * 1000;   // 8 min depois

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return json({ error: "slug required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: company } = await supabase
      .from("companies")
      .select("id, name, slug, logo_url, primary_color, secondary_color")
      .eq("slug", slug)
      .maybeSingle();
    if (!company) return json({ error: "company not found" }, 404);

    const { data: survey } = await supabase
      .from("surveys")
      .select("id, title, scale_min, scale_max, scale_labels")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!survey) return json({ error: "survey not found" }, 404);

    const { data: sections } = await supabase
      .from("survey_sections")
      .select("id, title, section_type, sort_order")
      .eq("survey_id", survey.id)
      .order("sort_order");

    const { data: questions } = await supabase
      .from("survey_questions")
      .select("id, section_id, text, question_type, sort_order")
      .in("section_id", (sections ?? []).map((s: any) => s.id))
      .order("sort_order");

    const responses: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase
        .from("survey_responses")
        .select("question_id, value, text_value, evaluated_leader, submitted_at")
        .eq("survey_id", survey.id)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!page || page.length === 0) break;
      responses.push(...page);
      if (page.length < pageSize) break;
    }

    const { data: respList } = await supabase
      .from("respondents")
      .select("id, responded_at")
      .eq("survey_id", survey.id)
      .eq("status", "responded");

    const respTimes = (respList ?? [])
      .filter((r: any) => r.responded_at)
      .map((r: any) => ({ id: r.id, t: new Date(r.responded_at).getTime() }));

    const totalRespondents = respList?.length ?? 0;

    // Helper: para cada respondent, escolher a sessão do bucket mais próxima do
    // responded_at dentro de uma janela estreita. Cada respondent reivindica no
    // máximo 1 sessão. Sessões não reivindicadas são tratadas como duplicatas
    // (resubmissões antigas) e descartadas do bucket.
    const pairSessions = (rs: any[]): { paired: Set<number>; respondentCount: number } => {
      const sessions = Array.from(
        new Set(rs.map((r) => new Date(r.submitted_at).getTime())),
      ).sort((a, b) => a - b);
      const used = new Set<number>();
      const paired = new Set<number>();
      const respondentsCovered = new Set<string>();
      // Iterar respondents em ordem decrescente — os mais recentes reivindicam primeiro
      const sortedResp = [...respTimes].sort((a, b) => b.t - a.t);
      for (const r of sortedResp) {
        const lo = r.t - WINDOW_BEFORE;
        const hi = r.t + WINDOW_AFTER;
        let best: { s: number; abs: number } | null = null;
        for (const s of sessions) {
          if (s < lo || s > hi) continue;
          if (used.has(s)) continue;
          const abs = Math.abs(s - r.t);
          if (!best || abs < best.abs) best = { s, abs };
        }
        if (best) {
          used.add(best.s);
          paired.add(best.s);
          respondentsCovered.add(r.id);
        }
      }
      return { paired, respondentCount: respondentsCovered.size };
    };





    // Group by question
    const byQuestion = new Map<string, any[]>();
    (responses ?? []).forEach((r: any) => {
      if (!byQuestion.has(r.question_id)) byQuestion.set(r.question_id, []);
      byQuestion.get(r.question_id)!.push(r);
    });

    const sectionMap = new Map((sections ?? []).map((s: any) => [s.id, s]));

    const orgQuestions: any[] = [];
    const leaderQuestions: any[] = [];
    (questions ?? []).forEach((q: any) => {
      const sec = sectionMap.get(q.section_id);
      if (!sec) return;
      const item = { ...q, section_title: sec.title, section_type: sec.section_type };
      if (sec.section_type === "leadership") leaderQuestions.push(item);
      else orgQuestions.push(item);
    });

    const normalize = (t: string) =>
      t.replace(/\s+/g, " ").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const STOPWORDS = new Set(["sem comentarios", "e", "."]);

    const buildQuestionStats = (q: any, rs: any[]) => {
      // Respondent count por pergunta = sessões distintas (já filtradas para pareadas no bucket)
      const respondent_count = new Set(rs.map((r) => new Date(r.submitted_at).toISOString())).size;
      if (q.question_type === "text") {
        const raw = rs.map((r) => (r.text_value ?? "").trim()).filter((t) => t.length > 0);
        const rawSeen = new Set<string>();
        let duplicates_removed = 0;
        for (const t of raw) {
          const key = normalize(t);
          if (rawSeen.has(key)) { duplicates_removed++; continue; }
          rawSeen.add(key);
        }
        const seen = new Set<string>();
        const comments: string[] = [];
        for (const t of raw) {
          const key = normalize(t);
          if (seen.has(key)) continue;
          seen.add(key);
          if (STOPWORDS.has(key)) continue;
          comments.push(t);
        }
        return { ...q, type: "text", total: comments.length, raw_total: raw.length, duplicates_removed, respondent_count, comments };
      }
      const dist: Record<number, number> = {};
      for (let v = survey.scale_min; v <= survey.scale_max; v++) dist[v] = 0;
      let total = 0;
      rs.forEach((r) => {
        if (r.value != null && dist[r.value] !== undefined) { dist[r.value]++; total++; }
      });
      const distribution = Object.entries(dist).map(([value, count]) => ({
        value: Number(value), count, percent: total > 0 ? (count / total) * 100 : 0,
      }));
      return { ...q, type: "scale", total, respondent_count, distribution };
    };

    type BucketSpec = {
      key: string;
      label: string;
      questions: any[];
      baseFilter: (r: any) => boolean;
      denominatorMode: "total" | "distinct_sessions";
    };

    const buildBucket = (spec: BucketSpec) => {
      const bucketResponses = (responses ?? []).filter(spec.baseFilter);
      const { paired, respondentCount } = pairSessions(bucketResponses);
      const filterPaired = (r: any) => paired.has(new Date(r.submitted_at).getTime());

      const respondent_count = respondentCount;

      let respondent_total: number;
      if (spec.denominatorMode === "total") {
        respondent_total = totalRespondents;
      } else {
        // Total de respondents elegíveis = sessões distintas originais
        // (assume que cada pessoa elegível ao bucket submeteu ao menos uma vez)
        respondent_total = new Set(
          bucketResponses.map((r) => new Date(r.submitted_at).getTime()),
        ).size;
        if (respondent_total < respondent_count) respondent_total = respondent_count;
      }

      return {
        key: spec.key,
        label: spec.label,
        respondent_count,
        respondent_total,
        questions: spec.questions.map((q) =>
          buildQuestionStats(q, (byQuestion.get(q.id) ?? []).filter((r) => spec.baseFilter(r) && filterPaired(r))),
        ),
      };
    };

    const categories = [
      buildBucket({
        key: "organizacional",
        label: "Organizacional",
        questions: orgQuestions,
        baseFilter: (r) => !r.evaluated_leader,
        denominatorMode: "total",
      }),
      buildBucket({
        key: "lider-area",
        label: "Líder de Área",
        questions: leaderQuestions,
        baseFilter: (r) => !!r.evaluated_leader && r.evaluated_leader !== CID && r.evaluated_leader !== ALEX,
        denominatorMode: "distinct_sessions",
      }),
      buildBucket({
        key: "cid",
        label: CID,
        questions: leaderQuestions,
        baseFilter: (r) => r.evaluated_leader === CID,
        denominatorMode: "total",
      }),
      buildBucket({
        key: "alexandre",
        label: ALEX,
        questions: leaderQuestions,
        baseFilter: (r) => r.evaluated_leader === ALEX,
        denominatorMode: "total",
      }),
    ];

    return json({
      company,
      survey,
      scale_labels: survey.scale_labels,
      categories,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
