/**
 * OutcomeTransformationStrip — Transformation Vorher/Nachher (additiv).
 *
 * Ergänzt EmotionalProofStrip um eine explizite Outcome-Story
 * (Unsicherheit → Klarheit / Sicherheit / Richtung). Eigener A/B-Slot.
 */
import { useAbSlot } from "@/hooks/useAbSlot";

export const OUTCOME_TRANSFORMATION_SLOT = {
  slot: "mos_outcome_transformation",
  variants: [
    { id: "sicherheit", baseWeight: 1 },
    { id: "richtung", baseWeight: 1 },
  ],
} as const;

interface Copy {
  eyebrow: string;
  before: string;
  afterLines: string[];
}

const COPY: Record<string, Copy> = {
  sicherheit: {
    eyebrow: "Vorher → Heute",
    before: '„Ich war unsicher, ob ich das überhaupt kann."',
    afterLines: [
      "Heute weiß ich, wie ich Gespräche ruhig führe.",
      "Ich vertraue meiner Stimme.",
      "Ich vertraue meinem Weg.",
    ],
  },
  richtung: {
    eyebrow: "Vorher → Heute",
    before: '„Ich wusste lange nicht, wohin ich beruflich eigentlich will."',
    afterLines: [
      "Heute habe ich Klarheit über meine Richtung.",
      "Ich treffe Entscheidungen bewusster.",
      "Ich entwickle mich in eine Richtung, die zu mir passt.",
    ],
  },
};

const OutcomeTransformationStrip = () => {
  const variant = useAbSlot(OUTCOME_TRANSFORMATION_SLOT);
  const copy = COPY[variant.variant] ?? COPY.sicherheit;

  return (
    <section
      data-mos-section="outcome_transformation"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-4xl px-6 py-20 md:px-10 md:py-24">
        <p className="text-center text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
          {copy.eyebrow}
        </p>
        <h2 className="mx-auto mt-5 max-w-2xl text-center font-serif text-3xl leading-tight md:text-4xl">
          Echte Entwicklung sieht selten spektakulär aus —<br />
          aber sie ist spürbar.
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-7">
            <p className="text-[10px] uppercase tracking-[0.24em] text-foreground/45">
              Vorher
            </p>
            <p className="mt-3 font-serif text-lg italic leading-relaxed text-foreground/65 md:text-xl">
              {copy.before}
            </p>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-accent/[0.04] p-7">
            <p className="text-[10px] uppercase tracking-[0.24em] text-accent">
              Heute
            </p>
            <div className="mt-3 space-y-1.5 font-serif text-lg leading-relaxed text-foreground/90 md:text-xl">
              {copy.afterLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OutcomeTransformationStrip;
