/**
 * Phase 9.3 — Human Proof & Visual Trust slot registry.
 * Phase 9.4 — Image-quality optimization (ADDITIVE).
 *
 * 100% additive on top of Phase 9.2/9.3. The slot definitions, variant ids,
 * Thompson Sampling, `force_slot`, `ab_slot_weights`, Winner Engine and
 * Harm Guard remain UNCHANGED — Phase 9.4 only swaps the rendered image
 * assets so:
 *
 *   1) Each slot has 4 visually distinct variants (Hero also keeps a
 *      hard-coded fallback for control via the resolver, see
 *      `MosImageSlot.tsx` / `HeroBackgroundLayer.tsx`).
 *   2) NO image is reused across two different slots. Each variant has
 *      a 1:1 asset mapping under `src/assets/lp-proof-p94/*.jpg`.
 *   3) Community / Graduate / Certification render real people; the
 *      Ethical Top Closer certificate is uniformly issued to
 *      "Alexej Smirnov".
 *   4) Imagery is bound to the canonical vocabulary
 *      (competence · career · professionalism · development · mastery)
 *      and avoids the forbidden tropes (luxury · lambo · laptop on
 *      beach · remote-lifestyle · high-ticket flexing · money stacks),
 *      enforced by `mos-phase93-human-proof.test.ts`.
 *
 * Rollback (any one):
 *   - `CRO_ENABLED = false` → every slot returns control.
 *   - Zero the weights of `mos_*_proof` rows in `ab_slot_weights`.
 *   - Remove the `<MosHumanProofRail />` mount in `MasterOfSales.tsx`.
 *   - Per-slot revert: change a variant's `src` line back to the
 *     Phase 9.3 import (kept in git history for the previous commit).
 *
 * No CRM / quiz / booking / Calendly / auth / routing / schema / tracking
 * schema change. Reuses existing `trackFunnelEvent` channel only.
 */
import type { AbSlotDef } from "@/lib/ab-multivariant";
import type { ImageVariantCopy } from "@/lib/mos-image-slots";

// ─── Phase 9.4 — one asset per variant. NO cross-slot reuse. ──────────────
// Hero (mos_hero_human_proof)
import heroConversation from "@/assets/lp-proof-p94/hero-B-conversation.jpg.asset.json";
import heroPreparation from "@/assets/lp-proof-p94/hero-C-preparation.jpg.asset.json";
import heroCoaching from "@/assets/lp-proof-p94/hero-D-coaching.jpg.asset.json";
import heroHybrid from "@/assets/lp-proof-p94/hero-E-hybrid.jpg.asset.json";

// Training (mos_training_proof)
import trainingLiveCoaching from "@/assets/lp-proof-p94/training-B-roleplay-v3.jpg.asset.json";
import trainingRoleplay from "@/assets/lp-proof-p94/training-C-roleplay-v4.jpg.asset.json";
import trainingScreenReview from "@/assets/lp-proof-p94/training-D-screen-review.jpg.asset.json";
import trainingGroup from "@/assets/lp-proof-p94/training-E-training-group.jpg.asset.json";

// Community (mos_community_proof)
import communityZoom from "@/assets/lp-proof-p94/community-zoom-v5.png.asset.json";
import communityLiveRoom from "@/assets/lp-proof-p94/community-C-live-training-room.jpg.asset.json";
import communityDiscussion from "@/assets/lp-proof-p94/community-D-discussion.jpg.asset.json";
import communityPeer from "@/assets/lp-proof-p94/community-E-peer-learning.jpg.asset.json";

// Graduate (mos_graduate_proof)
import graduateCertified from "@/assets/lp-proof-p94/graduate-B-certified.jpg.asset.json";
import graduateMultiple from "@/assets/lp-proof-p94/graduate-C-multiple.jpg.asset.json";
import graduateWall from "@/assets/lp-proof-p94/graduate-D-success-wall.jpg.asset.json";
import graduateAlumni from "@/assets/lp-proof-p94/graduate-E-alumni.jpg.asset.json";

// Certification (mos_certification_proof) — all feature "Alexej Smirnov"
import certLarge from "@/assets/lp-proof-p94/cert-B-large.jpg.asset.json";
import certWithPerson from "@/assets/lp-proof-p94/cert-C-with-person.jpg.asset.json";
import certMilestone from "@/assets/lp-proof-p94/cert-D-milestone.jpg.asset.json";
import certShowcase from "@/assets/lp-proof-p94/cert-E-showcase.jpg.asset.json";

// Transformation (mos_transformation_proof)
import transformBeforeAfter from "@/assets/lp-proof-p94/transform-B-before-after-v3.jpg.asset.json";
import transformJourney from "@/assets/lp-proof-p94/transform-C-journey.jpg.asset.json";
import transformTimeline from "@/assets/lp-proof-p94/transform-D-timeline.jpg.asset.json";
import transformCompetence from "@/assets/lp-proof-p94/transform-E-competence.jpg.asset.json";

// ─── Slot defs ───────────────────────────────────────────────────────────
export const MOS_HERO_HUMAN_PROOF: AbSlotDef = {
  slot: "mos_hero_human_proof",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_conversation", baseWeight: 1 },
    { id: "C_preparation", baseWeight: 1 },
    { id: "D_coaching", baseWeight: 1 },
    { id: "E_hybrid", baseWeight: 1 },
  ],
};

export const MOS_TRAINING_PROOF: AbSlotDef = {
  slot: "mos_training_proof",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_live_coaching", baseWeight: 1 },
    { id: "C_roleplay", baseWeight: 1 },
    { id: "D_screen_review", baseWeight: 1 },
    { id: "E_training_group", baseWeight: 1 },
  ],
};

export const MOS_COMMUNITY_PROOF: AbSlotDef = {
  slot: "mos_community_proof",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_zoom_group", baseWeight: 1 },
    { id: "C_live_training_room", baseWeight: 1 },
    { id: "D_community_discussion", baseWeight: 1 },
    { id: "E_peer_learning", baseWeight: 1 },
  ],
};

export const MOS_GRADUATE_PROOF: AbSlotDef = {
  slot: "mos_graduate_proof",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_certified_graduate", baseWeight: 1 },
    { id: "C_multiple_graduates", baseWeight: 1 },
    { id: "D_success_wall", baseWeight: 1 },
    { id: "E_alumni_community", baseWeight: 1 },
  ],
};

export const MOS_CERTIFICATION_PROOF: AbSlotDef = {
  slot: "mos_certification_proof",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_large_certificate", baseWeight: 1 },
    { id: "C_certificate_with_person", baseWeight: 1 },
    { id: "D_certificate_milestone", baseWeight: 1 },
    { id: "E_certification_showcase", baseWeight: 1 },
  ],
};

export const MOS_TRANSFORMATION_PROOF: AbSlotDef = {
  slot: "mos_transformation_proof",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "B_before_after", baseWeight: 1 },
    { id: "C_learning_journey", baseWeight: 1 },
    { id: "D_skill_timeline", baseWeight: 1 },
    { id: "E_competence_evolution", baseWeight: 1 },
  ],
};

export const MOS_HUMAN_PROOF_SLOTS: readonly AbSlotDef[] = [
  MOS_HERO_HUMAN_PROOF,
  MOS_TRAINING_PROOF,
  MOS_COMMUNITY_PROOF,
  MOS_GRADUATE_PROOF,
  MOS_CERTIFICATION_PROOF,
  MOS_TRANSFORMATION_PROOF,
] as const;

export const MOS_HUMAN_PROOF_SLOT_IDS: readonly string[] =
  MOS_HUMAN_PROOF_SLOTS.map((s) => s.slot);

export const MOS_HUMAN_PROOF_FALLBACK_VARIANT_BY_SLOT: Record<string, string> = {
  mos_hero_human_proof: "D_coaching",
  mos_training_proof: "B_live_coaching",
  mos_community_proof: "B_zoom_group",
  mos_graduate_proof: "B_certified_graduate",
  mos_certification_proof: "B_large_certificate",
  mos_transformation_proof: "B_before_after",
};

/**
 * Per-variant copy. Phase 9.4 mapping — every src is unique across slots.
 *
 * Every alt-text is constrained to the Phase 9.3 vocabulary:
 *   performance · competence · development · career · professionalism · mastery
 * Forbidden vocabulary is enforced by `mos-phase93-human-proof.test.ts`.
 */
export const MOS_HUMAN_PROOF_COPY: Record<
  string,
  Record<string, ImageVariantCopy | null>
> = {
  mos_hero_human_proof: {
    // Control is NEVER blank in the hero — falls back to D_coaching at
    // render time (see MosImageSlot.tsx / HeroBackgroundLayer.tsx).
    // Variant-id tracking is unaffected because Thompson Sampling still
    // picks control as a bucket; only the rendered <img> uses the fallback.
    control: null,
    B_conversation: {
      src: heroConversation.url,
      alt: "Professioneller Verkäufer im fokussierten Kundengespräch — ruhig, vorbereitet, kompetent.",
      caption: "Echtes Kundengespräch · keine Inszenierung",
      aspect: "wide",
    },
    C_preparation: {
      src: heroPreparation.url,
      alt: "Verkäufer in strukturierter Vorbereitung vor dem nächsten Discovery Call — Notizen, Kalender, Fokus.",
      caption: "Vorbereitung als Standard",
      aspect: "wide",
    },
    D_coaching: {
      src: heroCoaching.url,
      alt: "Senior Coach gibt strukturiertes Feedback an einen Junior — sichtbare Kompetenzentwicklung.",
      caption: "Direktes Coaching · echte Entwicklung",
      aspect: "wide",
    },
    E_hybrid: {
      src: heroHybrid.url,
      alt: "Verkäuferin im Live-Call mit Headset, Coach analysiert parallel die Gesprächsdaten — Anwendung trifft Entwicklung.",
      caption: "Gespräch + Coaching · ein Rahmen",
      aspect: "wide",
    },
  },
  mos_training_proof: {
    control: null,
    B_live_coaching: {
      src: trainingLiveCoaching.url,
      alt: "1:1 Live-Coaching — Trainerin reviewt einen echten Verkaufscall mit einem Teilnehmer.",
      caption: "Live-Coaching · echte Calls",
      aspect: "wide",
    },
    C_roleplay: {
      src: trainingRoleplay.url,
      alt: "Strukturiertes Verkaufs-Roleplay zwischen zwei Teilnehmern — tägliche Wiederholung.",
      caption: "Roleplay · tägliche Wiederholung",
      aspect: "wide",
    },
    D_screen_review: {
      src: trainingScreenReview.url,
      alt: "Screen-Review eines aufgezeichneten Verkaufsgesprächs — detailliertes, konkretes Feedback.",
      caption: "Screen-Review · konkretes Feedback",
      aspect: "wide",
    },
    E_training_group: {
      src: trainingGroup.url,
      alt: "Trainingsgruppe vor dem Whiteboard — gemeinsame Entwicklung am Verkaufsframework.",
      caption: "Trainingsgruppe · gemeinsame Entwicklung",
      aspect: "wide",
    },
  },
  mos_community_proof: {
    control: null,
    B_zoom_group: {
      src: communityZoom.url,
      alt: "Live-Gruppen-Session per Video — neun echte Teilnehmer in aktiver Diskussion.",
      caption: "Live-Gruppen-Session · wöchentlich",
      aspect: "wide",
    },
    C_live_training_room: {
      src: communityLiveRoom.url,
      alt: "Live-Trainingsraum mit Projektor und aufmerksamen Teilnehmern.",
      caption: "Live-Trainingsraum",
      aspect: "wide",
    },
    D_community_discussion: {
      src: communityDiscussion.url,
      alt: "Community-Diskussionskreis — sechs Profis im offenen Austausch zu realen Verkaufssituationen.",
      caption: "Community-Diskussion",
      aspect: "wide",
    },
    E_peer_learning: {
      src: communityPeer.url,
      alt: "Peer-Learning — zwei Paare reviewen Verkaufsgespräche gemeinsam, direktes Feedback unter Verantwortlichen.",
      caption: "Peer-Learning · Verantwortung",
      aspect: "wide",
    },
  },
  mos_graduate_proof: {
    control: null,
    B_certified_graduate: {
      src: graduateCertified.url,
      alt: "Zertifizierte Absolventin nach bestandener Prüfung — ruhige, professionelle Haltung, Gold-Akzent.",
      caption: "Zertifizierte Absolventin",
      aspect: "wide",
    },
    C_multiple_graduates: {
      src: graduateMultiple.url,
      alt: "Fünf diverse Absolventen einer Kohorte mit ihren gerahmten Zertifikaten — verschiedene Herkunft, ein Standard.",
      caption: "Eine Kohorte · viele Wege",
      aspect: "wide",
    },
    D_success_wall: {
      src: graduateWall.url,
      alt: "Wall of Graduates — gerahmte Portraits abgeschlossener Ausbildungen mit Namensschildern.",
      caption: "Wall of Graduates",
      aspect: "wide",
    },
    E_alumni_community: {
      src: graduateAlumni.url,
      alt: "Alumni-Netzwerk-Event — Absolventen verschiedener Generationen in aktiver Verbindung.",
      caption: "Alumni · in echten Rollen",
      aspect: "wide",
    },
  },
  mos_certification_proof: {
    control: null,
    B_large_certificate: {
      src: certLarge.url,
      alt: "Premium Ethical Top Closer Zertifikat ausgestellt auf Alexej Smirnov — Gold-Foil, Siegel, hochwertige Optik.",
      caption: "Echtes Zertifikat · lesbar",
      aspect: "wide",
    },
    C_certificate_with_person: {
      src: certWithPerson.url,
      alt: "Alexej Smirnov hält sein Ethical Top Closer Zertifikat — sichtbarer Kompetenznachweis.",
      caption: "Zertifikat in der Hand des Absolventen",
      aspect: "wide",
    },
    D_certificate_milestone: {
      src: certMilestone.url,
      alt: "Alexej Smirnov erhält das Ethical Top Closer Zertifikat auf der Bühne — Meilenstein der Ausbildung.",
      caption: "Meilenstein · klarer Abschluss",
      aspect: "wide",
    },
    E_certification_showcase: {
      src: certShowcase.url,
      alt: "Drei Zertifizierungsstufen ausgestellt auf Alexej Smirnov — strukturierte Qualifikation.",
      caption: "Zertifizierungsstufen",
      aspect: "wide",
    },
  },
  mos_transformation_proof: {
    control: null,
    B_before_after: {
      src: transformBeforeAfter.url,
      alt: "Vorher und nachher: vom unsicheren Suchenden zum vorbereiteten Verkäufer — gleiche Person, sichtbare Entwicklung.",
      caption: "Entwicklung sichtbar · keine Inszenierung",
      aspect: "wide",
    },
    C_learning_journey: {
      src: transformJourney.url,
      alt: "Lernweg in drei Etappen — vom ersten Tag bis zur sicheren Anwendung im Call.",
      caption: "Lernweg · Schritt für Schritt",
      aspect: "wide",
    },
    D_skill_timeline: {
      src: transformTimeline.url,
      alt: "Skill-Timeline einer Verkäuferin in drei Karriere-Stufen — Junior, Mid-Level, Senior.",
      caption: "Skill-Timeline",
      aspect: "wide",
    },
    E_competence_evolution: {
      src: transformCompetence.url,
      alt: "Kompetenz-Evolution: ruhiger, fokussierter Verkäufer — Mastery sichtbar in Haltung und Blick.",
      caption: "Kompetenz-Evolution",
      aspect: "wide",
    },
  },
};

export function resolveHumanProofImageCopy(
  slot: string,
  variantId: string,
): ImageVariantCopy | null {
  const copy = MOS_HUMAN_PROOF_COPY[slot]?.[variantId] ?? null;
  if (copy?.src) return copy;

  const fallbackVariant = MOS_HUMAN_PROOF_FALLBACK_VARIANT_BY_SLOT[slot];
  if (!fallbackVariant) return null;

  const fallback = MOS_HUMAN_PROOF_COPY[slot]?.[fallbackVariant] ?? null;
  return fallback?.src ? fallback : null;
}
