import { useEffect, useState } from "react";
import grouLogo from "@/assets/grou-logo.png";
import introBg from "@/assets/intro-bg.png";

type Props = {
  companyLogoUrl?: string;
  companyName: string;
  title: string;
  eyebrow?: string;
};

export function IntroSplash({ companyLogoUrl, companyName, title, eyebrow }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !visible) return null;

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => setVisible(false), 500);
  };

  return (
    <div
      onClick={dismiss}
      className={`fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#020617] px-6 transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Background image with slow Ken Burns pan/zoom */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 animate-[introBgPan_22s_ease-in-out_infinite]"
          style={{
            backgroundImage: `url(${introBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* Floating particles */}
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className="absolute block rounded-full"
            style={{
              width: `${4 + (i % 4) * 2}px`,
              height: `${4 + (i % 4) * 2}px`,
              left: `${(i * 73) % 100}%`,
              top: `${(i * 47) % 100}%`,
              background: "#bcd6ff",
              opacity: 0.55,
              boxShadow: "0 0 14px rgba(140,180,255,0.7)",
              animation: `introParticle ${8 + (i % 5) * 2}s ease-in-out ${i * 0.35}s infinite`,
            }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(2,6,23,0.10) 0%, rgba(2,6,23,0.55) 60%, rgba(2,6,23,0.85) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(2,6,23,0.6) 0%, rgba(2,6,23,0.15) 30%, rgba(2,6,23,0.15) 70%, rgba(2,6,23,0.7) 100%)",
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[560px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] backdrop-blur-2xl md:h-[680px] md:w-[1100px]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0.35) 45%, rgba(2,6,23,0) 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, #000 35%, transparent 75%)",
            maskImage: "radial-gradient(ellipse at center, #000 35%, transparent 75%)",
          }}
        />
      </div>

      {/* Center glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 blur-3xl md:h-[680px] md:w-[680px]"
          style={{
            background:
              "radial-gradient(circle, rgba(140,180,255,0.40), rgba(54,88,193,0.20) 45%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative flex w-full max-w-[92vw] items-center justify-center gap-4 md:gap-14">
        <img
          src={grouLogo}
          alt="Grou"
          className="h-10 w-auto translate-y-[3px] opacity-0 brightness-0 invert drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] md:h-24 md:translate-y-[7px] animate-[introLogoLeft_900ms_ease-out_200ms_forwards]"
        />
        <div
          className="h-8 w-px bg-white/40 opacity-0 md:h-20 animate-[introDivider_600ms_ease-out_900ms_forwards]"
          aria-hidden
        />
        {companyLogoUrl && (
          <img
            src={companyLogoUrl}
            alt={companyName}
            className="h-14 w-auto max-w-[45vw] object-contain opacity-0 drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] md:h-28 md:max-w-none animate-[introLogoRight_900ms_ease-out_200ms_forwards]"
          />
        )}
      </div>

      <div className="relative mt-12 max-w-3xl text-center opacity-0 animate-[introFadeUp_700ms_ease-out_1000ms_forwards]">
        {eyebrow && (
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-white/75 drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] md:text-4xl">
          {title}
        </h1>
      </div>

      <p className="absolute bottom-8 text-[11px] uppercase tracking-widest text-white/70 opacity-0 animate-[introFadeUp_500ms_ease-out_2600ms_forwards]">
        toque para continuar
      </p>

      <style>{`
        @keyframes introBgPan {
          0%, 100% { transform: scale(1.08) translate(0, 0); }
          50%      { transform: scale(1.16) translate(-1.5%, -1%); }
        }
        @keyframes introParticle {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.25; }
          50%      { transform: translateY(-22px) translateX(8px); opacity: 0.85; }
        }
        @keyframes introLogoLeft {
          0% { opacity: 0; transform: translateX(-24px) scale(0.96); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes introLogoRight {
          0% { opacity: 0; transform: translateX(24px) scale(0.96); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes introDivider {
          0% { opacity: 0; transform: scaleY(0); }
          100% { opacity: 1; transform: scaleY(1); }
        }
        @keyframes introFadeUp {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
