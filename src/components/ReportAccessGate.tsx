import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Lock } from "lucide-react";

type Props = {
  companyName?: string;
  companyLogoUrl?: string;
  invalid?: boolean;
  onSubmit: (code: string) => void;
};

/**
 * Porta do relatório protegido por código.
 *
 * Traz a marca da empresa cliente, nunca a da Grou — quem abre este link é a
 * empresa, e o relatório é entregue como material dela. A versão anterior
 * estampava o logo da Grou e dizia "código fornecido pela Grou", o que
 * contrariava o white-label do produto.
 */
export function ReportAccessGate({ companyName, companyLogoUrl, invalid, onSubmit }: Props) {
  const [code, setCode] = useState("");

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5 py-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onSubmit(code.trim());
        }}
        className="auth-card-in w-full max-w-sm"
      >
        <div className="mb-7 flex justify-center">
          {companyLogoUrl ? (
            <img src={companyLogoUrl} alt={companyName ?? ""} className="h-12 w-auto max-w-[200px] object-contain" />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
          )}
        </div>

        <h1 className="text-center text-[22px] font-semibold tracking-tight">
          Relatório de clima{companyName ? ` · ${companyName}` : ""}
        </h1>
        <p className="mt-2 text-center text-[14px] leading-relaxed text-muted-foreground">
          Este relatório é restrito. Informe o código de acesso que você recebeu.
        </p>

        <div className="mt-7 space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código de acesso"
              aria-invalid={invalid}
              aria-describedby={invalid ? "code-error" : undefined}
              className="h-12 rounded-xl pl-9 text-[15px]"
            />
          </div>
          {invalid && (
            <p id="code-error" className="text-[13px] text-destructive">
              Código inválido. Confira e tente de novo.
            </p>
          )}
          <Button type="submit" className="h-12 w-full rounded-xl text-[15px] font-semibold" disabled={!code.trim()}>
            Abrir relatório
          </Button>
        </div>

        <p className="mt-7 text-center text-[12px] text-muted-foreground">
          Sem o código? Procure quem conduziu a pesquisa na sua empresa.
        </p>
      </form>
    </div>
  );
}
