import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AtlasMark } from "@/components/AtlasMark";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error("404: rota inexistente:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="text-center">
        <AtlasMark className="mx-auto h-9 w-9 text-primary opacity-40" />
        <p className="mt-6 text-[52px] font-bold leading-none tracking-tight text-muted-foreground/40">404</p>
        <h1 className="mt-3 text-[20px] font-semibold tracking-tight">Página não encontrada</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          O endereço <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">{location.pathname}</code> não
          existe. Se você chegou aqui por um link de pesquisa, confira se ele veio completo.
        </p>
        <Button asChild className="mt-6 rounded-xl">
          <Link to="/login">Ir para o início</Link>
        </Button>
      </div>
    </div>
  );
}
