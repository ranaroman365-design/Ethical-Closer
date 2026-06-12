/**
 * TrustAcceleratorsBlock — verifizierte, konsensgeprüfte Vertrauenssignale.
 *
 * Keine erfundenen Zahlen. Nur Aussagen, die durch existierende Coachings,
 * Calls und Werdegang gedeckt sind. Reine Sicht-Schicht.
 */
import { useEffect, useRef } from "react";
import {
  Users,
  MessageSquareText,
  Clock,
  TrendingUp,
  ClipboardCheck,
} from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const SIGNALS = [
  { Icon: Users, text: "Hunderte begleitet — Männer und Frauen aus DACH." },
  { Icon: MessageSquareText, text: "Tausende echte Verkaufsgespräche analysiert." },
  { Icon: Clock, text: "Jahrzehnte kumulierte Sales-Erfahrung im Trainer-Team." },
  { Icon: TrendingUp, text: "Performance-basiertes Vorankommen — keine Schein-Stufen." },
  { Icon: ClipboardCheck, text: "Platzierung über nachgewiesene Leistung, nicht Lebenslauf." },
];

const FIRED_KEY = "mos_trust_accelerators_view_fired_v1";

const TrustAcceleratorsBlock = () => {
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
              trackFunnelEvent("MASTER_TRUST_ACCELERATORS_VIEW", {
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
      data-mos-section="trust_accelerators"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Was hinter dem System steht
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Substanz, die du prüfen kannst.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-foreground/70 md:text-lg">
            Keine geschönten Zahlen. Keine erfundenen Awards. Nur das, was wir
            durch tausende echte Gespräche belegen können.
          </p>
        </div>

        <ul className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
          {SIGNALS.map(({ Icon, text }) => (
            <li
              key={text}
              className="flex items-start gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5"
            >
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.06] text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm leading-relaxed text-foreground/80 md:text-base">
                {text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default TrustAcceleratorsBlock;
