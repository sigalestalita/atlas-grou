import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { AtlasMark } from "@/components/AtlasMark";

/**
 * Entrada da plataforma.
 *
 * Metade esquerda: a marca sobre o navy, com a aurora e as esferas em
 * movimento lento — o mesmo ambiente do Sales Coach. Metade direita: o
 * formulário sobre o fundo claro. No celular vira uma coluna só, com uma
 * faixa curta da marca em cima.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Quem já tem sessão não precisa ver a tela de login de novo.
  useEffect(() => {
    if (user) navigate("/admin", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setIsLoading(true);
    const { error } = await signIn(email.trim(), password);
    setIsLoading(false);
    if (error) {
      toast({
        title: "Não foi possível entrar",
        // A mensagem do Supabase vem em inglês; a mais comum ganha tradução.
        description: /invalid login credentials/i.test(error.message)
          ? "E-mail ou senha incorretos."
          : error.message,
        variant: "destructive",
      });
      return;
    }
    navigate("/admin");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Lado da marca ── */}
      <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden p-8 text-white aurora-bg lg:min-h-screen lg:p-12">
        <div className="dot-grid" aria-hidden="true" />
        <div className="orb absolute -left-16 top-24 h-72 w-72 bg-[hsl(217_84%_63%/0.35)]" aria-hidden="true" />
        <div className="orb orb-2 absolute bottom-10 right-0 h-80 w-80 bg-[hsl(200_80%_55%/0.22)]" aria-hidden="true" />
        <div className="orb orb-3 absolute left-1/3 top-1/2 h-64 w-64 bg-[hsl(230_70%_60%/0.2)]" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <div className="brand-stage">
            <span className="brand-glow" aria-hidden="true" />
            <span className="brand-mark brand-mark-float block">
              <AtlasMark className="h-10 w-10 text-white lg:h-12 lg:w-12" />
              <span className="brand-sweep" aria-hidden="true" />
            </span>
          </div>
          <div className="text-[26px] font-semibold tracking-tight lg:text-[30px]">
            <span className="brand-word brand-word-1">Atlas</span>
          </div>
        </div>

        <div className="relative hidden max-w-md lg:block">
          <h1 className="brand-word brand-word-2 text-[34px] font-semibold leading-[1.15] tracking-tight">
            O clima da sua empresa, medido sem ruído.
          </h1>
          <p className="brand-tagline mt-4 text-[15px] leading-relaxed text-white/70">
            Respostas anônimas de verdade, leitura por área e por liderança, e um
            retrato claro de onde agir primeiro.
          </p>
          <div className="brand-tagline mt-8 flex items-center gap-2 text-[13px] text-white/60">
            <ShieldCheck className="h-4 w-4" />
            Nenhuma resposta fica ligada a um nome.
          </div>
        </div>

        <div className="relative hidden text-[11px] uppercase tracking-[0.18em] text-white/40 lg:block">
          Grou
        </div>
      </div>

      {/* ── Lado do formulário ── */}
      <div className="flex items-center justify-center bg-background px-5 py-10 lg:px-12">
        <div className="auth-card-in w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-[24px] font-semibold tracking-tight text-foreground">Entrar</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Acesse o painel para acompanhar e ler os resultados.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label htmlFor="email" className="text-[13px] font-medium text-foreground">
                E-mail
              </label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-[13px] font-medium text-foreground">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-[14.5px] font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Área restrita a administradores
          </p>
        </div>
      </div>
    </div>
  );
}
