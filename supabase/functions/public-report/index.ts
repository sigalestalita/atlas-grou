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

    const normalize = (t: string) =>
      t.replace(/\s+/g, " ").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const STOPWORDS = new Set(["sem comentarios", "e", "."]);

    const buildQuestionStats = (q: any, rs: any[], useTotal = false) => {
      const respondent_count = countRespondents(rs, useTotal);
      const respondent_count_approx = !useTotal;
      if (q.question_type === "text") {
        const raw = rs.map((r) => (r.text_value ?? "").trim()).filter((t) => t.length > 0);
        // Count duplicates across ALL non-empty submissions (before stopword filtering)
        // so the "possíveis resubmissões" tag reflects the original repeat count.
        const rawSeen = new Set<string>();
        let duplicates_removed = 0;
        for (const t of raw) {
          const key = normalize(t);
          if (rawSeen.has(key)) { duplicates_removed++; continue; }
          rawSeen.add(key);
        }
        // Build the displayed list: unique + non-stopword
        const seen = new Set<string>();
        const comments: string[] = [];
        for (const t of raw) {
          const key = normalize(t);
          if (seen.has(key)) continue;
          seen.add(key);
          if (STOPWORDS.has(key)) continue;
          comments.push(t);
        }
        return { ...q, type: "text", total: comments.length, raw_total: raw.length, duplicates_removed, respondent_count, respondent_count_approx, comments };

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
      return { ...q, type: "scale", total, respondent_count, respondent_count_approx, distribution };
    };

    const buildCategory = (key: string, label: string, qs: any[], filter: (r: any) => boolean, useTotal = false) => {
      const catResponses = (responses ?? []).filter(filter);
      const respondent_count = countRespondents(catResponses, useTotal);
      return {
        key, label, respondent_count,
        respondent_count_approx: !useTotal,
        questions: qs.map((q) => buildQuestionStats(q, (byQuestion.get(q.id) ?? []).filter(filter), useTotal)),
      };
    };

    // ---- Pair organizational submission sessions to respondents ----
    // Goal: keep exactly one session per respondent so per-question distributions
    // sum to the real respondent count (no resubmissions double-counted).
    const orgResponses = (responses ?? []).filter((r: any) => !r.evaluated_leader);
    const orgSessions = Array.from(
      new Set(orgResponses.map((r: any) => new Date(r.submitted_at).getTime())),
    ).sort((a, b) => a - b);

    const WINDOW_BEFORE = 6 * 60 * 60 * 1000; // 6h before responded_at
    const WINDOW_AFTER = 30 * 60 * 1000;       // 30min after
    const usedSessions = new Set<number>();
    const pairedSessions = new Set<number>();

    // Process respondents from latest to earliest so newer responses claim their
    // matching session first (typically the most recent submission).
    const sortedResp = [...respTimes].sort((a, b) => b.t - a.t);
    for (const r of sortedResp) {
      const lo = r.t - WINDOW_BEFORE;
      const hi = r.t + WINDOW_AFTER;
      // Pick the latest unused session inside the window
      let chosen: number | null = null;
      for (let i = orgSessions.length - 1; i >= 0; i--) {
        const s = orgSessions[i];
        if (s > hi) continue;
        if (s < lo) break;
        if (usedSessions.has(s)) continue;
        chosen = s;
        break;
      }
      if (chosen !== null) {
        usedSessions.add(chosen);
        pairedSessions.add(chosen);
      }
    }

    const orgFilter = (r: any) =>
      !r.evaluated_leader && pairedSessions.has(new Date(r.submitted_at).getTime());

    const categories = [
      buildCategory("organizacional", "Organizacional", orgQuestions, orgFilter, true),
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
