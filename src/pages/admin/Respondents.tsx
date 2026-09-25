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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { PageHeader, EmptyState } from "@/components/PageHeader";

interface ContextType { company: { id: string } }

interface Person {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  company_leadership: string | null;
  department_leadership: string | null;
  status: string;
  token: string;
}

function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0")).join("");
}

/** Aceita o cabeçalho em português ou em inglês, com ou sem acento. */
const COLUMNS: Record<keyof Omit<Person, "id" | "status" | "token">, string[]> = {
  name: ["nome", "name", "colaborador"],
  email: ["email", "e-mail", "e mail"],
  department: ["departamento", "department", "area", "área", "setor"],
  company_leadership: ["liderança empresarial", "lideranca empresarial", "company_leadership", "liderança empresa"],
  department_leadership: ["liderança área", "lideranca area", "liderança de área", "liderança departamento", "lideranca departamento", "department_leadership", "gestor"],
};

function normalizeHeader(h: string): string {
  return h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  const normalized = new Map(Object.entries(row).map(([k, v]) => [normalizeHeader(k), v]));
  for (const key of keys) {
    const v = normalized.get(normalizeHeader(key));
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

export default function Respondents() {
  const params = useParams();
  const context = useOutletContext<ContextType | undefined>();
  const { companyId: authCompanyId } = useAuth();
  const companyId = params.companyId || context?.company?.id || authCompanyId;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [survey, setSurvey] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<Person | null>(null);
  const [manual, setManual] = useState({
    name: "", email: "", department: "", company_leadership: "", department_leadership: "",
  });

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: surveys } = await supabase
      .from("surveys").select("*").eq("company_id", companyId)
      .neq("status", "draft").order("created_at", { ascending: false }).limit(1);
    const s = surveys?.[0];
    setSurvey(s ?? null);
    if (!s) { setLoading(false); return; }
    const { data } = await supabase.from("respondents").select("*").eq("survey_id", s.id).order("name");
    // O respondente de ensaio não entra na lista de colaboradores: ele não foi
    // convidado, e aparecer aqui só faria a contagem de cadastrados mentir.
    setPeople(((data || []) as unknown as Person[]).filter((p) => !(p as any).is_test));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !survey) return;
    setImporting(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      const parsed = rows.map((row) => ({
        name: pick(row, COLUMNS.name),
        email: pick(row, COLUMNS.email),
        department: pick(row, COLUMNS.department),
        company_leadership: pick(row, COLUMNS.company_leadership),
        department_leadership: pick(row, COLUMNS.department_leadership),
      })).filter((r) => r.name || r.email);

      if (!parsed.length) {
        toast({
          title: "Nenhum colaborador na planilha",
          description: "Confira se a primeira linha traz os cabeçalhos: Nome, Email, Departamento…",
          variant: "destructive",
        });
        return;
      }

      // Importar duas vezes a mesma planilha criava a lista inteira de novo —
      // e com isso a taxa de resposta despencava sem ninguém entender por quê.
      // O e-mail é a chave; quem não tem e-mail cai no nome.
      const existing = new Set(
        people.map((p) => (p.email || p.name || "").toLowerCase().trim()).filter(Boolean),
      );
      const seenInFile = new Set<string>();
      const fresh: typeof parsed = [];
      let duplicates = 0;

      for (const r of parsed) {
        const key = (r.email || r.name).toLowerCase().trim();
        if (existing.has(key) || seenInFile.has(key)) { duplicates++; continue; }
        seenInFile.add(key);
        fresh.push(r);
      }

      if (!fresh.length) {
        toast({
          title: "Nada novo para importar",
          description: `As ${duplicates} ${duplicates === 1 ? "pessoa já estava" : "pessoas já estavam"} na lista.`,
        });
        return;
      }

      const { error } = await supabase.from("respondents").insert(
        fresh.map((r) => ({
          company_id: companyId!, survey_id: survey.id,
          name: r.name || null, email: r.email || null,
          department: r.department || null,
          company_leadership: r.company_leadership || null,
          department_leadership: r.department_leadership || null,
          token: generateToken(),
        })),
      );
      if (error) {
        toast({ title: "Erro ao importar", description: error.message, variant: "destructive" });
        return;
      }
      toast({
        title: `${fresh.length} ${fresh.length === 1 ? "colaborador importado" : "colaboradores importados"}`,
        description: duplicates > 0
          ? `${duplicates} ${duplicates === 1 ? "já estava" : "já estavam"} na lista e ${duplicates === 1 ? "foi ignorado" : "foram ignorados"}.`
          : undefined,
      });
      load();
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const addManual = async () => {
    if (!survey) return;
    const name = manual.name.trim();
    const email = manual.email.trim();
    if (!name && !email) {
      toast({ title: "Informe ao menos o nome ou o e-mail", variant: "destructive" });
      return;
    }
    const key = (email || name).toLowerCase();
    if (people.some((p) => (p.email || p.name || "").toLowerCase() === key)) {
      toast({ title: "Essa pessoa já está na lista", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("respondents").insert({
      company_id: companyId!, survey_id: survey.id,
      name: name || null, email: email || null,
      department: manual.department.trim() || null,
      company_leadership: manual.company_leadership.trim() || null,
      department_leadership: manual.department_leadership.trim() || null,
      token: generateToken(),
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setManual({ name: "", email: "", department: "", company_leadership: "", department_leadership: "" });
    toast({ title: "Colaborador adicionado" });
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    await supabase.from("respondents").delete().eq("id", toDelete.id);
    setToDelete(null);
    toast({ title: "Colaborador removido" });
    load();
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nome", "Email", "Departamento", "Liderança Empresarial", "Liderança Área"],
      ["João Silva", "joao@empresa.com.br", "Tecnologia", "Carlos Souza", "Ana Lima"],
      ["Maria Costa", "maria@empresa.com.br", "Comercial", "Carlos Souza", "Pedro Reis"],
    ]);
    ws["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    XLSX.writeFile(wb, "modelo-colaboradores.xlsx");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.email, p.department, p.company_leadership, p.department_leadership]
        .some((v) => (v || "").toLowerCase().includes(q)));
  }, [people, search]);

  const responded = people.filter((p) => p.status === "responded").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-28 rounded-[22px]" />
        <Skeleton className="h-72 rounded-[22px]" />
      </div>
    );
  }

  if (!survey) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhuma pesquisa criada"
        description="Monte a pesquisa primeiro — os colaboradores são cadastrados nela."
      />
    );
  }

  const importButton = (
    <label>
      <Button size="sm" className="h-9 rounded-xl" asChild disabled={importing}>
        <span>
          <Upload className="mr-2 h-4 w-4" />
          {importing ? "Importando…" : "Importar planilha"}
        </span>
      </Button>
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} />
    </label>
  );

  return (
    <>
      <PageHeader
        title="Colaboradores"
        description={
          people.length > 0
            ? `${people.length} cadastrados · ${responded} já responderam`
            : "Importe a lista para gerar um link individual para cada pessoa."
        }
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />Modelo
            </Button>
            {importButton}
          </>
        }
      />

      {survey.open_access && (
        <div className="mb-5 rounded-xl border border-border bg-accent/60 p-3.5 text-sm leading-relaxed">
          Esta pesquisa está com <strong>link aberto</strong>. Cadastrar colaboradores aqui é
          opcional — mas é o que dá taxa de resposta e lembrete por pessoa.
        </div>
      )}

      <Card className="mb-5 rounded-[22px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Adicionar uma pessoa</CardTitle>
          <CardDescription>Para incluir alguém que ficou de fora da planilha.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
            <Input className="h-9 rounded-xl" placeholder="Nome" value={manual.name}
              onChange={(e) => setManual((f) => ({ ...f, name: e.target.value }))} />
            <Input className="h-9 rounded-xl" placeholder="E-mail" type="email" value={manual.email}
              onChange={(e) => setManual((f) => ({ ...f, email: e.target.value }))} />
            <Input className="h-9 rounded-xl" placeholder="Área" value={manual.department}
              onChange={(e) => setManual((f) => ({ ...f, department: e.target.value }))} />
            <Input className="h-9 rounded-xl" placeholder="Lid. empresarial" value={manual.company_leadership}
              onChange={(e) => setManual((f) => ({ ...f, company_leadership: e.target.value }))} />
            <Input className="h-9 rounded-xl" placeholder="Lid. de área" value={manual.department_leadership}
              onChange={(e) => setManual((f) => ({ ...f, department_leadership: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addManual()} />
            <Button className="h-9 rounded-xl" onClick={addManual}>
              <Plus className="mr-1.5 h-4 w-4" />Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Ninguém cadastrado ainda"
          description="Baixe o modelo, preencha com a lista da empresa e importe. Cada pessoa ganha um link único."
          action={importButton}
        />
      ) : (
        <Card className="rounded-[22px]">
          <CardContent className="pt-5">
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 rounded-xl pl-9"
                placeholder="Buscar por nome, e-mail ou área…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Área</TableHead>
                    <TableHead className="hidden lg:table-cell">Lid. empresarial</TableHead>
                    <TableHead className="hidden lg:table-cell">Lid. de área</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate font-medium">{p.name || "(sem nome)"}</div>
                        {p.email && <div className="truncate text-[11.5px] text-muted-foreground">{p.email}</div>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-[13px]">{p.department || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-[13px]">{p.company_leadership || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-[13px]">{p.department_leadership || "—"}</TableCell>
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
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                          onClick={() => setToDelete(p)} aria-label={`Remover ${p.name ?? "colaborador"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        Ninguém encontrado com esse termo.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {toDelete?.name || "este colaborador"}?</AlertDialogTitle>
            <AlertDialogDescription>
              O link individual dessa pessoa para de funcionar. Se ela já respondeu, a resposta
              continua nos resultados — ela nunca esteve ligada ao nome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={remove}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
