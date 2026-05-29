// Public read-only aggregated survey report (no auth)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CID = "Cid Lauro Vale Junior";
const ALEX = "Alexandre Daguano";

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

    // Paginated fetch — Supabase caps single queries at 1000 rows by default
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

    // Fetch respondents (tracking) — used to count distinct respondents per category/question
    const { data: respList } = await supabase
      .from("respondents")
      .select("id, responded_at")
      .eq("survey_id", survey.id)
      .eq("status", "responded");

    // Build helper to count distinct respondents covered by a set of responses,
    // matching each response's submitted_at to the nearest respondent.responded_at
    // within a window (6h before, 30min after). Falls back to distinct submitted_at
    // when no respondents tracking is available.
    const respTimes = (respList ?? [])
      .filter((r: any) => r.responded_at)
      .map((r: any) => ({ id: r.id, t: new Date(r.responded_at).getTime() }));

    // Total respondents who finished the survey (used for organizational category)
    const totalRespondents = respList?.length ?? 0;

    // For leader-specific buckets, count distinct submission sessions
    // (each leader-block is submitted with a single submitted_at).
    const countRespondents = (rs: any[], useTotal = false): number => {
      if (useTotal) return totalRespondents;
      if (rs.length === 0) return 0;
      const set = new Set(rs.map((r) => new Date(r.submitted_at).toISOString()));
      return set.size;
    };

    // Group by question
    const byQuestion = new Map<string, any[]>();
    (responses ?? []).forEach((r: any) => {
      if (!byQuestion.has(r.question_id)) byQuestion.set(r.question_id, []);
      byQuestion.get(r.question_id)!.push(r);
    });

    const sectionMap = new Map((sections ?? []).map((s: any) => [s.id, s]));

    // Build categories
    const orgQuestions: any[] = [];
    const leaderQuestions: any[] = []; // template per leadership question

    (questions ?? []).forEach((q: any) => {
      const sec = sectionMap.get(q.section_id);
      if (!sec) return;
      const item = { ...q, section_title: sec.title, section_type: sec.section_type };
      if (sec.section_type === "leadership") leaderQuestions.push(item);
      else orgQuestions.push(item);
    });

    const normalize = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

    const buildQuestionStats = (q: any, rs: any[], useTotal = false) => {
      const respondent_count = countRespondents(rs, useTotal);
      if (q.question_type === "text") {
        const raw = rs.map((r) => (r.text_value ?? "").trim()).filter((t) => t.length > 0);
        const seen = new Set<string>();
        const comments: string[] = [];
        for (const t of raw) {
          const key = normalize(t);
          if (seen.has(key)) continue;
          seen.add(key);
          comments.push(t);
        }
        return { ...q, type: "text", total: comments.length, raw_total: raw.length, respondent_count, comments };
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

    const buildCategory = (key: string, label: string, qs: any[], filter: (r: any) => boolean, useTotal = false) => {
      const catResponses = (responses ?? []).filter(filter);
      const respondent_count = countRespondents(catResponses, useTotal);
      return {
        key, label, respondent_count,
        questions: qs.map((q) => buildQuestionStats(q, (byQuestion.get(q.id) ?? []).filter(filter), useTotal)),
      };
    };

    const categories = [
      buildCategory("organizacional", "Organizacional", orgQuestions, (r) => !r.evaluated_leader, true),
      buildCategory("lider-area", "Líder de Área", leaderQuestions,
        (r) => !!r.evaluated_leader && r.evaluated_leader !== CID && r.evaluated_leader !== ALEX),
      buildCategory("cid", "Cid Lauro Vale Junior", leaderQuestions, (r) => r.evaluated_leader === CID),
      buildCategory("alexandre", "Alexandre Daguano", leaderQuestions, (r) => r.evaluated_leader === ALEX),
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
