import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";
import { useMosProofImages } from "@/hooks/useMosProofImages";

/**
 * PlatformProofSlot — Honest, non-fake screenshot frame.
 *
 * Renders a real platform screenshot if `src` is provided. Otherwise renders an
 * honest "Screenshot folgt — Live aus <route>" frame: visible chrome, no fake
 * UI, no fake metrics, no mockup data. Designed to be swapped 1:1 once a real
 * member-route capture exists in `src/assets/platform-real/`.
 *
 * No fabricated KPIs. No invented user data. No mocked dashboards.
 */
export type PlatformProofSlotProps = {
  /** Real platform screenshot. Leave undefined while awaiting capture. */
  src?: string;
  /** Short label rendered as caption above the frame (e.g. "Performance Dashboard™"). */
  label: string;
  /** Member route the screenshot was captured from (e.g. "/members/performance"). */
  route: string;
  /** One-line description of what the screen visibly shows. */
  caption?: string;
  /** Aspect ratio for the frame. Defaults to 16/10 (desktop dashboard feel). */
  aspect?: "16/10" | "16/9" | "4/3" | "9/16";
  className?: string;
};

const ASPECT_CLASS: Record<NonNullable<PlatformProofSlotProps["aspect"]>, string> = {
  "16/10": "aspect-[16/10]",
  "16/9": "aspect-video",
  "4/3": "aspect-[4/3]",
  "9/16": "aspect-[9/16]",
};

const PlatformProofSlot = ({
  src,
  label,
  route,
  caption,
  aspect = "16/10",
  className,
}: PlatformProofSlotProps) => {
  // Live registry: admin uploads → instant swap on LP. Explicit `src` wins.
  const { data: registry } = useMosProofImages();
  const uploaded = registry?.get(route);
  const resolvedSrc = src ?? uploaded?.image_url;
  const resolvedAlt = uploaded?.alt_text ?? `${label} — echte Plattform-Ansicht aus ${route}`;
  return (
    <figure
      className={[
        "group flex flex-col gap-3",
        className ?? "",
      ].join(" ")}
      data-mos-proof-route={route}
    >
      <div
        className={[
          "relative overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03]",
          ASPECT_CLASS[aspect],
        ].join(" ")}
      >
        {/* Browser-chrome bar — signals "real route" even when empty */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-foreground/10 bg-background/80 px-3 py-2 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-foreground/15" />
          <span className="h-2 w-2 rounded-full bg-foreground/15" />
          <span className="h-2 w-2 rounded-full bg-foreground/15" />
          <span className="ml-3 truncate font-mono text-[10px] tracking-tight text-foreground/50">
            etc.platform{route}
          </span>
        </div>

        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt={resolvedAlt}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-top pt-8"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 pt-10 text-center"
            role="status"
            aria-live="polite"
            aria-label={`Live-Capture folgt für ${route}`}
          >
            {/* Diagonal hatch — unmistakably "not a UI", honest placeholder */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pt-8 opacity-[0.35]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, hsl(var(--foreground) / 0.05) 0 1px, transparent 1px 14px)",
              }}
            />

            {/* Status pill */}
            <span className="relative z-[1] inline-flex items-center gap-2 rounded-full border border-accent/30 bg-background/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.28em] text-accent backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Live-Capture folgt
            </span>

            <p className="relative z-[1] font-serif text-base leading-snug text-foreground/75 md:text-lg">
              Echter Screenshot aus{" "}
              <span className="font-mono text-sm text-foreground/90">{route}</span>
            </p>

            <p className="relative z-[1] max-w-xs text-xs leading-relaxed text-foreground/45">
              Kein Mockup. Keine erfundenen Kennzahlen. Diese Fläche bleibt leer,
              bis der echte Capture aus der Plattform vorliegt.
            </p>
          </div>
        )}
      </div>

      <figcaption className="flex flex-col gap-1">
        <span className="font-serif text-lg text-foreground md:text-xl">
          {label}
        </span>
        {caption ? (
          <span className="text-sm leading-snug text-foreground/60">
            {caption}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
};

export default PlatformProofSlot;

// ---------------------------------------------------------------------------
// Session-guarded view tracker (per Brief §7)
// ---------------------------------------------------------------------------

const fired = new Set<string>();

export const useProofViewOnce = (eventName: string, payload?: Record<string, unknown>) => {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const storageKey = `mos:proof:${eventName}`;
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
    } catch {
      /* ignore */
    }
    if (fired.has(eventName)) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.4) continue;
          if (fired.has(eventName)) return;
          fired.add(eventName);
          try {
            sessionStorage.setItem(storageKey, "1");
          } catch {
            /* ignore */
          }
          try {
            trackFunnelEvent(eventName, {
              funnel: "masterofsales",
              ...(payload ?? {}),
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
  }, [eventName, payload]);
  return ref;
};
