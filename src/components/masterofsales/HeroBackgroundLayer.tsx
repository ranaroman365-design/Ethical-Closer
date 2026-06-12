/**
 * HeroBackgroundLayer — full-bleed Hero background driven by the
 * canonical `mos_hero_human_proof` Phase 9.3 image slot.
 *
 * STRICTLY ADDITIVE / presentation only. Reuses the existing Thompson
 * Sampling bucket (`useAbSlot` → `MOS_HERO_HUMAN_PROOF`) and fires the
 * existing session-once `lp_image_view` funnel event — no new event
 * type, no schema change, no CRM/Quiz/Booking/Calendly/Auth/Routing
 * touch. `force_slot` + `ab_slot_weights` continue to drive variant
 * selection unchanged.
 *
 * Each A/B variant of `mos_hero_human_proof` only swaps the background
 * image; the hero composition (headline/CTA/overlay) stays identical.
 *
 * Hero guarantee: if the resolved variant has no `src` (e.g. control
 * or a not-yet-uploaded variant), the layer falls back to the best
 * available human-proof image (`D_coaching`) so the hero is never
 * blank. The variant id sent to tracking is unaffected.
 */
import { useEffect, useRef } from "react";
import { useAbSlot } from "@/hooks/useAbSlot";
import { CRO_ENABLED } from "@/lib/cro/config";
import { trackFunnelEvent } from "@/lib/track-event";
import {
  MOS_HERO_HUMAN_PROOF,
  resolveHumanProofImageCopy,
} from "@/lib/mos-human-proof-slots";

const SLOT = "mos_hero_human_proof";
const firedViews = new Set<string>();

export interface HeroBackgroundLayerProps {
  /** Final fallback if no variant copy has a usable src. */
  fallbackSrc?: string;
  /** Cinematic gradient strength. */
  overlay?: "editorial" | "soft";
}

export default function HeroBackgroundLayer({
  fallbackSrc,
  overlay = "editorial",
}: HeroBackgroundLayerProps) {
  const assignment = useAbSlot(MOS_HERO_HUMAN_PROOF);
  const variantId = assignment.variant;
  const ref = useRef<HTMLDivElement | null>(null);

  const copy = resolveHumanProofImageCopy(SLOT, variantId);
  const src = copy?.src || fallbackSrc || "";
  const alt = copy?.alt || "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!CRO_ENABLED) return;
    const el = ref.current;
    if (!el) return;
    const key = `mos:lp_image_view:${SLOT}:${variantId}`;
    if (firedViews.has(key)) return;
    try {
      if (sessionStorage.getItem(key) === "1") return;
    } catch {
      /* ignore */
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.4) continue;
          if (firedViews.has(key)) return;
          firedViews.add(key);
          try {
            sessionStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
          try {
            trackFunnelEvent("lp_image_view", {
              funnel: "masterofsales",
              slot: SLOT,
              variant: variantId,
            });
          } catch {
            /* never throw */
          }
          io.disconnect();
        }
      },
      { threshold: [0.4] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [variantId]);

  if (!src) return null;

  return (
    <div
      ref={ref}
      data-mos-hero-background={variantId}
      data-mos-image-slot={SLOT}
      data-mos-image-variant={variantId}
      className="absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover object-center"
        width={1920}
        height={1080}
        loading="eager"
        // @ts-expect-error fetchpriority is valid HTML attr, untyped in React
        fetchpriority="high"
        decoding="async"
      />
      {overlay === "editorial" ? (
        <>
          {/* Editorial left-weighted gradient for headline legibility. */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-background/15 md:from-background/90 md:via-background/55 md:to-background/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/10" />
        </>
      ) : (
        <div className="absolute inset-0 bg-background/55" />
      )}
    </div>
  );
}
