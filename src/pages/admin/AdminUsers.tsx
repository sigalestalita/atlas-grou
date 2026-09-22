import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, Plus, RefreshCw, Trash2, UserCog } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";

interface Role {
  id: string;
  user_id: string;
  role: "super_admin" | "company_admin";
  company_id: string | null;
  email: string | null;
  created_at: string;
}

/** Senha inicial forte, para não sair ninguém com "123456". */
function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function AdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Role | null>(null);
  const [form, setForm] = useState({
    email: "", password: suggestPassword(), role: "company_admin", company_id: "",
  });

  const load = async () => {
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from("user_roles").select("*").order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").order("name"),
    ]);
    setRoles((r || []) as unknown as Role[]);
    setCompanies(c || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const companyName = useMemo(
    () => new Map(companies.map((c) => [c.id, c.name])),
    [companies],
  );

  const createAdmin = async () => {
    const email = form.email.trim();
    if (!email) { toast({ title: "Informe o e-mail", variant: "destructive" }); return; }
    if (form.password.length < 8) {
      toast({ title: "A senha precisa ter ao menos 8 caracteres", variant: "destructive" });
      return;
    }
    if (form.role === "company_admin" && !form.company_id) {
      toast({ title: "Escolha a empresa", variant: "destructive" });
      return;
    }

    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-admin", {
      body: {
        email, password: form.password, role: form.role,
        company_id: form.role === "company_admin" ? form.company_id : undefined,
      },
    });
    setCreating(false);

    const message = error?.message ?? data?.error;
    if (message) {
      toast({ title: "Não foi possível criar", description: message, variant: "destructive" });
      return;
    }

    // A senha aparece uma vez só — é ela que precisa ser passada à pessoa.
    try { await navigator.clipboard.writeText(`${email}\n${form.password}`); } catch { /* ok */ }
    toast({
      title: "Administrador criado",
      description: `E-mail e senha de ${email} foram copiados. Passe para a pessoa — a senha não é exibida de novo.`,
    });
    setOpen(false);
    setForm({ email: "", password: suggestPassword(), role: "company_admin", company_id: "" });
    load();
  };

  const removeRole = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Permissão removida" });
    load();
  };

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 rounded-xl"><Plus className="mr-2 h-4 w-4" />Novo administrador</Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Novo administrador</DialogTitle>
          <DialogDescription>
            Cria a conta e já dá a permissão. A senha inicial é copiada ao criar — é você quem
            entrega para a pessoa.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium">E-mail</label>
            <Input
              type="email" className="h-10 rounded-xl"
              placeholder="pessoa@empresa.com.br"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium">Senha inicial</label>
            <div className="flex gap-2">
              <Input
                className="h-10 rounded-xl"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              <Button
                variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl"
                onClick={() => setForm((f) => ({ ...f, password: suggestPassword() }))}
                title="Gerar outra"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium">Tipo de acesso</label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company_admin">Admin de empresa — vê só uma empresa</SelectItem>
                <SelectItem value="super_admin">Super admin — vê todas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.role === "company_admin" && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium">Empresa</label>
              <Select value={form.company_id} onValueChange={(v) => setForm((f) => ({ ...f, company_id: v }))}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Escolher…" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button className="h-10 w-full rounded-xl" onClick={createAdmin} disabled={creating}>
            {creating
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando…</>
              : "Criar administrador"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-64 rounded-[22px]" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Administradores"
        description="Quem tem acesso ao painel e até onde enxerga."
        actions={dialog}
      />

      {roles.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Nenhum administrador além de você"
          description="Crie acessos para quem vai acompanhar as pesquisas."
          action={dialog}
        />
      ) : (
        <Card className="rounded-[22px]">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Acesso</TableHead>
                    <TableHead className="hidden md:table-cell">Empresa</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((r) => {
                    const isMe = r.user_id === user?.id;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {/* Sem o e-mail (permissões criadas antes do gatilho), cai no id. */}
                              {r.email ?? `usuário ${r.user_id.slice(0, 8)}`}
                            </span>
                            {isMe && <Badge variant="outline" className="rounded-full text-[10px]">você</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={r.role === "super_admin" ? "default" : "secondary"}
                            className="rounded-full text-[11px]"
                          >
                            {r.role === "super_admin" ? "Super admin" : "Admin de empresa"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-[13px]">
                          {r.company_id ? companyName.get(r.company_id) ?? "—" : "todas"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                            onClick={() => setToDelete(r)}
                            // Tirar a própria permissão de super admin trancaria a pessoa
                            // para fora do painel na hora.
                            disabled={isMe}
                            title={isMe ? "Você não pode remover o seu próprio acesso" : "Remover acesso"}
                            aria-label="Remover acesso"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o acesso de {toDelete?.email ?? "este administrador"}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa perde o acesso ao painel na próxima vez que carregar a página. A conta
              continua existindo — só a permissão é removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={removeRole}
            >
              Remover acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
