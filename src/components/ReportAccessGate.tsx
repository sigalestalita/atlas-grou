import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock } from "lucide-react";
import grouLogo from "@/assets/grou-logo.png";
import introBg from "@/assets/intro-bg.png";

type Props = {
  companyName?: string;
  companyLogoUrl?: string;
  invalid?: boolean;
  onSubmit: (code: string) => void;
};

export function ReportAccessGate({ companyName, companyLogoUrl, invalid, onSubmit }: Props) {
  const [code, setCode] = useState("");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${introBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.5,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(2,6,23,0.4) 0%, rgba(2,6,23,0.8) 55%, rgba(2,6,23,0.97) 100%)",
          }}
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onSubmit(code.trim());
        }}
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
      >
        <div className="mb-8 flex items-center gap-4">
          <img src={grouLogo} alt="Grou" className="h-6 w-auto brightness-0 invert" />
          {companyLogoUrl && (
            <>
              <span className="h-5 w-px bg-white/25" />
              <img src={companyLogoUrl} alt={companyName ?? ""} className="h-8 w-auto object-contain" />
            </>
          )}
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">
          Acesso restrito
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          Relatório {companyName ? `· ${companyName}` : "de Clima Organizacional"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Informe o código de acesso fornecido pela Grou para visualizar os resultados.
        </p>

        <div className="mt-6 space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código de acesso"
              className="h-12 border-white/15 bg-white/10 pl-9 text-white placeholder:text-white/40 focus-visible:ring-white/30"
            />
          </div>
          {invalid && (
            <p className="text-sm text-[#ff9431]">Código inválido. Verifique e tente novamente.</p>
          )}
          <Button type="submit" className="h-12 w-full text-base" disabled={!code.trim()}>
            Acessar relatório
          </Button>
        </div>

        <p className="mt-6 text-xs text-white/40">
          Não tem um código? Solicite à equipe Grou responsável pela pesquisa.
        </p>
      </form>
    </div>
  );
}
