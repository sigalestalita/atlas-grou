import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Activity, BellRing, CalendarClock, CheckCircle2, Clock, Copy, Hourglass,
  Radio, Search, Send, Users,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { submissionKey, type ResponseRow } from "@/lib/climate";
import { NEW_COLUMNS, selectCompat, writeCompat } from "@/lib/dbCompat";

interface ContextType { company: { id: string; slug: string } }

interface Respondent {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  company_leadership: string | null;
  department_leadership: string | null;
  status: string;
  responded_at: string | null;
  started_at: string | null;
  last_reminder_at: string | null;
  token: string;
}

type PersonState = "responded" | "started" | "pending";

/**
 * Acompanhamento da pesquisa em campo.
 *
 * Reúne o que antes estavam em duas telas quase iguais (Progresso e
 * Acompanhamento). A antiga adivinhava quem tinha respondido a partir do
 * tamanho do departamento — "se o time todo tem 4 pessoas e chegaram 4 envios,
 * então todos responderam" — o que inflava a taxa e apontava gente que não
 * tinha respondido. Aqui o status vem de `respondents`, que a própria pesquisa
 * grava ao terminar.
 */
export default function Tracking() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<any>(null);
  const [companySlug, setCompanySlug] = useState("");
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [people, setPeople] = useState<Respondent[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | PersonState>("all");
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: company } = await supabase.from("companies").select("slug").eq("id", companyId).single();
    if (company) setCompanySlug(company.slug);

    const { data: surveys } = await supabase
      .from("surveys").select("*").eq("company_id", companyId)
      .neq("status", "draft").order("created_at", { ascending: false }).limit(1);
    const s = surveys?.[0];
    setSurvey(s ?? null);
    if (!s) { setLoading(false); return; }

    const [resp, ppl] = await Promise.all([
      selectCompat<ResponseRow>(
        ["question_id", "value", "department", "company_leadership",
         "department_leadership", "evaluated_leader", "submitted_at"],
        [...NEW_COLUMNS.responses],
        (cols) => supabase.from("survey_responses").select(cols)
          .eq("survey_id", s.id).order("submitted_at", { ascending: false }),
      ),
      supabase.from("respondents").select("*").eq("survey_id", s.id).order("name"),
    ]);
    setResponses((resp.data || []) as ResponseRow[]);
    setPeople((ppl.data || []) as unknown as Respondent[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Ao vivo: novo envio aparece sem recarregar a página.
  useEffect(() => {
    if (!survey?.id) return;
    const ch = supabase
      .channel(`tracking-${survey.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "survey_responses", filter: `survey_id=eq.${survey.id}` },
        (payload) => {
          setResponses((prev) => [payload.new as ResponseRow, ...prev]);
          setPulse(true);
          window.setTimeout(() => setPulse(false), 2500);
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "respondents", filter: `survey_id=eq.${survey.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [survey?.id, load]);

  /** Envios distintos — a linha de resposta não é a unidade, o envio é. */
  const submissions = useMemo(() => {
    const seen = new Map<string, ResponseRow>();
    for (const r of responses) if (!seen.has(submissionKey(r))) seen.set(submissionKey(r), r);
    return Array.from(seen.values())
      .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  }, [responses]);

  const stateOf = (r: Respondent): PersonState =>
    r.status === "responded" ? "responded" : r.started_at ? "started" : "pending";

  const counts = useMemo(() => {
    let responded = 0, started = 0, pending = 0;
    for (const p of people) {
      const st = stateOf(p);
      if (st === "responded") responded++;
      else if (st === "started") started++;
      else pending++;
    }
    return { responded, started, pending, total: people.length };
  }, [people]);

  const openAccess = !!survey?.open_access;
  const rate = counts.total ? Math.round((counts.responded / counts.total) * 100) : 0;

  const byDepartment = useMemo(() => {
    const m = new Map<string, { total: number; responded: number }>();
    for (const p of people) {
      const key = p.department || "Sem área definida";
      const cur = m.get(key) || { total: 0, responded: 0 };
      cur.total++;
      if (stateOf(p) === "responded") cur.responded++;
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, pct: v.total ? Math.round((v.responded / v.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct);
  }, [people]);

  const byLeader = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of submissions) {
      if (s.evaluated_leader) m.set(s.evaluated_leader, (m.get(s.evaluated_leader) || 0) + 1);
    }
    const max = Math.max(1, ...m.values());
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count, pct: (count / max) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [submissions]);

  const timeline = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of submissions) {
      const day = s.submitted_at.slice(0, 10);
      m.set(day, (m.get(day) || 0) + 1);
    }
    return Array.from(m.entries()).map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [submissions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (filter !== "all" && stateOf(p) !== filter) return false;
      if (!q) return true;
      return [p.name, p.email, p.department, p.department_leadership, p.company_leadership]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [people, filter, search]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const linkFor = (token: string) => `${baseUrl}/survey/${companySlug}/${token}`;

  /**
   * Lembrete: monta a lista de quem falta com nome, e-mail e link, e copia.
   *
   * A plataforma não dispara e-mail, então o lembrete sempre saía na mão e sem
   * registro de quando foi. Copiar já pronto e marcar a data no banco resolve
   * as duas coisas, sem prometer um envio que não existe.
   */
  const copyPending = async () => {
    const pending = people.filter((p) => stateOf(p) !== "responded");
    if (!pending.length) {
      toast({ title: "Ninguém pendente", description: "Todo mundo já respondeu." });
      return;
    }
    const lines = [
      "Nome\tE-mail\tÁrea\tSituação\tLink",
      ...pending.map((p) => [
        p.name || "(sem nome)",
        p.email || "",
        p.department || "",
        stateOf(p) === "started" ? "Começou e não terminou" : "Não abriu",
        linkFor(p.token),
      ].join("\t")),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(lines);
    } catch {
      toast({ title: "Não foi possível copiar", description: "Seu navegador bloqueou o acesso à área de transferência.", variant: "destructive" });
      return;
    }

    const { error } = await writeCompat(
      { last_reminder_at: new Date().toISOString() }, ["last_reminder_at"],
      (body) => supabase.from("respondents").update(body as never).in("id", pending.map((p) => p.id)),
    );

    toast({
      title: `${pending.length} ${pending.length === 1 ? "pendente copiado" : "pendentes copiados"}`,
      description: error
        ? "A lista está na área de transferência. A data do lembrete não pôde ser registrada."
        : "Cole numa planilha ou no e-mail. A data do lembrete ficou registrada.",
    });
    load();
  };

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(linkFor(token));
    toast({ title: "Link copiado" });
  };

  // ── Telas ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-[22px]" />)}
        </div>
        <Skeleton className="h-72 rounded-[22px]" />
      </div>
    );
  }

  if (!survey) {
    return (
      <EmptyState
        icon={Activity}
        title="Nenhuma pesquisa em campo"
        description="Ative uma pesquisa para acompanhar a chegada das respostas aqui."
      />
    );
  }

  const lastAt = submissions[0]?.submitted_at;
  const deadline = (survey as any).closes_at as string | null;
  const daysLeft = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <>
      <PageHeader
        title="Acompanhamento"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`inline-flex items-center gap-1.5 ${pulse ? "text-[hsl(var(--success))]" : ""}`}>
              <Radio className={`h-3.5 w-3.5 ${pulse ? "animate-pulse" : ""}`} />
              Ao vivo
            </span>
            {lastAt && (
              <>
                <span>·</span>
                <span>último envio {formatRelative(lastAt)}</span>
              </>
            )}
            {daysLeft !== null && (
              <>
                <span>·</span>
                <span className={daysLeft <= 2 ? "font-medium text-[hsl(var(--climate-low))]" : ""}>
                  {daysLeft > 0
                    ? `${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} até o prazo`
                    : "prazo encerrado"}
                </span>
              </>
            )}
          </span>
        }
        actions={
          !openAccess && counts.pending + counts.started > 0 ? (
            <Button variant="outline" className="h-9 rounded-xl" onClick={copyPending}>
              <BellRing className="mr-2 h-4 w-4" />
              Copiar lista de pendentes
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {openAccess ? (
          <StatCard tone="navy" icon={Send} label="Envios recebidos" value={submissions.length}
            hint="Pesquisa por link aberto, sem lista de convidados" />
        ) : (
          <StatCard tone="navy" icon={Users} label="Participação" value={`${rate}%`}
            hint={`${counts.responded} de ${counts.total} convidados`}>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white/90 transition-all duration-700" style={{ width: `${rate}%` }} />
            </div>
          </StatCard>
        )}
        <StatCard tone="teal" icon={CheckCircle2} label="Concluíram" value={openAccess ? submissions.length : counts.responded} />
        <StatCard tone="amber" icon={Hourglass} label="Começaram e pararam" value={openAccess ? "—" : counts.started}
          hint={openAccess ? "Não há como acompanhar no link aberto" : "Abriram a pesquisa e não enviaram"} />
        <StatCard tone="slate" icon={Clock} label="Não abriram" value={openAccess ? "—" : counts.pending} />
      </div>

      {timeline.length > 1 && (
        <Card className="mb-6 rounded-[22px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Chegada das respostas</CardTitle>
            <CardDescription>A curva costuma cair depois do segundo dia — é quando o lembrete rende mais.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="fillTracking" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
                  labelFormatter={(d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
                  formatter={(v: number) => [v, "envios"]} />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#fillTracking)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        {!openAccess && byDepartment.length > 0 && (
          <Card className="rounded-[22px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Participação por área</CardTitle>
              <CardDescription>Da que menos respondeu para a que mais respondeu.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {byDepartment.map((d) => (
                <div key={d.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-medium">{d.name}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      {d.responded}/{d.total} · {d.pct}%
                    </span>
                  </div>
                  <Progress value={d.pct} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {byLeader.length > 0 && (
          <Card className="rounded-[22px]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Avaliações recebidas por liderança</CardTitle>
              <CardDescription>Quantos envios cada liderança já recebeu.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {byLeader.map((l) => (
                <div key={l.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-medium">{l.name}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{l.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${l.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {!openAccess && people.length > 0 && (
        <Card className="rounded-[22px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quem foi convidado</CardTitle>
            <CardDescription>
              Mostra se a pessoa respondeu — nunca <em>o que</em> ela respondeu. As respostas
              não ficam ligadas a nome em lugar nenhum.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou área…"
                  className="h-9 rounded-xl pl-9"
                />
              </div>
            </div>

            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="mb-3 h-auto flex-wrap gap-1 rounded-xl bg-secondary p-1">
                <TabsTrigger value="all" className="rounded-lg">Todos ({counts.total})</TabsTrigger>
                <TabsTrigger value="responded" className="rounded-lg">Responderam ({counts.responded})</TabsTrigger>
                <TabsTrigger value="started" className="rounded-lg">Pararam no meio ({counts.started})</TabsTrigger>
                <TabsTrigger value="pending" className="rounded-lg">Não abriram ({counts.pending})</TabsTrigger>
              </TabsList>

              <TabsContent value={filter} className="mt-0">
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Nome</TableHead>
                        <TableHead className="hidden md:table-cell">Área</TableHead>
                        <TableHead className="hidden lg:table-cell">Liderança</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="hidden xl:table-cell">Lembrete</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((p) => {
                        const st = stateOf(p);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="max-w-[220px]">
                              <div className="truncate font-medium">{p.name || "(sem nome)"}</div>
                              {p.email && <div className="truncate text-[11.5px] text-muted-foreground">{p.email}</div>}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-[13px]">{p.department || "—"}</TableCell>
                            <TableCell className="hidden lg:table-cell text-[13px]">{p.department_leadership || p.company_leadership || "—"}</TableCell>
                            <TableCell><StateBadge state={st} at={p.responded_at} /></TableCell>
                            <TableCell className="hidden xl:table-cell text-[12px] text-muted-foreground">
                              {p.last_reminder_at ? formatRelative(p.last_reminder_at) : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                                onClick={() => copyLink(p.token)}
                                title="Copiar link individual"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            Ninguém com esses filtros.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {openAccess && (
        <Card className="rounded-[22px]">
          <CardContent className="flex items-start gap-3 py-5">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Esta pesquisa usa link aberto. Sem lista de convidados não há como saber quem
              falta responder — o acompanhamento mostra só o volume que chegou. Para ter taxa
              de resposta e lembrete por pessoa, cadastre os colaboradores e use links individuais.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function StateBadge({ state, at }: { state: PersonState; at: string | null }) {
  if (state === "responded") {
    return (
      <Badge className="rounded-full border-0 bg-[hsl(var(--success))] text-[11px] font-semibold text-white">
        Respondeu{at ? ` · ${formatRelative(at)}` : ""}
      </Badge>
    );
  }
  if (state === "started") {
    return (
      <Badge className="rounded-full border-0 bg-[hsl(var(--warning))] text-[11px] font-semibold text-white">
        Parou no meio
      </Badge>
    );
  }
  return <Badge variant="secondary" className="rounded-full text-[11px]">Não abriu</Badge>;
}

/** "há 3 dias", "há 2 h" — mais legível que a data crua numa lista de acompanhamento. */
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
