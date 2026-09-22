import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cartão de indicador com fundo colorido e dado em branco.
 *
 * `navy` e `blue` seguem a cor da marca; os demais tons são fixos e servem
 * para diferenciar métricas lado a lado — teal para pessoas, coral para
 * urgência, amber para atenção, sky para neutro frio, slate para neutro.
 */
export type StatTone = "navy" | "blue" | "teal" | "coral" | "amber" | "sky" | "slate";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
  children?: ReactNode;
}

export function StatCard({ label, value, hint, icon: Icon, tone = "navy", className, children }: StatCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] p-5 text-white shadow-[0_14px_34px_-18px_hsl(var(--brand-navy)/0.45)] transition-transform duration-200 hover:-translate-y-0.5",
        `tone-${tone}`,
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[13.5px] font-medium text-white/85">{label}</div>
        {Icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="relative mt-3 text-[34px] font-bold leading-none tracking-tight tabular-nums">{value}</div>
      {hint && <div className="relative mt-2 text-xs text-white/75">{hint}</div>}
      {children && <div className="relative mt-3">{children}</div>}
    </div>
  );
}

/**
 * Anel de score. Usado no score geral de clima, onde o número sozinho não
 * dizia se 68 era bom ou ruim — o anel dá a leitura de relance.
 */
export function ScoreRing({
  score,
  size = 132,
  color,
  label,
  caption,
}: {
  score: number;
  size?: number;
  color: string;
  label?: string;
  caption?: string;
}) {
  const stroke = Math.max(8, Math.round(size * 0.085));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - filled)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center leading-none">
            <div className="text-[34px] font-bold tabular-nums tracking-tight" style={{ color }}>
              {score}
            </div>
            {label && <div className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</div>}
          </div>
        </div>
      </div>
      {caption && <div className="mt-2 text-center text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}
