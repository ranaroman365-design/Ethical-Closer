import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";
import { recordIntentSignal } from "@/lib/mos-high-intent";

const SCROLL_MIRROR: Record<number, string[]> = {
  25: ["MASTEROFSALES_SCROLL_25", "MASTER_SCROLL_25"],
  50: ["MASTEROFSALES_SCROLL_50", "MASTER_SCROLL_50"],
  75: ["MASTEROFSALES_SCROLL_75", "MASTER_SCROLL_75"],
  90: ["MASTEROFSALES_SCROLL_90", "MASTER_SCROLL_90"],
};
const TIME_MIRROR: Record<number, string[]> = {
  30: ["MASTEROFSALES_TIME_30", "MASTER_TIME_30"],
  60: ["MASTEROFSALES_TIME_60", "MASTER_TIME_60"],
};

/**
 * Additives Tracking: Section-Views + Scroll-Depth. Bricht NICHTS Bestehendes.
 *
 * Feuert:
 *  - `mos_section_view`  einmal pro Section / Session
 *  - `mos_scroll_depth`  bei 25 / 50 / 75 / 100 %
 *
 * Section-Erkennung via `data-mos-section="<name>"` Attribut auf jedem
 * `<section>`-Element. Scroll-Depth via window-scroll.
 */
const SectionViewTracker = () => {
  const firedSections = useRef(new Set<string>());
  const firedDepths = useRef(new Set<number>());
  const firedDwell = useRef(new Set<number>());


  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-mos-section]"),
    );
    if (sections.length === 0) return;

    const slotSummary = getActiveSlotSummary();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.4) continue;
          const name = (entry.target as HTMLElement).dataset.mosSection;
          if (!name || firedSections.current.has(name)) continue;
          firedSections.current.add(name);
          try {
            trackFunnelEvent("mos_section_view", {
              funnel: "masterofsales",
              section: name,
              ab_slots: slotSummary,
            });
          } catch {
            /* never throw */
          }
        }
      },
      { threshold: [0.4] },
    );
    sections.forEach((s) => observer.observe(s));

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY;
      const total = doc.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / total) * 100));
      for (const bucket of [25, 50, 75, 90]) {
        if (pct >= bucket && !firedDepths.current.has(bucket)) {
          firedDepths.current.add(bucket);
          try {
            trackFunnelEvent("mos_scroll_depth", {
              funnel: "masterofsales",
              depth: bucket,
              ab_slots: slotSummary,
            });
            const mirrors = SCROLL_MIRROR[bucket] ?? [];
            for (const m of mirrors) {
              trackFunnelEvent(m, {
                funnel: "masterofsales",
                depth: bucket,
                ab_slots: slotSummary,
              });
            }
            if (bucket >= 50) recordIntentSignal("scroll_50");
          } catch {
            /* never throw */
          }
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Time-on-page Milestones (10s, 30s, 60s, 120s) — additives Lernsignal
    // für Meta zur Qualitätsbewertung von Cold-Traffic.
    const startedAt = Date.now();
    const dwellTimers: number[] = [];
    for (const sec of [10, 30, 45, 60, 120]) {
      const id = window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        if (firedDwell.current.has(sec)) return;
        firedDwell.current.add(sec);
        try {
          trackFunnelEvent("mos_time_on_page", {
            funnel: "masterofsales",
            seconds: sec,
            elapsed_ms: Date.now() - startedAt,
            ab_slots: slotSummary,
          });
          const mirrors = TIME_MIRROR[sec] ?? [];
          for (const m of mirrors) {
            trackFunnelEvent(m, {
              funnel: "masterofsales",
              seconds: sec,
              ab_slots: slotSummary,
            });
          }
          if (sec >= 45) recordIntentSignal("time_45");
        } catch {
          /* never throw */
        }
      }, sec * 1000);
      dwellTimers.push(id);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      dwellTimers.forEach((id) => window.clearTimeout(id));
    };
  }, []);


  return null;
};

export default SectionViewTracker;
