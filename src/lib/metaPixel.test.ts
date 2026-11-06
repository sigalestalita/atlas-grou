import { describe, expect, it } from "vitest";
import { iniciaPixel, pixelDoDiagnostico, registraLead } from "./metaPixel";

describe("Meta Pixel do diagnóstico", () => {
  it("só existe para os diagnósticos listados", () => {
    expect(pixelDoDiagnostico("grou", "maturidade-lideranca")).toBe("570597033128492");
    expect(pixelDoDiagnostico("grou", "outro")).toBeNull();
    expect(pixelDoDiagnostico(undefined, "maturidade-lideranca")).toBeNull();
  });

  it("inicia uma vez, registra PageView e depois o Lead, sem dados da pessoa", () => {
    iniciaPixel("570597033128492");
    iniciaPixel("570597033128492");
    registraLead();
    const fila = (window.fbq?.queue ?? []) as unknown[][];
    expect(fila).toEqual([["init", "570597033128492"], ["track", "PageView"], ["track", "Lead"]]);
    expect(document.querySelectorAll('script[src*="connect.facebook.net"]').length).toBe(1);
  });
});
