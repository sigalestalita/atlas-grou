// Public read-only aggregated survey report (no auth)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CID = "Cid Lauro Vale Junior";
const ALEX = "Alexandre Daguano";

// Sessões consecutivas no MESMO bucket separadas por menos que este intervalo são
// tratadas como resubmissão da mesma pessoa (a 2ª é descartada).
const DUPLICATE_GAP_MS = 12 * 60 * 1000; // 12 min
// Janela para parear uma sessão ao responded_at do respondent.
const WINDOW_BEFORE = 6 * 60 * 60 * 1000; // 6h antes
const WINDOW_AFTER = 30 * 60 * 1000;       // 30min depois

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
      .select("id, section_id, text, question_type, scale_type, sort_order, options")
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

    // Pareia cada sessão a um respondent via responded_at. Cada respondent reivindica
    // no máximo 1 sessão dentro da janela; sessões duplicadas (resubmissão da mesma
    // pessoa) ficam não-pareadas e são tratadas como duplicatas no numerador.
    const pairSessions = (rs: any[]): { paired: Set<number>; respondentCount: number } => {
      const sessions = Array.from(
        new Set(rs.map((r: any) => new Date(r.submitted_at).getTime())),
      ).sort((a, b) => a - b);
      // Fallback: sem respondents cadastrados, tratamos cada sessão como um respondente.
      if (respTimes.length === 0) {
        return { paired: new Set(sessions), respondentCount: sessions.length };
      }
      const used = new Set<number>();
      const covered = new Set<string>();
      const sortedResp = [...respTimes].sort((a, b) => b.t - a.t);
      for (const r of sortedResp) {
        const lo = r.t - WINDOW_BEFORE;
        const hi = r.t + WINDOW_AFTER;
        let best: { s: number; abs: number } | null = null;
        for (const s of sessions) {
          if (s < lo || s > hi || used.has(s)) continue;
          const abs = Math.abs(s - r.t);
          if (!best || abs < best.abs) best = { s, abs };
        }
        if (best) {
          used.add(best.s);
          covered.add(r.id);
        }
      }
      return { paired: used, respondentCount: covered.size };
    };









    // Group by question
    const byQuestion = new Map<string, any[]>();
    (responses ?? []).forEach((r: any) => {
      if (!byQuestion.has(r.question_id)) byQuestion.set(r.question_id, []);
      byQuestion.get(r.question_id)!.push(r);
    });

    const sectionMap = new Map((sections ?? []).map((s: any) => [s.id, s]));

    const sectionOrder = new Map((sections ?? []).map((s: any) => [s.id, s.sort_order ?? 0]));
    const orgQuestions: any[] = [];
    const leaderQuestions: any[] = [];
    (questions ?? []).forEach((q: any) => {
      const sec = sectionMap.get(q.section_id);
      if (!sec) return;
      const item = { ...q, section_title: sec.title, section_type: sec.section_type, _section_order: sec.sort_order ?? 0 };
      if (sec.section_type === "leadership") leaderQuestions.push(item);
      else orgQuestions.push(item);
    });
    const byOrder = (a: any, b: any) =>
      (a._section_order - b._section_order) || ((a.sort_order ?? 0) - (b.sort_order ?? 0));
    orgQuestions.sort(byOrder);
    leaderQuestions.sort(byOrder);


    const normalize = (t: string) =>
      t.replace(/\s+/g, " ").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const STOPWORDS = new Set(["sem comentarios", "e", "."]);

    const buildQuestionStats = (q: any, rs: any[], groupByLeader = false, keepAllComments = false) => {
      // Respondent count por pergunta = sessões distintas (já filtradas para pareadas no bucket)
      const respondent_count = new Set(rs.map((r) => new Date(r.submitted_at).toISOString())).size;
      const isTextQuestion = q.question_type === "text" || q.question_type === "open_text";
      const isChoiceQuestion = q.question_type === "choice";
      if (isTextQuestion) {
        const rawItems = rs
          .map((r) => ({ text: (r.text_value ?? "").trim(), leader: (r.evaluated_leader ?? "").trim() }))
          .filter((it) => it.text.length > 0);
        let comments: string[];
        let itemsKept: { text: string; leader: string }[];
        let duplicates_removed = 0;
        if (keepAllComments) {
          comments = rawItems.map((it) => it.text);
          itemsKept = rawItems;
        } else {
          const rawSeen = new Set<string>();
          for (const it of rawItems) {
            const key = normalize(it.text);
            if (rawSeen.has(key)) { duplicates_removed++; continue; }
            rawSeen.add(key);
          }
          const seen = new Set<string>();
          comments = [];
          itemsKept = [];
          for (const it of rawItems) {
            const key = normalize(it.text);
            if (seen.has(key)) continue;
            seen.add(key);
            if (STOPWORDS.has(key)) continue;
            comments.push(it.text);
            itemsKept.push(it);
          }
        }
        const base: any = { ...q, type: "text", total: comments.length, raw_total: rawItems.length, duplicates_removed, respondent_count, comments };
        if (groupByLeader) {
          const byLeader = new Map<string, string[]>();
          for (const it of itemsKept) {
            const leader = it.leader || "Sem identificação";
            if (!byLeader.has(leader)) byLeader.set(leader, []);
            byLeader.get(leader)!.push(it.text);
          }
          base.comments_by_leader = Array.from(byLeader.entries())
            .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
            .map(([leader, comments]) => ({ leader, comments }));
        }
        return base;
      }

      if (isChoiceQuestion) {
        const parseChoice = (raw: unknown) => {
          const source = typeof raw === "string" ? raw : "";
          const [choice] = source.split("|||");
          return choice.trim();
        };

        const rawOptions = Array.isArray(q.options) ? q.options.map((o: unknown) => String(o).trim()).filter(Boolean) : [];
        const discoveredOptions = Array.from(new Set(rs.map((r) => parseChoice(r.text_value)).filter(Boolean)));
        const options = Array.from(new Set([...rawOptions, ...discoveredOptions]));

        const computeChoiceStats = (items: any[]) => {
          const counts = new Map<string, number>();
          options.forEach((option) => counts.set(option, 0));
          let total = 0;

          items.forEach((r) => {
            const choice = parseChoice(r.text_value);
            if (!choice) return;
            counts.set(choice, (counts.get(choice) ?? 0) + 1);
            total++;
          });

          const distribution = options.map((option, idx) => ({
            value: idx + 1,
            label: option,
            count: counts.get(option) ?? 0,
            percent: total > 0 ? ((counts.get(option) ?? 0) / total) * 100 : 0,
          }));

          return { distribution, total };
        };

        const overall = computeChoiceStats(rs);
        const base: any = {
          ...q,
          type: "choice",
          total: overall.total,
          respondent_count,
          distribution: overall.distribution,
          options,
        };

        if (groupByLeader) {
          const byLeader = new Map<string, any[]>();
          for (const r of rs) {
            const leader = (r.evaluated_leader ?? "").trim() || "Sem identificação";
            if (!byLeader.has(leader)) byLeader.set(leader, []);
            byLeader.get(leader)!.push(r);
          }
          base.stats_by_leader = Array.from(byLeader.entries())
            .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
            .map(([leader, items]) => {
              const s = computeChoiceStats(items);
              const respondents = new Set(items.map((r) => new Date(r.submitted_at).toISOString())).size;
              return { leader, total: s.total, respondent_count: respondents, distribution: s.distribution };
            });
        }

        return base;
      }

      const isEnps = q.scale_type === "enps";
      const scaleMin = isEnps ? 0 : survey.scale_min;
      const scaleMax = isEnps ? 10 : survey.scale_max;
      const computeStats = (items: any[]) => {
        const dist: Record<number, number> = {};
        for (let v = scaleMin; v <= scaleMax; v++) dist[v] = 0;
        let total = 0;
        items.forEach((r) => {
          if (r.value != null && dist[r.value] !== undefined) { dist[r.value]++; total++; }
        });
        const distribution = Object.entries(dist).map(([value, count]) => ({
          value: Number(value), count, percent: total > 0 ? (count / total) * 100 : 0,
        }));
        let enps: any = undefined;
        if (isEnps) {
          let promoters = 0, passives = 0, detractors = 0;
          items.forEach((r) => {
            if (r.value == null) return;
            if (r.value >= 9) promoters++;
            else if (r.value >= 7) passives++;
            else detractors++;
          });
          const pctP = total > 0 ? (promoters / total) * 100 : 0;
          const pctD = total > 0 ? (detractors / total) * 100 : 0;
          enps = {
            promoters, passives, detractors,
            promoters_pct: pctP,
            passives_pct: total > 0 ? (passives / total) * 100 : 0,
            detractors_pct: pctD,
            score: Math.round(pctP - pctD),
          };
        }
        return { distribution, total, enps };
      };

      const overall = computeStats(rs);
      const base: any = {
        ...q, type: "scale", scale_min: scaleMin, scale_max: scaleMax,
        total: overall.total, respondent_count, distribution: overall.distribution,
      };
      if (overall.enps) base.enps = overall.enps;

      if (groupByLeader) {
        const byLeader = new Map<string, any[]>();
        for (const r of rs) {
          const leader = (r.evaluated_leader ?? "").trim() || "Sem identificação";
          if (!byLeader.has(leader)) byLeader.set(leader, []);
          byLeader.get(leader)!.push(r);
        }
        base.stats_by_leader = Array.from(byLeader.entries())
          .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
          .map(([leader, items]) => {
            const s = computeStats(items);
            const respondents = new Set(items.map((r) => new Date(r.submitted_at).toISOString())).size;
            return { leader, total: s.total, respondent_count: respondents, distribution: s.distribution, enps: s.enps };
          });
      }
      return base;
    };

    type BucketSpec = {
      key: string;
      label: string;
      questions: any[];
      baseFilter: (r: any) => boolean;
      // Filtro usado SOMENTE para contagem de respondentes (ex.: ignora
      // perguntas de texto importadas da outra aba, que duplicariam sessões).
      countFilter?: (r: any) => boolean;
      denominatorMode: "total" | "distinct_sessions";
      groupCommentsByLeader?: boolean;
      keepAllComments?: boolean;
    };



    // Overrides manuais por survey: corrigem contagens quando o pareamento
    // heurístico não consegue distinguir resubmissões anônimas próximas no tempo.
    const COUNT_OVERRIDES: Record<string, Record<string, { count?: number; total?: number }>> = {
      "1aef6816-fa1b-49bf-b974-fc996e9eff63": {
        cid: { count: 19, total: 23 },
        alexandre: { count: 21, total: 23 },
        "lider-area": { count: 13, total: 15 },
      },
      "b0000000-0000-0000-0000-000000000001": {
        organizacional: { total: 9 },
        lider: { total: 9 },
      },
    };

    const overrides = COUNT_OVERRIDES[survey.id] ?? {};

    // Quando há override de contagem, removemos as sessões mais próximas no tempo
    // (prováveis resubmissões da mesma pessoa) até atingir o número-alvo.
    const dedupSessionsToTarget = (sessions: number[], target: number): Set<number> => {
      const kept = [...sessions].sort((a, b) => a - b);
      while (kept.length > target) {
        let minGap = Infinity;
        let dropIdx = -1;
        for (let i = 1; i < kept.length; i++) {
          const gap = kept[i] - kept[i - 1];
          if (gap < minGap) { minGap = gap; dropIdx = i; }
        }
        if (dropIdx < 0) break;
        kept.splice(dropIdx, 1);
      }
      return new Set(kept);
    };

    const buildBucket = (spec: BucketSpec) => {
      const bucketResponses = (responses ?? []).filter(spec.baseFilter);
      const countResponses = spec.countFilter
        ? bucketResponses.filter(spec.countFilter)
        : bucketResponses;
      const { paired, respondentCount } = pairSessions(bucketResponses);
      let activeSessions: Set<number> = paired;
      const filterActive = (r: any) => activeSessions.has(new Date(r.submitted_at).getTime());

      let respondent_count = spec.countFilter
        ? pairSessions(countResponses).respondentCount
        : respondentCount;

      let respondent_total: number;
      if (spec.denominatorMode === "total") {
        respondent_total = totalRespondents;
      } else {
        respondent_total = new Set(
          countResponses.map((r) => new Date(r.submitted_at).getTime()),
        ).size;
        if (respondent_total < respondent_count) respondent_total = respondent_count;
      }

      const ov = overrides[spec.key];
      if (ov?.count != null) {
        respondent_count = ov.count;
        const allSessions = Array.from(
          new Set(bucketResponses.map((r) => new Date(r.submitted_at).getTime())),
        );
        if (allSessions.length > ov.count) {
          activeSessions = dedupSessionsToTarget(allSessions, ov.count);
        }
      }
      if (ov?.total != null) respondent_total = ov.total;

      return {
        key: spec.key,
        label: spec.label,
        respondent_count,
        respondent_total,
        questions: spec.questions.map((q) =>
          buildQuestionStats(q, (byQuestion.get(q.id) ?? []).filter((r) => spec.baseFilter(r) && filterActive(r)), spec.groupCommentsByLeader, spec.keepAllComments),
        ),

      };
    };



    const isTectaris = survey.id === "1aef6816-fa1b-49bf-b974-fc996e9eff63";

    const categories = isTectaris
      ? [
          buildBucket({
            key: "organizacional",
            label: "Organizacional",
            questions: orgQuestions,
            baseFilter: (r) => !r.evaluated_leader,
            denominatorMode: "total",
            keepAllComments: true,
          }),
          buildBucket({
            key: "lider-area",
            label: "Líder de Área",
            questions: leaderQuestions,
            baseFilter: (r) => !!r.evaluated_leader && r.evaluated_leader !== CID && r.evaluated_leader !== ALEX,
            denominatorMode: "distinct_sessions",
            groupCommentsByLeader: true,
          }),
          buildBucket({
            key: "cid",
            label: CID,
            questions: leaderQuestions,
            baseFilter: (r) => r.evaluated_leader === CID,
            denominatorMode: "total",
            groupCommentsByLeader: true,
          }),
          buildBucket({
            key: "alexandre",
            label: ALEX,
            questions: leaderQuestions,
            baseFilter: (r) => r.evaluated_leader === ALEX,
            denominatorMode: "total",
            groupCommentsByLeader: true,
          }),
        ]
      : (() => {
          // Comentários (perguntas de texto) devem aparecer em ambas as abas
          const isTextQuestion = (q: any) => q.question_type === "text" || q.question_type === "open_text";
          const orgTextQuestions = orgQuestions.filter(isTextQuestion);
          const leaderTextQuestions = leaderQuestions.filter(isTextQuestion);
          return [
            buildBucket({
              key: "organizacional",
              label: "Organização",
              questions: [...orgQuestions, ...leaderTextQuestions],
              baseFilter: (r) => !r.evaluated_leader || (leaderTextQuestions.some((q) => q.id === r.question_id)),
              denominatorMode: "total",
              keepAllComments: true,
            }),
            buildBucket({
              key: "lider",
              label: "Líder",
              questions: [...leaderQuestions, ...orgTextQuestions],
              baseFilter: (r) => !!r.evaluated_leader || (orgTextQuestions.some((q) => q.id === r.question_id)),
              denominatorMode: "distinct_sessions",
              groupCommentsByLeader: true,
            }),
          ].filter((b) => b.questions.length > 0);
        })();

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
