import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, Copy, Download, ExternalLink, Globe, Link2, QrCode, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { PageHeader, EmptyState } from "@/components/PageHeader";

interface ContextType { company: { id: string; slug: string } }

interface Person {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  status: string;
  token: string;
}

export default function LinksPage() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [slug, setSlug] = useState("");
  const [openSurvey, setOpenSurvey] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: company } = await supabase.from("companies").select("slug").eq("id", companyId).single();
    if (company) setSlug(company.slug);

    const { data: surveys } = await supabase
      .from("surveys").select("*").eq("company_id", companyId)
      .neq("status", "draft").order("created_at", { ascending: false });
    if (!surveys?.length) { setLoading(false); return; }

    setOpenSurvey(surveys.find((s: any) => s.open_access) ?? null);
    const { data } = await supabase.from("respondents")
      .select("id, name, email, department, status, token")
      .eq("survey_id", surveys[0].id).order("name");
    setPeople((data || []) as Person[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  /**
   * A base do link vinha fixa como "https://atlas.grougp.com.br", então em
   * pré-visualização ou em domínio próprio a plataforma copiava um endereço
   * que apontava para outro lugar. Agora sai do próprio navegador.
   */
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const linkFor = (token: string) => `${baseUrl}/survey/${slug}/${token}`;
  const openLink = `${baseUrl}/survey/${slug}`;

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      toast({ title: "O navegador bloqueou a cópia", variant: "destructive" });
    }
  };

  const exportLinks = () => {
    const ws = XLSX.utils.json_to_sheet(people.map((p) => ({
      Nome: p.name || "",
      Email: p.email || "",
      Departamento: p.department || "",
      Link: linkFor(p.token),
      Situação: p.status === "responded" ? "Respondeu" : "Pendente",
    })));
    ws["!cols"] = [{ wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 68 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Links");
    XLSX.writeFile(wb, `links-pesquisa-${slug}.xlsx`);
    toast({ title: "Planilha gerada" });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.email, p.department].some((v) => (v || "").toLowerCase().includes(q)));
  }, [people, search]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-40 rounded-[22px]" />
        <Skeleton className="h-72 rounded-[22px]" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Links"
        description="É por aqui que a pesquisa chega nas pessoas."
        actions={
          people.length > 0 ? (
            <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={exportLinks}>
              <Download className="mr-2 h-4 w-4" />Exportar planilha
            </Button>
          ) : undefined
        }
      />

      {openSurvey && (
        <Card className="mb-6 overflow-hidden rounded-[22px] border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />Link aberto
            </CardTitle>
            <CardDescription>
              Um endereço só para toda a empresa. Serve para mural, grupo de mensagens ou
              e-mail em massa — cada pessoa responde de forma anônima, sem cadastro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-[13px]">
                {openLink}
              </code>
              <Button size="sm" className="h-10 rounded-xl" onClick={() => copy(openLink, "open")}>
                {copied === "open" ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied === "open" ? "Copiado" : "Copiar"}
              </Button>
              <Button variant="outline" size="sm" className="h-10 rounded-xl" asChild>
                <a href={openLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />Abrir
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-10 rounded-xl" asChild>
                <a
                  href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=${encodeURIComponent(openLink)}`}
                  target="_blank" rel="noopener noreferrer"
                  title="Abrir o QR code para imprimir ou projetar"
                >
                  <QrCode className="mr-2 h-4 w-4" />QR code
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {people.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhum link individual"
          description={
            openSurvey
              ? "Esta pesquisa usa link aberto, então links individuais são opcionais. Cadastre colaboradores se quiser acompanhar quem já respondeu."
              : "Cadastre os colaboradores para gerar um link único por pessoa."
          }
        />
      ) : (
        <Card className="rounded-[22px]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />Links individuais
            </CardTitle>
            <CardDescription>
              {people.length} links · cada um aceita uma resposta só. O link diz quem foi
              convidado, nunca o que a pessoa respondeu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 rounded-xl pl-9"
                placeholder="Buscar pessoa…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden lg:table-cell">Link</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate font-medium">{p.name || "(sem nome)"}</div>
                        {p.email && <div className="truncate text-[11.5px] text-muted-foreground">{p.email}</div>}
                      </TableCell>
                      <TableCell className="hidden max-w-[360px] lg:table-cell">
                        <code className="block truncate rounded-lg bg-muted px-2 py-1 text-[11.5px]">
                          {linkFor(p.token)}
                        </code>
                      </TableCell>
                      <TableCell>
                        {p.status === "responded" ? (
                          <Badge className="rounded-full border-0 bg-[hsl(var(--success))] text-[11px] font-semibold text-white">
                            Respondeu
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="rounded-full text-[11px]">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                            onClick={() => copy(linkFor(p.token), p.id)}
                            aria-label={`Copiar link de ${p.name ?? "colaborador"}`}
                          >
                            {copied === p.id
                              ? <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                              : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" asChild>
                            <a href={linkFor(p.token)} target="_blank" rel="noopener noreferrer" aria-label="Abrir link">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                        Ninguém encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
