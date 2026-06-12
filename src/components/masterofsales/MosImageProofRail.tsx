/**
 * Phase 9.2 — MosImageProofRail
 *
 * One additive LP section that mounts all 6 competence-proof image slots in
 * order. Every slot defaults to `control` → the entire section renders empty
 * (no DOM) when CRO is disabled or no variant is active. No layout shift in
 * the control case.
 *
 * Mounted once in `MasterOfSales.tsx` just after `<RealPlatformPreview />`.
 * Pure presentation — no funnel/business logic.
 */
import MosImageSlot from "./MosImageSlot";

const SECTIONS: Array<{
  slot: string;
  eyebrow: string;
  headline: string;
  body?: string;
  layout: "single" | "duo";
  secondarySlot?: string;
}> = [
  {
    slot: "mos_lp_hero_image",
    eyebrow: "Kompetenz",
    headline: "Wie professionelles Closing wirklich aussieht.",
    body: "Strukturierte Gesprächsführung. Vorbereitung. Ruhe. Kein Lifestyle-Marketing.",
    layout: "single",
  },
  {
    slot: "mos_lp_training_image",
    eyebrow: "Training",
    headline: "Tägliches Roleplay statt einmaliger Kurs.",
    body: "Echte Wiederholung baut Fähigkeit auf. Hier siehst du, wie trainiert wird.",
    layout: "duo",
    secondarySlot: "mos_lp_call_simulation_image",
  },
  {
    slot: "mos_lp_community_image",
    eyebrow: "Community",
    headline: "Live-Trainings mit Trainern und Peers.",
    body: "Wöchentliche Calls. Direkter Austausch. Kein Kurs-Sammeln im stillen Kämmerlein.",
    layout: "single",
  },
  {
    slot: "mos_lp_transformation_image",
    eyebrow: "Entwicklung",
    headline: "Vom Suchenden zum vorbereiteten Verkäufer.",
    body: "Karriere entsteht durch Kompetenz — nicht durch Hoffnung.",
    layout: "duo",
    secondarySlot: "mos_lp_graduate_image",
  },
  {
    slot: "mos_lp_certification_image",
    eyebrow: "Nachweis",
    headline: "Echter Kompetenznachweis.",
    body: "Nach bestandener Prüfung. Kein Diplom-Schein.",
    layout: "single",
  },
];

export default function MosImageProofRail() {
  return (
    <section
      data-mos-section="competence_proof_images"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
        <div className="space-y-16 md:space-y-20">
          {SECTIONS.map((s) => (
            <SectionRow key={s.slot} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionRow(props: {
  slot: string;
  eyebrow: string;
  headline: string;
  body?: string;
  layout: "single" | "duo";
  secondarySlot?: string;
}) {
  const { slot, eyebrow, headline, body, layout, secondarySlot } = props;
  return (
    <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12">
      <div className="md:col-span-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-accent">
          {eyebrow}
        </p>
        <h3 className="mt-3 font-serif text-2xl leading-tight text-foreground md:text-3xl">
          {headline}
        </h3>
        {body ? (
          <p className="mt-3 text-sm leading-relaxed text-foreground/70 md:text-base">
            {body}
          </p>
        ) : null}
      </div>
      <div className="md:col-span-8">
        {layout === "duo" && secondarySlot ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MosImageSlot slot={slot} />
            <MosImageSlot slot={secondarySlot} />
          </div>
        ) : (
          <MosImageSlot slot={slot} />
        )}
      </div>
    </div>
  );
}
