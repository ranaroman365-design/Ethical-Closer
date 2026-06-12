/**
 * IdentificationStatement — schmaler Identifikationsblock zwischen Hero und Moments.
 *
 * Zweck: emotionale Verankerung BEVOR Funnel-Inhalt kommt. Kein CTA, reine Resonanz.
 *
 * A/B-Test (max. 2 Varianten, additiv):
 *   - richtung_entwicklung: "Richtung & Entwicklung"
 *   - freiheit_modern:      "Freiheit & modernes Leben"
 */
import { useAbSlot } from "@/hooks/useAbSlot";

export const IDENTIFICATION_SLOT = {
  slot: "mos_identification",
  variants: [
    { id: "richtung_entwicklung", baseWeight: 1 },
    { id: "freiheit_modern", baseWeight: 1 },
  ],
} as const;

interface IdentificationCopy {
  eyebrow: string;
  headlineLead: string;
  headlineTail: string;
  body: string;
}

const COPY: Record<string, IdentificationCopy> = {
  richtung_entwicklung: {
    eyebrow: "Vielleicht erkennst du dich",
    headlineLead:
      "Vielleicht fehlt dir nicht Motivation — vielleicht fehlt dir Richtung.",
    headlineTail:
      " Und ein Umfeld, in dem du dich wirklich entwickeln kannst.",
    body:
      "Vielleicht hast du beruflich schon viel erreicht und merkst, dass dir Orientierung fehlt. Vielleicht stehst du am Anfang und willst von Anfang an klar arbeiten. So oder so: hier geht es nicht um schnellen Reichtum. Es geht um echte Entwicklung, ein Umfeld, das mitwächst, und einen Weg, der zu dir passt — oder eben nicht.",
  },
  freiheit_modern: {
    eyebrow: "Vielleicht erkennst du dich",
    headlineLead:
      "Du musst nicht im selben Alltag bleiben.",
    headlineTail:
      " Moderne Fähigkeiten schaffen moderne Freiheit.",
    body:
      "Vielleicht spürst du seit Längerem, dass mehr möglich ist — ortsunabhängiger, selbstbestimmter, ehrlicher. Hier geht es nicht um Hype oder schnelle Versprechen, sondern um Fähigkeiten, die dir wirklich Spielraum geben: für deine Zeit, deine Entscheidungen, dein Leben.",
  },
};

const IdentificationStatement = () => {
  const variant = useAbSlot(IDENTIFICATION_SLOT);
  const copy = COPY[variant.variant] ?? COPY.richtung_entwicklung;

  return (
    <section
      data-mos-section="identification"
      className="border-y border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-10">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">
          {copy.eyebrow}
        </p>
        <h2 className="mt-6 font-serif text-2xl leading-[1.25] md:text-4xl">
          {copy.headlineLead}
          <span className="text-foreground/55">{copy.headlineTail}</span>
        </h2>
        <p className="mt-6 text-base leading-relaxed text-foreground/70 md:text-lg">
          {copy.body}
        </p>
      </div>
    </section>
  );
};

export default IdentificationStatement;
