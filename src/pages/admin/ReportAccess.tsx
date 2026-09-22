import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Check, Copy, KeyRound, RefreshCw, Trash2, Unlock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

interface Company { id: string; name: string; slug: string }
interface AccessCode {
  id: string;
  code: string;
  label: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

/** Sem I, O, 0 e 1 — são os caracteres que a pessoa erra ao digitar do papel. */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const out = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export default function ReportAccess() {
  const { company } = useOutletContext<{ company: Company }>();
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState(generateCode);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AccessCode | null>(null);

  const reportUrl = `${window.location.origin}/relatorio/${company.slug}`;

  const load = async () => {
    const { data } = await supabase
      .from("report_access_codes").select("*")
      .eq("company_id", company.id).order("created_at", { ascending: false });
    setCodes((data ?? []) as AccessCode[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [company.id]);

  const create = async () => {
    const value = code.trim().toUpperCase();
    if (!value) return;
    if (codes.some((c) => c.code === value)) {
      toast.error("Esse código já existe.");
      return;
    }
    const { error } = await supabase.from("report_access_codes").insert({
      company_id: company.id, code: value, label: label.trim() || null,
    });
    if (error) { toast.error(`Não foi possível criar: ${error.message}`); return; }
    toast.success("Código criado");
    setLabel("");
    setCode(generateCode());
    load();
  };

  const toggle = async (c: AccessCode) => {
    const { error } = await supabase.from("report_access_codes")
      .update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("report_access_codes").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Código removido");
    load();
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    } catch {
      toast.error("O navegador bloqueou a cópia.");
    }
  };

  const active = codes.filter((c) => c.is_active).length;

  return (
    <>
      <PageHeader
        title="Acesso ao relatório"
        description="Controla quem consegue abrir o relatório público desta empresa."
      />

      <Card className="mb-5 rounded-[22px]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {active > 0 ? <KeyRound className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4 text-[hsl(var(--warning))]" />}
            {active > 0 ? "Relatório protegido" : "Relatório aberto"}
          </CardTitle>
          <CardDescription>
            {active > 0
              ? `Só abre com um dos ${active} ${active === 1 ? "código ativo" : "códigos ativos"}.`
              : "Sem código ativo, qualquer pessoa com o endereço vê os resultados. Crie um código abaixo para exigir senha."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <code className="min-w-0 flex-1 break-all text-[12.5px]">{reportUrl}</code>
            <Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => copy(reportUrl, "url")}>
              {copied === "url" ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
              {copied === "url" ? "Copiado" : "Copiar link"}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium">Para quem é (opcional)</label>
              <Input
                className="h-9 rounded-xl" value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Diretoria, RH"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium">Código</label>
              <div className="flex gap-2">
                <Input
                  className="h-9 rounded-xl tracking-wider"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                />
                <Button
                  variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl"
                  onClick={() => setCode(generateCode())} title="Gerar outro"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-end">
              <Button className="h-9 rounded-xl" onClick={create}>Criar código</Button>
            </div>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            Criar um código por destinatário — um para a diretoria, outro para o RH — permite
            revogar o acesso de um sem derrubar o do outro.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-[22px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Códigos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : codes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum código criado — o relatório está aberto a quem tiver o link.
            </p>
          ) : (
            <div className="space-y-2">
              {codes.map((c) => (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3.5 ${
                    c.is_active ? "bg-card" : "bg-muted/40 opacity-70"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold tracking-wider tabular-nums">{c.code}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {c.label ? `${c.label} · ` : ""}
                      {c.last_used_at
                        ? `usado ${new Date(c.last_used_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
                        : "nunca usado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Button
                      size="sm" variant="outline" className="h-8 rounded-lg"
                      onClick={() => copy(`Relatório de clima\n${reportUrl}\nCódigo: ${c.code}`, c.id)}
                    >
                      {copied === c.id ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                      Link + código
                    </Button>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} aria-label="Ativo" />
                      <Badge variant={c.is_active ? "default" : "secondary"} className="rounded-full text-[10.5px]">
                        {c.is_active ? "ativo" : "inativo"}
                      </Badge>
                    </div>
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 rounded-lg"
                      onClick={() => setToDelete(c)} aria-label="Remover código"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o código {toDelete?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem já estava usando esse código perde o acesso ao relatório.
              {codes.filter((c) => c.is_active && c.id !== toDelete?.id).length === 0 &&
                " Era o último código ativo: sem ele, o relatório volta a abrir para qualquer pessoa com o link."}
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
