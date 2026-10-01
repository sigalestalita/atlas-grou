import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, Copy, Download, ExternalLink, Gauge, Globe, Pause, Play, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LEVELS, levelByKey, summarize, type Answers, type DiagnosticQuestion } from "@/lib/diagnostic";

/**
 * Diagnósticos da empresa: o link aberto, quem respondeu e o relatório de cada um.
 *
 * Ao contrário do resto do painel, aqui as respostas têm nome — o diagnóstico é
 * identificado por desenho, e a pessoa concorda com isso antes de responder.
 * Por isso esta tela não reaproveita nada das telas da pesquisa de clima, que
 * existem justamente para não mostrar quem respondeu.
 */

const db = supabase as unknown as SupabaseClient;

interface ContextType { company: { id: string; slug: string } }

interface Diagnostic {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "active" | "closed";
  questions: DiagnosticQuestion[];
  scale_min: number;
  scale_max: number;
  cta_label: string | null;
  cta_url: string | null;
}

interface Submission {
  id: string;
  diagnostic_id: string;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  answers: Answers;
  score: number;
  level: string;
  report_token: string;
  created_at: string;
}

const STATUS_LABEL: Record<Diagnostic["status"], string> = { draft: "Rascunho", active: "No ar", closed: "Encerrado" };

const phoneView = (d: string) =>
  d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  : d;

export default function DiagnosticsPage() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [cta, setCta] = useState({ label: "", url: "" });

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: company } = await supabase.from("companies").select("slug").eq("id", companyId).single();
    if (company) setSlug(company.slug);
    const { data: ds } = await db.from("diagnostics").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    const list = (ds || []) as Diagnostic[];
    setDiagnostics(list);
    setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const selected = diagnostics.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setCta({ label: selected.cta_label ?? "", url: selected.cta_url ?? "" });
    db.from("diagnostic_submissions").select("*").eq("diagnostic_id", selected.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setSubs((data || []) as Submission[]));
  }, [selected]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const openLink = selected ? `${baseUrl}/diagnostico/${slug}/${selected.slug}` : "";
  const reportLink = (token: string) => `${baseUrl}/diagnostico/resultado/${token}`;

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      toast({ title: "O navegador bloqueou a cópia", variant: "destructive" });
    }
  };

  const patch = async (body: Partial<Diagnostic>, message: string) => {
    if (!selected) return;
    const { error } = await db.from("diagnostics").update({ ...body, updated_at: new Date().toISOString() }).eq("id", selected.id);
    if (error) { toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }); return; }
    setDiagnostics((ds) => ds.map((d) => (d.id === selected.id ? { ...d, ...body } : d)));
    toast({ title: message });
  };

  const stats = useMemo(() => {
    if (!subs.length) return null;
    const avg = Math.round(subs.reduce((a, s) => a + s.score, 0) / subs.length);
    const byLevel = LEVELS.map((l) => ({ ...l, n: subs.filter((s) => s.level === l.key).length }));
    return { avg, byLevel };
  }, [subs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) => [s.name, s.email, s.company_name, s.phone].some((v) => (v || "").toLowerCase().includes(q)));
  }, [subs, search]);

  const exportSheet = () => {
    if (!selected) return;
    const rows = subs.map((s) => {
      const sum = summarize(selected.questions, s.answers, selected.scale_min, selected.scale_max);
      const row: Record<string, string | number> = {
        Data: new Date(s.created_at).toLocaleString("pt-BR"),
        Nome: s.name, "E-mail": s.email, Telefone: phoneView(s.phone), Empresa: s.company_name,
        "Índice (0-100)": s.score, Nível: levelByKey(s.level).label,
      };
      for (const d of sum.dimensions) row[d.label] = d.score;
      selected.questions.forEach((q, i) => { row[`${i + 1}. ${q.text}`] = s.answers[q.key]; });
      row.Relatório = reportLink(s.report_token);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Respostas");
    XLSX.writeFile(wb, `diagnostico-${selected.slug}.xlsx`);
    toast({ title: "Planilha gerada" });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-40 rounded-[22px]" />
        <Skeleton className="h-72 rounded-[22px]" />
      </div>
    );
  }

  if (!selected) {
    return (
      <>
        <PageHeader title="Diagnóstico" description="Questionários curtos por link aberto, com relatório individual para quem responde." />
        <EmptyState icon={Gauge} title="Nenhum diagnóstico nesta empresa" description="Os diagnósticos são criados pela Grou para empresas que conduzem captação por link aberto." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Diagnóstico"
        description="Link aberto, identificado: quem responde informa nome e contato e recebe o próprio relatório na hora."
        actions={subs.length > 0 ? (
          <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={exportSheet}>
            <Download className="mr-2 h-4 w-4" />Exportar planilha
          </Button>
        ) : undefined}
      />

      {diagnostics.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {diagnostics.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`rounded-xl border px-3.5 py-2 text-[13px] font-medium ${d.id === selectedId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent"}`}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}

      <Card className="mb-6 overflow-hidden rounded-[22px] border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />{selected.title}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={selected.status === "active" ? "default" : "secondary"}>{STATUS_LABEL[selected.status]}</Badge>
              {selected.status === "active" ? (
                <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={() => patch({ status: "closed" }, "Diagnóstico encerrado")}>
                  <Pause className="mr-1.5 h-3.5 w-3.5" />Encerrar
                </Button>
              ) : (
                <Button size="sm" className="h-8 rounded-xl" onClick={() => patch({ status: "active" }, "Diagnóstico no ar")}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />Colocar no ar
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            {selected.questions.length} afirmações, de {selected.scale_min} a {selected.scale_max}. Antes das perguntas a
            pessoa informa nome, e-mail, telefone e empresa e concorda com o uso dos dados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-[13px]">{openLink}</code>
            <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => copy(openLink, "open")}>
              {copied === "open" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}Copiar
            </Button>
            <Button variant="outline" size="sm" className="h-10 rounded-xl" asChild>
              <a href={openLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir</a>
            </Button>
          </div>

          <div>
            <p className="text-[13px] font-medium">Chamada no fim do relatório</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Um botão para o próximo passo — WhatsApp, agenda ou página. Sem endereço, o relatório não mostra o botão.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Input className="h-10 w-full rounded-xl sm:w-56" placeholder="Texto do botão" value={cta.label}
                onChange={(e) => setCta((c) => ({ ...c, label: e.target.value }))} />
              <Input className="h-10 min-w-0 flex-1 rounded-xl" placeholder="https://wa.me/55…" value={cta.url}
                onChange={(e) => setCta((c) => ({ ...c, url: e.target.value }))} />
              <Button variant="outline" className="h-10 rounded-xl"
                onClick={() => patch({ cta_label: cta.label.trim() || null, cta_url: cta.url.trim() || null }, "Chamada salva")}>
                Salvar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <div className="mb-6 grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,240px)_1fr]">
          <StatCard label="Respostas" value={subs.length} tone="navy" />
          <StatCard label="Índice médio" value={stats.avg} hint="de 100" tone="blue" />
          <div className="rounded-[22px] border border-border bg-card p-5">
            <p className="text-[13px] font-medium text-muted-foreground">Por nível de maturidade</p>
            <div className="mt-3 space-y-1.5">
              {stats.byLevel.map((l) => (
                <div key={l.key} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-28 shrink-0">{l.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${(l.n / subs.length) * 100}%`, background: l.color }} />
                  </div>
                  <span className="w-6 text-right tabular-nums">{l.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Card className="rounded-[22px]">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Quem respondeu</CardTitle>
              <CardDescription>Cada resposta completa gera um relatório individual, no link ao lado do nome.</CardDescription>
            </div>
            {subs.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 rounded-xl pl-9" placeholder="Buscar nome, e-mail, empresa" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ninguém respondeu ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Índice</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const lvl = levelByKey(s.level);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap text-[12.5px] text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.company_name}</TableCell>
                        <TableCell className="text-[12.5px]">
                          <div>{s.email}</div>
                          <div className="text-muted-foreground">{phoneView(s.phone)}</div>
                        </TableCell>
                        <TableCell className="text-right text-[15px] font-bold tabular-nums" style={{ color: lvl.color }}>{s.score}</TableCell>
                        <TableCell>
                          <span className="rounded-full px-2.5 py-1 text-[11.5px] font-medium" style={{ background: `color-mix(in srgb, ${lvl.color} 14%, transparent)`, color: lvl.color }}>
                            {lvl.label}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => copy(reportLink(s.report_token), s.id)}>
                            {copied === s.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg" asChild>
                            <a href={reportLink(s.report_token)} target="_blank" rel="noopener noreferrer">
                              Relatório<ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
