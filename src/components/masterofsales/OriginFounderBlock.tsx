/**
 * OriginFounderBlock — "Why ETC Exists".
 *
 * Verankert die Existenzberechtigung des Systems. Matcht Origin-Creatives.
 * Kurz, konkret, ohne Selbstbeweihräucherung.
 */
import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";

const FIRED_KEY = "mos_origin_view_fired_v1";

const OriginFounderBlock = () => {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    try {
      if (sessionStorage.getItem(FIRED_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(FIRED_KEY, "1");
            } catch {
              /* ignore */
            }
            try {
              trackFunnelEvent("MASTER_ORIGIN_VIEW", {
                funnel: "masterofsales",
              });
            } catch {
              /* never throw */
            }
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      data-mos-section="origin"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Warum Ethical Top Closer existiert
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Weil der Markt kaputt war.
          </h2>
        </div>

        <div className="mt-10 space-y-6 text-base leading-relaxed text-foreground/80 md:text-lg">
          <p>
            Junge Männer mit Potenzial wurden in <span className="text-foreground">Programmen</span>{" "}
            geparkt, die Zertifikate verkauften — aber keinen Auftraggeber überzeugten.
          </p>
          <p>
            Auf der anderen Seite: <span className="text-foreground">Auftraggeber</span>,
            die händeringend Closer suchten — und immer wieder dieselbe Enttäuschung
            erlebten. Hochglanz auf LinkedIn, leere Pipeline in der Realität.
          </p>
          <p>
            Ethical Top Closer ist die Brücke, die in der Mitte gefehlt hat.{" "}
            <span className="text-foreground">Learn → Earn → Top Job Placements™</span>{" "}
            existiert genau deshalb: weil Können bewiesen gehört, nicht behauptet.
          </p>
          <p className="font-serif italic text-foreground/85">
            Wir haben das System gebaut, das wir uns selbst gewünscht hätten — als
            wir vor zwanzig Jahren angefangen haben.
          </p>
        </div>
      </div>
    </section>
  );
};

export default OriginFounderBlock;
