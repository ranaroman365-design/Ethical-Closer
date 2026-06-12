/**
 * Phase 9.2 — Competence Proof Image A/B slot registry.
 *
 * 100% additive. Each slot defaults to `control` (renders nothing) so the
 * pre-9.2 LP stays pixel-identical. Per-variant copy points at CDN-hosted
 * assets created via `lovable-assets` and lives in `src/assets/lp-proof/`.
 *
 * Optimization is owned by the existing Winner Engine + Harm Guard:
 *   Booking ×12 · HQL ×8 · Lead ×4 · Quiz Completion ×2 · Quiz Start ×1
 *   CTR / Clicks / Impressions = 0 weight.
 * A variant CANNOT win if Booking Rate, QL Rate, or Revenue regresses.
 *
 * Rollback:
 *   - Set `CRO_ENABLED = false` → every slot returns control.
 *   - Or zero the weights of new `mos_lp_*_image` rows in `ab_slot_weights`.
 *   - Or delete the `<MosImageProofRail />` mount in `MasterOfSales.tsx`.
 *
 * No CRM / quiz / booking / Calendly / auth / routing / schema / tracking
 * schema change. Reuses existing `trackFunnelEvent` channel only.
 */
import type { AbSlotDef } from "@/lib/ab-multivariant";

import heroCompetenceAsset from "@/assets/lp-proof-p94/training-C-roleplay-v2.png.asset.json";
import trainingRoleplayAsset from "@/assets/lp-proof/training-roleplay.jpg.asset.json";
import communityCallAsset from "@/assets/lp-proof/community-call.jpg.asset.json";
import graduatePortraitAsset from "@/assets/lp-proof/graduate-portrait.jpg.asset.json";
import transformationAsset from "@/assets/lp-proof/transformation.jpg.asset.json";

// ─── Slot defs ───────────────────────────────────────────────────────────
export const MOS_LP_HERO_IMAGE: AbSlotDef = {
  slot: "mos_lp_hero_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_competence_conversation", baseWeight: 1 },
    { id: "C_training_focus", baseWeight: 1 },
    { id: "D_professional_seller", baseWeight: 1 },
  ],
};

export const MOS_LP_TRAINING_IMAGE: AbSlotDef = {
  slot: "mos_lp_training_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_roleplay", baseWeight: 1 },
    { id: "C_call_preparation", baseWeight: 1 },
    { id: "D_focused_learning", baseWeight: 1 },
  ],
};

export const MOS_LP_COMMUNITY_IMAGE: AbSlotDef = {
  slot: "mos_lp_community_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_group_call", baseWeight: 1 },
    { id: "C_live_training", baseWeight: 1 },
    { id: "D_peer_learning", baseWeight: 1 },
  ],
};

export const MOS_LP_CERTIFICATION_IMAGE: AbSlotDef = {
  slot: "mos_lp_certification_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_certificate_display", baseWeight: 1 },
  ],
};

export const MOS_LP_CALL_SIMULATION_IMAGE: AbSlotDef = {
  slot: "mos_lp_call_simulation_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_simulation_setup", baseWeight: 1 },
    { id: "C_headset_focus", baseWeight: 1 },
  ],
};

export const MOS_LP_GRADUATE_IMAGE: AbSlotDef = {
  slot: "mos_lp_graduate_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_alumni_portrait", baseWeight: 1 },
    { id: "C_alumni_in_role", baseWeight: 1 },
  ],
};

export const MOS_LP_TRANSFORMATION_IMAGE: AbSlotDef = {
  slot: "mos_lp_transformation_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_before_after", baseWeight: 1 },
    { id: "C_after_only_professional", baseWeight: 1 },
  ],
};

export const MOS_IMAGE_SLOTS: readonly AbSlotDef[] = [
  MOS_LP_HERO_IMAGE,
  MOS_LP_TRAINING_IMAGE,
  MOS_LP_COMMUNITY_IMAGE,
  MOS_LP_CERTIFICATION_IMAGE,
  MOS_LP_CALL_SIMULATION_IMAGE,
  MOS_LP_GRADUATE_IMAGE,
  MOS_LP_TRANSFORMATION_IMAGE,
] as const;

export type ImageVariantCopy = {
  /** CDN URL. Empty string ⇒ admin upload pending; slot renders empty state. */
  src: string;
  alt: string;
  caption?: string;
  /** "wide" 16/9 (default), "portrait" 4/5, "square" 1/1. */
  aspect?: "wide" | "portrait" | "square";
};

/**
 * Per-variant copy. `null` = control (renders nothing).
 * Empty `src` keeps the slot registered for measurement but renders the
 * honest "Live-Capture folgt" placeholder — matches the policy already used
 * by `PlatformProofSlot` (no fake imagery, no fabricated KPIs).
 */
export const MOS_IMAGE_SLOT_COPY: Record<
  string,
  Record<string, ImageVariantCopy | null>
> = {
  mos_lp_hero_image: {
    control: null,
    B_competence_conversation: {
      src: heroCompetenceAsset.url,
      alt: "Professioneller Closer im Verkaufsgespräch — fokussiert, ruhig, kompetent.",
      caption: "Echter Verkaufsalltag · keine Inszenierung",
      aspect: "wide",
    },
    C_training_focus: {
      src: trainingRoleplayAsset.url,
      alt: "Zwei angehende Closer im Roleplay — strukturierte Gesprächsführung.",
      caption: "Training · echte Vertriebsfähigkeit",
      aspect: "wide",
    },
    D_professional_seller: {
      src: graduatePortraitAsset.url,
      alt: "Vorbereiteter, professioneller Verkäufer — ruhiger, klarer Blick.",
      caption: "Vom Kurs-Sammler zum professionellen Verkäufer",
      aspect: "portrait",
    },
  },
  mos_lp_training_image: {
    control: null,
    B_roleplay: {
      src: trainingRoleplayAsset.url,
      alt: "Closer-Roleplay: strukturierte Gesprächsführung, ehrlicher Mehrwert.",
      caption: "Tägliches Roleplay · echte Wiederholung",
      aspect: "wide",
    },
    C_call_preparation: {
      src: heroCompetenceAsset.url,
      alt: "Vorbereitung auf das nächste Verkaufsgespräch — fokussierte Umgebung.",
      caption: "Vorbereitung als Standard",
      aspect: "wide",
    },
    D_focused_learning: {
      src: "",
      alt: "Closer-Trainee in fokussierter Lernumgebung.",
      caption: "Konzentrierte Lernumgebung",
      aspect: "wide",
    },
  },
  mos_lp_community_image: {
    control: null,
    B_group_call: {
      src: communityCallAsset.url,
      alt: "Live-Trainingscall mit Closern in Ausbildung — strukturiertes Peer-Learning.",
      caption: "Live-Trainings · wöchentlich",
      aspect: "wide",
    },
    C_live_training: {
      src: communityCallAsset.url,
      alt: "Gemeinsames Live-Training — Trainer und Teilnehmer im Austausch.",
      caption: "Trainer + Peers · ein Raum",
      aspect: "wide",
    },
    D_peer_learning: {
      src: "",
      alt: "Peer-Learning unter angehenden Closern.",
      caption: "Peer-Learning",
      aspect: "wide",
    },
  },
  mos_lp_certification_image: {
    control: null,
    B_certificate_display: {
      src: "",
      alt: "Ethical Top Closer Zertifikat — Kompetenznachweis nach bestandener Prüfung.",
      caption: "Zertifikat folgt — echter Capture",
      aspect: "wide",
    },
  },
  mos_lp_call_simulation_image: {
    control: null,
    B_simulation_setup: {
      src: heroCompetenceAsset.url,
      alt: "Call-Simulation: Laptop, Headset, professionelles Setup.",
      caption: "Call-Simulation · realer Setup",
      aspect: "wide",
    },
    C_headset_focus: {
      src: heroCompetenceAsset.url,
      alt: "Fokussierter Closer mit Headset während einer Simulation.",
      caption: "Fokus · Ruhe · Klarheit",
      aspect: "wide",
    },
  },
  mos_lp_graduate_image: {
    control: null,
    B_alumni_portrait: {
      src: graduatePortraitAsset.url,
      alt: "Absolvent nach Abschluss der Ausbildung — ruhig, kompetent, professionell.",
      caption: "Nach der Ausbildung · einsatzbereit",
      aspect: "portrait",
    },
    C_alumni_in_role: {
      src: heroCompetenceAsset.url,
      alt: "Absolvent in seiner ersten Closer-Rolle.",
      caption: "Im Einsatz · echte Karriere",
      aspect: "wide",
    },
  },
  mos_lp_transformation_image: {
    control: null,
    B_before_after: {
      src: transformationAsset.url,
      alt: "Vorher und nachher: vom unsicheren Suchenden zum vorbereiteten Verkäufer.",
      caption: "Entwicklung sichtbar · keine Inszenierung",
      aspect: "wide",
    },
    C_after_only_professional: {
      src: graduatePortraitAsset.url,
      alt: "Nach der Entwicklung: vorbereiteter, professioneller Verkäufer.",
      caption: "Das Ergebnis",
      aspect: "portrait",
    },
  },
};

/** All slot IDs — exported for dashboards/tests. */
export const MOS_IMAGE_SLOT_IDS: readonly string[] = MOS_IMAGE_SLOTS.map(
  (s) => s.slot,
);
