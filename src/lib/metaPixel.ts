/**
 * Meta Pixel nos diagnósticos de captação (link aberto, identificado).
 *
 * Só entra nos diagnósticos listados aqui. Nunca nas pesquisas de clima nem no
 * 360: lá a resposta é anônima e nada deve sair para terceiros. E mesmo no
 * diagnóstico nenhum dado da pessoa (nome, e-mail, telefone, respostas) vai
 * para a Meta: só os eventos PageView e Lead.
 */

/** "empresa/diagnostico" → ID do Pixel. */
const PIXELS: Record<string, string> = {
  "grou/maturidade-lideranca": "570597033128492",
};

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export function pixelDoDiagnostico(companySlug?: string, diagnosticSlug?: string): string | null {
  if (!companySlug || !diagnosticSlug) return null;
  return PIXELS[`${companySlug}/${diagnosticSlug}`] ?? null;
}

const iniciados = new Set<string>();

/** Carrega o script da Meta (uma vez), inicia o Pixel e registra o PageView. */
export function iniciaPixel(pixelId: string): void {
  if (typeof window === "undefined" || iniciados.has(pixelId)) return;
  if (!window.fbq) {
    // Mesmo código-base oficial da Meta, só que carregado aqui em vez do index.html.
    const n: Fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue!.push(args);
    } as Fbq;
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  iniciados.add(pixelId);
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

/** Evento de lead: chamar só depois que o envio foi gravado. */
export function registraLead(): void {
  if (typeof window !== "undefined" && window.fbq) window.fbq("track", "Lead");
}
