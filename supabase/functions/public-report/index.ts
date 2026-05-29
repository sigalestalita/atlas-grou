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

    const { data: responses } = await supabase
      .from("survey_responses")
      .select("question_id, value, text_value, evaluated_leader")
      .eq("survey_id", survey.id);

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

    const buildQuestionStats = (q: any, rs: any[]) => {
      if (q.question_type === "text") {
        const comments = rs
          .map((r) => (r.text_value ?? "").trim())
          .filter((t) => t.length > 0);
        return { ...q, type: "text", total: comments.length, comments };
      }
      const dist: Record<number, number> = {};
      for (let v = survey.scale_min; v <= survey.scale_max; v++) dist[v] = 0;
      let total = 0;
      rs.forEach((r) => {
        if (r.value != null && dist[r.value] !== undefined) {
          dist[r.value]++;
          total++;
        }
      });
      const distribution = Object.entries(dist).map(([value, count]) => ({
        value: Number(value),
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
      }));
      return { ...q, type: "scale", total, distribution };
    };

    const categories = [
      {
        key: "organizacional",
        label: "Organizacional",
        questions: orgQuestions.map((q) => {
          const rs = (byQuestion.get(q.id) ?? []).filter((r) => !r.evaluated_leader);
          return buildQuestionStats(q, rs);
        }),
      },
      {
        key: "lider-area",
        label: "Líder de Área",
        questions: leaderQuestions.map((q) => {
          const rs = (byQuestion.get(q.id) ?? []).filter(
            (r) => r.evaluated_leader && r.evaluated_leader !== CID && r.evaluated_leader !== ALEX,
          );
          return buildQuestionStats(q, rs);
        }),
      },
      {
        key: "cid",
        label: "Cid Lauro Vale Junior",
        questions: leaderQuestions.map((q) => {
          const rs = (byQuestion.get(q.id) ?? []).filter((r) => r.evaluated_leader === CID);
          return buildQuestionStats(q, rs);
        }),
      },
      {
        key: "alexandre",
        label: "Alexandre Daguano",
        questions: leaderQuestions.map((q) => {
          const rs = (byQuestion.get(q.id) ?? []).filter((r) => r.evaluated_leader === ALEX);
          return buildQuestionStats(q, rs);
        }),
      },
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
