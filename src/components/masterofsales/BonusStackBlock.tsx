/**
 * BonusStackBlock — zusätzlicher Support-/Bonus-Layer.
 *
 * Erhöht wahrgenommenen Wert ohne harte Garantien.
 */
import { useEffect, useRef } from "react";
import {
  ClipboardCheck,
  Mic,
  Compass,
  Users,
  type LucideIcon,
} from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";

interface Bonus {
  eyebrow: string;
  title: string;
  body: string;
  Icon: LucideIcon;
}

const BONUSES: Bonus[] = [
  {
    eyebrow: "Bonus 01",
    title: "Closer Readiness Check",
    body: "Finde heraus, welche Stärken du bereits mitbringst — und worauf wir gemeinsam aufbauen.",
    Icon: ClipboardCheck,
  },
  {
    eyebrow: "Bonus 02",
    title: "Live Roleplay Training",
    body: "Sammle Sicherheit durch echte Übungsgespräche mit Feedback — bevor es um echtes Geld geht.",
    Icon: Mic,
  },
  {
    eyebrow: "Bonus 03",
    title: "Start-Unterstützung",
    body: "Erhalte Orientierung für deine ersten nächsten Schritte — Schritt für Schritt, nicht ins kalte Wasser.",
    Icon: Compass,
  },
  {
    eyebrow: "Bonus 04",
    title: "Community Zugang",
    body: "Starte nicht alleine, sondern in einem Umfeld, das Entwicklung ernst nimmt.",
    Icon: Users,
  },
];

const FIRED_KEY = "mos_bonus_stack_view_fired_v1";

const BonusStackBlock = () => {
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
              trackFunnelEvent("MASTER_BONUS_STACK_VIEW", {
                funnel: "masterofsales",
                ab_slots: getActiveSlotSummary(),
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
      data-mos-section="bonus_stack"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Was du zusätzlich bekommst
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-4xl">
            Vier Bausteine, die dir den Start spürbar leichter machen.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {BONUSES.map(({ eyebrow, title, body, Icon }) => (
            <article
              key={title}
              className="flex h-full gap-5 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 md:p-7"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.06] text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/50">
                  {eyebrow}
                </p>
                <h3 className="font-serif text-xl leading-tight md:text-2xl">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-foreground/75 md:text-base">
                  {body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BonusStackBlock;
