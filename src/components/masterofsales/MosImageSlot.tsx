/**
 * Phase 9.2 — MosImageSlot
 *
 * Renders the active image variant for a Phase 9.2 image slot, or `null` on
 * `control`. Sticky per browser session via `useAbSlot` (Thompson Sampling
 * picks the bucket; server weights from `ab_slot_weights` feed in). Fires a
 * session-once `lp_image_view` funnel event on intersection — observational
 * only, no new event types added to the tracking schema.
 *
 * No business logic. No CRM/booking/quiz/Calendly touch.
 */
import { useEffect, useRef } from "react";
import { useAbSlot } from "@/hooks/useAbSlot";
import { CRO_ENABLED } from "@/lib/cro/config";
import { trackFunnelEvent } from "@/lib/track-event";
import {
  MOS_IMAGE_SLOT_COPY,
  MOS_IMAGE_SLOTS,
} from "@/lib/mos-image-slots";
import {
  MOS_HUMAN_PROOF_COPY,
  MOS_HUMAN_PROOF_SLOTS,
  resolveHumanProofImageCopy,
} from "@/lib/mos-human-proof-slots";

const ASPECT_CLASS: Record<string, string> = {
  wide: "aspect-[16/9]",
  portrait: "aspect-[4/5]",
  square: "aspect-square",
};

export interface MosImageSlotProps {
  slot: string;
  /** Optional label rendered above the frame. */
  label?: string;
  /** Priority loading for above-the-fold (default false → lazy). */
  priority?: boolean;
  className?: string;
  /** Hide the figcaption below the image (used for hero-card mounts). */
  hideCaption?: boolean;
  /** Drop the default rounded border/bg on the inner frame — used when
   *  the parent already wraps the image in a styled card. */
  unstyled?: boolean;
}

const firedViews = new Set<string>();

export default function MosImageSlot({
  slot,
  label,
  priority = false,
  className,
  hideCaption = false,
  unstyled = false,
}: MosImageSlotProps) {
  const def =
    MOS_IMAGE_SLOTS.find((s) => s.slot === slot) ??
    MOS_HUMAN_PROOF_SLOTS.find((s) => s.slot === slot);
  const assignment = useAbSlot(
    def ?? { slot, variants: [{ id: "control", baseWeight: 1 }] },
  );
  const ref = useRef<HTMLElement | null>(null);

  const variantId = assignment.variant;
  let copy =
    MOS_IMAGE_SLOT_COPY[slot]?.[variantId] ??
    MOS_HUMAN_PROOF_COPY[slot]?.[variantId] ??
    null;

  const isHumanProofSlot = !!MOS_HUMAN_PROOF_COPY[slot];
  // Phase 9.4 guarantee — every human-proof section must render a real,
  // slot-owned image even when the sticky bucket is control/missing. Variant
  // tracking stays intact; only the rendered src falls back within the same
  // slot, preserving zero cross-slot reuse.
  if (isHumanProofSlot && (!copy || !copy.src)) {
    copy = resolveHumanProofImageCopy(slot, variantId);
  }

  const isHeroSlot = slot === "mos_hero_human_proof";
  const isControl = !CRO_ENABLED || variantId === "control" || copy === null;

  // Session-once view tracking — reuses existing funnel channel.
  useEffect(() => {
    if (isControl && !isHeroSlot) return;
    if (typeof window === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const key = `mos:lp_image_view:${slot}:${variantId}`;
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
              slot,
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
  }, [isControl, isHeroSlot, slot, variantId]);

  // Hero slot is always rendered (uses fallback copy when needed).
  // Other slots stay silent on control / missing src.
  if (!isHumanProofSlot && isControl) return null;
  if (!copy || !copy.src) return null;


  const aspect = copy!.aspect ?? "wide";
  const aspectClass = ASPECT_CLASS[aspect] ?? ASPECT_CLASS.wide;
  const hasSrc = !!copy!.src;

  const frameClass = unstyled
    ? ["relative overflow-hidden", aspectClass].join(" ")
    : [
        "relative overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03]",
        aspectClass,
      ].join(" ");

  return (
    <figure
      ref={ref}
      data-mos-image-slot={slot}
      data-mos-image-variant={variantId}
      className={[
        unstyled ? "flex flex-col" : "flex flex-col gap-3",
        className ?? "",
      ].join(" ")}
    >
      {label ? (
        <p className="text-[10px] uppercase tracking-[0.28em] text-accent">
          {label}
        </p>
      ) : null}

      <div className={frameClass}>
        {hasSrc ? (
          <img
            src={copy!.src}
            alt={copy!.alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            // @ts-expect-error fetchpriority is valid HTML, untyped in React
            fetchpriority={priority ? "high" : "auto"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, hsl(var(--foreground) / 0.05) 0 1px, transparent 1px 14px)",
              }}
            />
            <span className="relative z-[1] inline-flex items-center gap-2 rounded-full border border-accent/30 bg-background/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Capture folgt
            </span>
            <p className="relative z-[1] max-w-xs text-xs leading-relaxed text-foreground/55">
              Echtes Bild wird vom Admin hochgeladen. Kein Mockup.
            </p>
          </div>
        )}

        {hasSrc && hideCaption && copy!.caption ? (
          <span className="absolute bottom-3 left-3 z-[1] inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/80 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-accent backdrop-blur-sm">
            <span className="h-1 w-1 rounded-full bg-accent" />
            Real
          </span>
        ) : null}
      </div>

      {!hideCaption && copy!.caption ? (
        <figcaption className="text-xs leading-snug text-foreground/60">
          {copy!.caption}
        </figcaption>
      ) : null}
    </figure>

  );
}
