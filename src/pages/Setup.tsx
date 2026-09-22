import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { AtlasMark } from "@/components/AtlasMark";

/**
 * Criação do primeiro super admin.
 *
 * Quem decide se isso é permitido é a função `create-admin`, que conta os
 * administradores com a chave de serviço e recusa quando já existe algum.
 *
 * A versão anterior fazia essa contagem aqui, pelo cliente anônimo — que a RLS
 * impede de ler `user_roles`. O resultado vinha sempre zero, então a tela
 * afirmava "nenhum administrador cadastrado" mesmo numa instalação cheia
 * deles, e só depois de preencher tudo é que a pessoa descobria que não podia.
 * Agora a tela não finge saber: explica que só funciona na primeira vez e
 * deixa a função responder.
 */
export default function Setup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => navigate("/login"), 2200);
    return () => window.clearTimeout(t);
  }, [done, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 8) {
      toast({ title: "A senha precisa ter ao menos 8 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-admin", {
      body: { email: email.trim(), password, role: "super_admin" },
    });
    setLoading(false);

    const message = error?.message ?? data?.error;
    if (message) {
      toast({
        title: "Não foi possível criar",
        description: /token|autoriza/i.test(message)
          ? "Já existe administrador nesta instalação. Novos admins são criados por quem já tem acesso, em Administradores."
          : message,
        variant: "destructive",
      });
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="text-center duration-500 animate-in fade-in">
          <CheckCircle2 className="mx-auto h-14 w-14 text-[hsl(var(--success))]" />
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight">Administrador criado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Levando você para a tela de entrada…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <form onSubmit={submit} className="auth-card-in w-full max-w-sm">
        <div className="mb-7 text-center">
          <AtlasMark className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight">Primeiro acesso</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Cria o administrador inicial da plataforma. Só funciona enquanto não existir nenhum —
            depois disso, novos administradores são criados de dentro do painel.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="text-[13px] font-medium">E-mail</label>
            <Input
              id="email" type="email" autoComplete="email" autoFocus
              className="h-11 rounded-xl"
              placeholder="voce@empresa.com.br"
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-[13px] font-medium">Senha</label>
            <Input
              id="password" type="password" autoComplete="new-password"
              className="h-11 rounded-xl"
              placeholder="ao menos 8 caracteres"
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            />
          </div>
          <Button type="submit" className="h-11 w-full rounded-xl font-semibold" disabled={loading}>
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando…</>
              : <>Criar administrador<ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
        </div>

        <p className="mt-7 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Esta conta enxerga todas as empresas da plataforma
        </p>
      </form>
    </div>
  );
}
