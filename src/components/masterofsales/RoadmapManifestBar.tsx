/**
 * RoadmapManifestBar — liefert sichtbar das Creative-Canon-Versprechen
 * „9 Phasen · 33 Module · L0–L8" als ruhige Manifest-Leiste zwischen
 * CareerPathLadder und Placement Proof.
 *
 * Rein additiv. Keine Funnel/Routing-Mutation. KEIN neuer KPI.
 *
 * Event:
 *   MASTER_ROADMAP_VIEW — 1×/Session via sessionStorage-Guard.
 */
import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";

const TILES = [
  {
    n: "9",
    label: "Phasen",
    sub: "Vom Einstieg bis zum Top Job Placement.",
  },
  {
    n: "33",
    label: "Module",
    sub: "Jede Phase als nachweisbare Lern- & Leistungseinheit.",
  },
  {
    n: "L0–L8",
    label: "Levels",
    sub: "Klare Stufen statt vager Versprechen.",
  },
] as const;

const RoadmapManifestBar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || fired.current) return;
    const key = "mos_roadmap_view_fired";
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) {
      fired.current = true;
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !fired.current) {
            fired.current = true;
            try {
              trackFunnelEvent("MASTER_ROADMAP_VIEW", {
                funnel: "masterofsales",
                phases: 9,
                modules: 33,
                levels: "L0-L8",
              });
              sessionStorage.setItem(key, "1");
            } catch {
              /* noop */
            }
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      data-mos-section="roadmap_manifest"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Die Roadmap
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-4xl">
            Ein sichtbares System. Kein Mystery-Kurs.
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {TILES.map((t) => (
            <div
              key={t.label}
              className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 text-center md:p-8"
            >
              <p className="font-serif text-4xl leading-none text-accent md:text-5xl">
                {t.n}
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-[0.28em] text-foreground/70 sm:text-xs">
                {t.label}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                {t.sub}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RoadmapManifestBar;
