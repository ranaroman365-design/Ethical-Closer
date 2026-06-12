/**
 * HeroMicroProofStrip — additiv direkt über dem Hero-CTA.
 * Vermittelt in einer Zeile: 90s, 5 Fragen, kein Sales-Call, keine Verpflichtung.
 * Feuert MASTER_MICRO_PROOF_VIEW 1x/Session bei 50% Sichtbarkeit.
 */
import { useEffect, useRef } from "react";
import { Clock, ListChecks, ShieldCheck, HandshakeIcon } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_micro_proof_view_v1";

interface Props {
  variant: "A" | "B";
}

const HeroMicroProofStrip = ({ variant }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          try {
            if (sessionStorage.getItem(SS_KEY) !== "1") {
              sessionStorage.setItem(SS_KEY, "1");
              trackFunnelEvent("MASTER_MICRO_PROOF_VIEW", {
                funnel: "masterofsales",
                variant,
              });
            }
          } catch { /* noop */ }
          obs.disconnect();
          break;
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [variant]);

  if (variant === "B") {
    return (
      <div
        ref={ref}
        data-mos-section="micro_proof_strip"
        className="mb-4 inline-flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-full border border-accent/30 bg-accent/[0.06] px-4 py-2 text-[11px] text-foreground/80 sm:text-xs"
      >
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          Persönlicher Richtungs-Check
        </span>
        <span className="text-foreground/30">·</span>
        <span>Kein Verkaufsgespräch</span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-mos-section="micro_proof_strip"
      className="mb-4 flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-foreground/75 sm:text-xs"
    >
      <span className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-accent" />
        90 Sekunden
      </span>
      <span className="text-foreground/25">·</span>
      <span className="flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5 text-accent" />
        5 Fragen
      </span>
      <span className="text-foreground/25">·</span>
      <span className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-accent" />
        Kein Sales-Call
      </span>
      <span className="text-foreground/25">·</span>
      <span className="flex items-center gap-1.5">
        <HandshakeIcon className="h-3.5 w-3.5 text-accent" />
        Keine Verpflichtung
      </span>
    </div>
  );
};

export default HeroMicroProofStrip;
