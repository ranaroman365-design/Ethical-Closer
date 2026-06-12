import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";
import { forwardTrackingParams } from "@/lib/forward-tracking-params";
import { ArrowRight, Calendar } from "lucide-react";
import { fireMosCroEvent } from "@/lib/mos-cro-events";



interface Props {
  variant?: "default" | "compact" | "sticky";
  source: string;
  /** Optionaler Override des CTA-Labels — kommt aus dem A/B-Slot des Parents. */
  ctaLabel?: string;
}

const track = (label: "primary" | "secondary", source: string) => {
  try {
    trackFunnelEvent("cta_click", {
      funnel: "masterofsales",
      cta: label,
      source,
      ab_slots: getActiveSlotSummary(),
    });
    trackFunnelEvent("mos_form_intent", {
      funnel: "masterofsales",
      source,
      ab_slots: getActiveSlotSummary(),
    });
  } catch {
    /* noop */
  }
};

const MasterOfSalesCtaPair = ({ variant = "default", source, ctaLabel }: Props) => {
  const stickyLabel = ctaLabel ?? "Passt eine Karriere als Closer zu mir?";
  const compactLabel = ctaLabel ?? "Passt eine Karriere als Closer zu mir?";
  const firedRef = useRef(false);

  const stickyHref = useMemo(
    () => forwardTrackingParams("/apply/quiz?aud=men&source=masterofsales-sticky"),
    [],
  );
  const defaultHref = useMemo(
    () => forwardTrackingParams("/apply/quiz?aud=men&source=masterofsales"),
    [],
  );

  const handleClick = (label: "primary" | "secondary", src: string) => {
    if (firedRef.current) return;
    firedRef.current = true;
    track(label, src);
  };

  // Sticky CTA view event — MOS-gated + deduped inside fireMosCroEvent.
  useEffect(() => {
    if (variant !== "sticky") return;
    fireMosCroEvent("MASTER_LP_STICKY_CTA_VIEW", stickyLabel.slice(0, 40));
  }, [variant, stickyLabel]);

  // Sticky CTA reveal — only after user scrolls past first-screen
  // (~60% viewport). Prevents visual collision with the hero CTA.
  const [stickyVisible, setStickyVisible] = useState(false);
  useEffect(() => {
    if (variant !== "sticky") return;
    if (typeof window === "undefined") return;
    const compute = () => {
      const threshold = window.innerHeight * 0.6;
      setStickyVisible(window.scrollY > threshold);
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [variant]);

  if (variant === "sticky") {
    return (
      <div
        aria-hidden={!stickyVisible}
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-accent/30 bg-background/95 backdrop-blur-xl shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.35)] supports-[backdrop-filter]:bg-background/80 transition-all duration-300 ${
          stickyVisible
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-full opacity-0 pointer-events-none"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-10 md:py-4">
          <div className="hidden flex-1 md:block">
            <p className="text-sm font-medium text-foreground">
              Bereit für deinen nächsten Schritt?
            </p>
            <p className="text-xs text-foreground/60">
              First Win in 90 Min · Kein Druck · Refund auf Masterclass
            </p>
          </div>
          <Link
            to={stickyHref}
            onClick={() => handleClick("primary", `${source}:sticky`)}
            aria-label={stickyLabel}
            className="group relative inline-flex min-h-[52px] w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold tracking-wide text-background shadow-[0_8px_24px_-8px_hsl(var(--accent)/0.6)] ring-1 ring-accent/40 transition-all hover:shadow-[0_12px_32px_-8px_hsl(var(--accent)/0.75)] hover:brightness-105 active:scale-[0.98] md:w-auto md:flex-none md:px-8 md:text-base"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-background/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
            />
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="relative">{stickyLabel}</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    );
  }


  const compact = variant === "compact";

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row ${
        compact ? "sm:items-center" : "sm:items-center"
      }`}
    >
      <Link
        to={defaultHref}
        onClick={() => handleClick("primary", source)}
        className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-foreground font-medium tracking-wide text-background transition hover:opacity-90 ${
          compact ? "px-6 py-3 text-sm" : "px-8 py-4 text-sm"
        }`}
      >
        <Calendar className="h-4 w-4" />
        {compactLabel}
      </Link>
    </div>
  );
};


export default MasterOfSalesCtaPair;
