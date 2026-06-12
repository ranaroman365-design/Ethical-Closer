/**
 * RealTransformationProofBlock — echte (anonymisierte) Entwicklungs-Stories.
 *
 * Keine Fake-Namen, keine Fake-Bilder, keine Geld-/Job-Versprechen.
 * Format pro Card: Vorher → Heute (Identifikation + nachvollziehbare Veränderung).
 *
 * - Headline-Variante via Prop (A/B vom Parent: "uncertain" | "decision")
 * - Proof-Message-Variante via Prop (A/B vom Parent: "uncertainty_to_confidence" | "no_sales_type_needed")
 *   → tauscht NUR die Reihenfolge / Hervorhebung der 3 Karten, nicht die Substanz.
 * - Feuert MASTER_REAL_PROOF_VIEW max. 1x pro Session.
 */
import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";

export type ProofHeadlineVariant = "uncertain" | "decision";
export type ProofMessageVariant =
  | "uncertainty_to_confidence"
  | "no_sales_type_needed";

interface ProofCard {
  id: string;
  before: string;
  today: string;
  tag: string;
}

const CARDS: ProofCard[] = [
  {
    id: "uncertainty_to_confidence",
    before: "Ich wusste nicht, ob Sales überhaupt zu mir passt.",
    today:
      "Ich habe verstanden, wie Kommunikation funktioniert — und mehr Sicherheit in Gesprächen.",
    tag: "Teilnehmer-Erfahrung",
  },
  {
    id: "direction",
    before: "Ich wollte Veränderung, hatte aber keine klare Richtung.",
    today:
      "Ich habe eine Fähigkeit aufgebaut, die mir neue Möglichkeiten eröffnet.",
    tag: "Teilnehmer-Erfahrung",
  },
  {
    id: "no_sales_type_needed",
    before: "Ich dachte, man muss der typische Verkäufer sein.",
    today:
      "Ich habe gelernt, dass Verkaufen auch ehrlich und authentisch funktionieren kann.",
    tag: "Teilnehmer-Erfahrung",
  },
];

const HEADLINE_COPY: Record<ProofHeadlineVariant, string> = {
  uncertain: "Menschen, die auch erst unsicher waren.",
  decision: "Jeder Weg beginnt mit einer Entscheidung.",
};

const FIRED_KEY = "mos_real_proof_view_fired_v1";

interface Props {
  headlineVariant: ProofHeadlineVariant;
  messageVariant: ProofMessageVariant;
}

const RealTransformationProofBlock = ({
  headlineVariant,
  messageVariant,
}: Props) => {
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
              trackFunnelEvent("MASTER_REAL_PROOF_VIEW", {
                funnel: "masterofsales",
                headline_variant: headlineVariant,
                message_variant: messageVariant,
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
  }, [headlineVariant, messageVariant]);

  // Reorder so die zur Message passende Karte zuerst kommt — ohne Inhalt zu erfinden.
  const cards = [...CARDS].sort((a, b) => {
    if (a.id === messageVariant) return -1;
    if (b.id === messageVariant) return 1;
    return 0;
  });

  return (
    <section
      ref={ref}
      data-mos-section="real_transformation_proof"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Ehrliche Entwicklungen
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-4xl">
            {HEADLINE_COPY[headlineVariant]}
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-foreground/70 md:text-base">
            Keine Erfolgsversprechen. Keine Inszenierung. Nur drei
            nachvollziehbare Veränderungen von Menschen, die da angefangen
            haben, wo viele heute stehen.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {cards.map((c) => (
            <article
              key={c.id}
              className="flex h-full flex-col gap-5 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 md:p-7"
            >
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/50">
                  Vorher
                </p>
                <p className="mt-2 font-serif text-lg leading-snug text-foreground/85 md:text-xl">
                  „{c.before}"
                </p>
              </div>
              <div className="h-px w-8 bg-accent/40" aria-hidden />
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent">
                  Heute
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80 md:text-base">
                  {c.today}
                </p>
              </div>
              <p className="mt-auto pt-3 text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                {c.tag}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RealTransformationProofBlock;
