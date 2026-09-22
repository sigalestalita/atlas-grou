import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página: título, uma linha de contexto e as ações à direita.
 *
 * Antes cada tela resolvia isso do seu jeito — umas com `<h1>`, outras com
 * `<h2>`, com espaçamentos diferentes. Passar por aqui mantém a mesma altura
 * de topo em todas elas.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground md:text-[26px]">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/**
 * Estado vazio. Diz o que aconteceu e qual é o próximo passo — uma tela vazia
 * sem saída é o lugar onde mais se perde gente na primeira configuração.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[22px] border border-dashed border-border bg-card/60 px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Aviso de recorte escondido pelo anonimato.
 *
 * Aparece sempre que um agrupamento foi omitido por ter menos gente que o
 * mínimo. Sem esse aviso, a área simplesmente sumia do gráfico e passava a
 * impressão de que ninguém dali respondeu.
 */
export function PrivacyNote({ suppressed, minGroup }: { suppressed: number; minGroup: number }) {
  if (suppressed <= 0) return null;
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {suppressed === 1 ? "1 grupo ficou oculto" : `${suppressed} grupos ficaram ocultos`} por ter
      {suppressed === 1 ? "" : "em"} menos de {minGroup} pessoas. Eles responderam — os resultados
      só não aparecem separados, para que ninguém possa ser identificado.
    </p>
  );
}
