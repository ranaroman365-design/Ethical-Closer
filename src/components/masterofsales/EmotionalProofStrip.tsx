/**
 * EmotionalProofStrip — Social Proof #2 (vor Quiz-CTA).
 *
 * Mini Transformation Proof im "Vorher → Heute" Format.
 * A/B-Test (max. 2 Varianten gleichzeitig aktiv):
 *   - entwicklung: Stillstand → Klarheit/Richtung
 *   - freiheit_modern: klassischer Sales-Job → moderne Fähigkeiten/Freiheit
 *
 * Variante kommt vom bestehenden A/B-Layer (useAbSlot).
 */
import { useAbSlot } from "@/hooks/useAbSlot";

export const EMOTIONAL_PROOF_SLOT = {
  slot: "mos_emotional_proof",
  variants: [
    { id: "entwicklung", baseWeight: 1 },
    { id: "freiheit_modern", baseWeight: 1 },
  ],
} as const;

interface ProofCopy {
  eyebrow: string;
  beforeLabel: string;
  before: string;
  afterLabel: string;
  after: string[];
}

const EMOTIONAL_PROOF_COPY: Record<string, ProofCopy> = {
  entwicklung: {
    eyebrow: "Persönliche Entwicklung",
    beforeLabel: "Vorher",
    before: "Stillstand und Unsicherheit.",
    afterLabel: "Heute",
    after: ["Mehr Klarheit.", "Mehr Richtung.", "Mehr Möglichkeiten."],
  },
  freiheit_modern: {
    eyebrow: "Moderne Perspektive",
    beforeLabel: "Vorher",
    before: "Ich wollte keinen klassischen Sales-Job.",
    afterLabel: "Heute",
    after: [
      "Moderne Fähigkeiten,",
      "die wirklich Freiheit geben —",
      "ortsunabhängig und selbstbestimmt.",
    ],
  },
};

const EmotionalProofStrip = () => {
  const variant = useAbSlot(EMOTIONAL_PROOF_SLOT);
  const copy =
    EMOTIONAL_PROOF_COPY[variant.variant] ?? EMOTIONAL_PROOF_COPY.entwicklung;

  return (
    <section data-mos-section="emotional_proof" className="bg-background">
      <div className="mx-auto max-w-3xl px-6 pt-14 md:px-10 md:pt-16">
        <p className="text-center text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
          {copy.eyebrow}
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-6 py-7 text-center md:text-left">
            <p className="text-[10px] uppercase tracking-[0.24em] text-foreground/45">
              {copy.beforeLabel}
            </p>
            <p className="mt-3 font-serif text-lg leading-relaxed text-foreground/65 md:text-xl">
              {copy.before}
            </p>
          </div>

          <div className="rounded-2xl border border-accent/30 bg-accent/[0.04] px-6 py-7 text-center md:text-left">
            <p className="text-[10px] uppercase tracking-[0.24em] text-accent">
              {copy.afterLabel}
            </p>
            <div className="mt-3 space-y-1 font-serif text-lg leading-relaxed text-foreground/90 md:text-xl">
              {copy.after.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EmotionalProofStrip;
