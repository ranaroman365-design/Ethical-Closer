/**
 * Phase 9.3 — MosHumanProofRail
 * Phase 9.6B — Beruf row now uses a dedicated hardcoded asset (Discovery
 * conversation) so it never duplicates the hero background image (which
 * drives the same `mos_hero_human_proof` slot). All A/B / Thompson Sampling
 * / tracking remains untouched — only this presentation row bypasses the
 * shared slot. Other proof sections continue to render via MosImageSlot.
 *
 * One additive LP section that mounts the Human-Proof image sections. Every
 * MosImageSlot defaults to `control` → empty render when CRO is disabled
 * (no DOM, no layout shift).
 *
 * Dev-only image-uniqueness assertion runs once on mount.
 * Pure presentation — no funnel/business logic.
 */
import { useEffect, useRef } from "react";
import MosImageSlot from "./MosImageSlot";
import { MOS_HUMAN_PROOF_COPY } from "@/lib/mos-human-proof-slots";
import berufDiscovery from "@/assets/lp-proof-p94/beruf-discovery.jpg.asset.json";
import {
  assertMosProofImagesUniqueDev,
  type ProofImageBinding,
} from "@/lib/mos-image-uniqueness";

type SlotKey = keyof typeof MOS_HUMAN_PROOF_COPY;

interface SectionDef {
  slot: SlotKey | "static_beruf_discovery";
  eyebrow: string;
  headline: string;
  body?: string;
  /** Hardcoded asset (bypasses A/B). Used for the Beruf row only. */
  staticImage?: {
    src: string;
    alt: string;
    caption?: string;
  };
}

const BERUF_STATIC = {
  src: berufDiscovery.url,
  alt: "Echtes Discovery-Gespräch: Coach und Teilnehmer am Schreibtisch, Notizen, Discovery Framework auf dem Laptop, ruhige professionelle Gesprächsführung.",
  caption: "Discovery-Gespräch · Framework · Notizen",
};

const SECTIONS: SectionDef[] = [
  {
    slot: "static_beruf_discovery",
    eyebrow: "Beruf",
    headline: "So sieht professionelles Closing wirklich aus.",
    body: "Strukturierte Gespräche. Vorbereitung. Ruhe. Kein Lifestyle-Marketing.",
    staticImage: BERUF_STATIC,
  },
  {
    slot: "mos_training_proof",
    eyebrow: "Training",
    headline: "Du lernst hier wirklich eine Fähigkeit.",
    body: "Live-Coaching, Roleplay und Screen-Reviews echter Verkaufsgespräche.",
  },
  {
    slot: "mos_community_proof",
    eyebrow: "Community",
    headline: "Live-Trainings mit Trainern und Peers.",
    body: "Wöchentliche Sessions. Direktes Feedback. Verantwortung.",
  },
  {
    slot: "mos_graduate_proof",
    eyebrow: "Absolventen",
    headline: "Menschen schließen das hier ab.",
    body: "Echte Teilnehmer nach bestandener Prüfung — keine Stock-Fotos, keine Versprechen.",
  },
  {
    slot: "mos_certification_proof",
    eyebrow: "Qualifikation",
    headline: "Es gibt eine echte Qualifikation.",
    body: "Lesbares Zertifikat nach Abschluss der Ausbildung.",
  },
  {
    slot: "mos_transformation_proof",
    eyebrow: "Entwicklung",
    headline: "Vom Suchenden zum vorbereiteten Verkäufer.",
    body: "Karriere entsteht durch Kompetenz — nicht durch Hoffnung.",
  },
];

export default function MosHumanProofRail() {
  const rootRef = useRef<HTMLElement | null>(null);

  // Dev-only uniqueness assertion. Reads the resolved <img src> of every
  // figure rendered inside this section, plus the hero background image,
  // and warns on duplicate URLs / empties. No-op in prod.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      const bindings: ProofImageBinding[] = [];

      // Hero background image (lives outside this rail).
      const heroImg = document.querySelector<HTMLImageElement>(
        '[data-mos-section="hero"] img[data-mos-image-slot="mos_hero_human_proof"]',
      );
      if (heroImg) {
        bindings.push({
          slot: "mos_hero_human_proof",
          variant:
            heroImg.closest("figure")?.getAttribute("data-mos-image-variant") ??
            "unknown",
          url: heroImg.getAttribute("src"),
        });
      }

      // All proof sections in this rail.
      const root = rootRef.current;
      if (root) {
        root
          .querySelectorAll<HTMLElement>("[data-mos-proof-row]")
          .forEach((row) => {
            const slot = row.getAttribute("data-mos-proof-row") ?? "";
            const img = row.querySelector<HTMLImageElement>("img");
            bindings.push({
              slot,
              variant:
                row
                  .querySelector("[data-mos-image-variant]")
                  ?.getAttribute("data-mos-image-variant") ?? "static",
              url: img?.getAttribute("src") ?? null,
            });
          });
      }

      assertMosProofImagesUniqueDev(bindings);
    }, 600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section
      ref={rootRef}
      data-mos-section="human_proof_images"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
        <div className="space-y-16 md:space-y-20">
          {SECTIONS.map((s) => (
            <SectionRow key={s.slot} def={s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionRow({ def }: { def: SectionDef }) {
  const { slot, eyebrow, headline, body, staticImage } = def;
  return (
    <div
      data-mos-proof-row={slot}
      className="grid grid-cols-1 items-start gap-8 md:grid-cols-12"
    >
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
        {staticImage ? (
          <figure className="flex flex-col gap-3">
            <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03]">
              <img
                src={staticImage.src}
                alt={staticImage.alt}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute bottom-3 left-3 z-[1] inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/80 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-accent backdrop-blur-sm">
                <span className="h-1 w-1 rounded-full bg-accent" />
                Real
              </span>
            </div>
            {staticImage.caption ? (
              <figcaption className="text-xs leading-snug text-foreground/60">
                {staticImage.caption}
              </figcaption>
            ) : null}
          </figure>
        ) : (
          <MosImageSlot slot={slot} />
        )}
      </div>
    </div>
  );
}
