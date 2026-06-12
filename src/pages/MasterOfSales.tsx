import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { setApplyAudience } from "@/lib/apply-audience";
import { useAbSlot } from "@/hooks/useAbSlot";
import { useAbWeights } from "@/hooks/useAbWeights";
import { getActiveSlotSummary, getAbSlot } from "@/lib/ab-multivariant";
import HeroMosV2 from "@/components/masterofsales/HeroMosV2";
import HeroMosSimple from "@/components/masterofsales/HeroMosSimple";
import HeroMosZeroFriction from "@/components/masterofsales/HeroMosZeroFriction";
import HeroMosPsychology from "@/components/masterofsales/HeroMosPsychology";
import {
  MOS_SIMPLE_HERO,
  SIMPLE_HERO_COPY,
  SIMPLE_HERO_MICRO_TRUST,
  MOS_LP_ABOVE_FOLD_V2,
  MOS_LP_CTA_V2,
  MOS_LP_REMOVE_FRICTION,
  LP_ABOVE_FOLD_V2_COPY,
  LP_CTA_V2_COPY,
  LP_REMOVE_FRICTION_COPY,
  MOS_LP_ZERO_FRICTION_HERO,
  ZERO_FRICTION_HERO_COPY,
  MOS_LP_PSYCHOLOGY_HEADLINE,
  MOS_LP_PSYCHOLOGY_SUBLINE,
  MOS_LP_CTA_PSYCHOLOGY,
  MOS_LP_MICRO_TRUST_INLINE,
  LP_PSYCHOLOGY_HEADLINE_COPY,
  LP_PSYCHOLOGY_SUBLINE_COPY,
  LP_CTA_PSYCHOLOGY_COPY,
  LP_MICRO_TRUST_INLINE_COPY,
  MOS_END_RESULT_ANGLE,
  MOS_QUIZ_MICRO_COMMITMENT,
  MOS_QUIZ_MOTIVATION_ANGLE,
  QUIZ_MOTIVATION_ANGLE_COPY,
} from "@/lib/mos-cro-slots";

import { fireMosCroEvent } from "@/lib/mos-cro-events";
import { forwardTrackingParams } from "@/lib/forward-tracking-params";
import { recordIntentSignal } from "@/lib/mos-high-intent";
import MomentsStoryboard from "@/components/masterofsales/MomentsStoryboard";
import MasterOfSalesCtaPair from "@/components/masterofsales/MasterOfSalesCtaPair";
import TestimonialsAndFaq from "@/components/masterofsales/TestimonialsAndFaq";
import IdentificationStatement from "@/components/masterofsales/IdentificationStatement";
import CareerPathLadder from "@/components/masterofsales/CareerPathLadder";
import TrustMarkers from "@/components/masterofsales/TrustMarkers";
import SectionViewTracker from "@/components/masterofsales/SectionViewTracker";
import HeroTrustBlock from "@/components/masterofsales/HeroTrustBlock";
import EmotionalProofStrip from "@/components/masterofsales/EmotionalProofStrip";

import ShowUpPsychologyBlock from "@/components/masterofsales/ShowUpPsychologyBlock";
import RoadmapManifestBar from "@/components/masterofsales/RoadmapManifestBar";
import TrustAcceleratorsBlock from "@/components/masterofsales/TrustAcceleratorsBlock";
import OriginFounderBlock from "@/components/masterofsales/OriginFounderBlock";
import TopPerformerVaultPreview from "@/components/masterofsales/TopPerformerVaultPreview";
import LivePlatformDemo from "@/components/masterofsales/LivePlatformDemo";
import RealPlatformPreview from "@/components/masterofsales/RealPlatformPreview";
import MosImageProofRail from "@/components/masterofsales/MosImageProofRail";
import MosHumanProofRail from "@/components/masterofsales/MosHumanProofRail";
import HeroHumanProofMount from "@/components/masterofsales/HeroHumanProofMount";
import HeroBackgroundLayer from "@/components/masterofsales/HeroBackgroundLayer";
import HeroMosConversion from "@/components/masterofsales/HeroMosConversion";
import RoadmapInsideStrip from "@/components/masterofsales/RoadmapInsideStrip";
import AiDifferentiationProof from "@/components/masterofsales/AiDifferentiationProof";
import PlacementProcessStrip from "@/components/masterofsales/PlacementProcessStrip";
import ValueStackBlock, { type ValueStackOrder } from "@/components/masterofsales/ValueStackBlock";
import RiskReversalBlock from "@/components/masterofsales/RiskReversalBlock";
import BonusStackBlock from "@/components/masterofsales/BonusStackBlock";
import OutcomeTransformationStrip from "@/components/masterofsales/OutcomeTransformationStrip";
import RealTransformationProofBlock, {
  type ProofHeadlineVariant,
  type ProofMessageVariant,
} from "@/components/masterofsales/RealTransformationProofBlock";

import FirstWinMechanismBlock, {
  type FirstWinAngle,
} from "@/components/masterofsales/FirstWinMechanismBlock";
import ProgressSystemSection, {
  type ProgressMessage,
} from "@/components/masterofsales/ProgressSystemSection";
import ProgressControlBlock, {
  type ProgressControlMessage,
} from "@/components/masterofsales/ProgressControlBlock";
import QuizPreviewBlock from "@/components/masterofsales/QuizPreviewBlock";
import EndResultSection from "@/components/masterofsales/EndResultSection";
import QuizMicroCommitmentBlock from "@/components/masterofsales/QuizMicroCommitmentBlock";

import HeroClaritySubline from "@/components/masterofsales/HeroClaritySubline";
import IdentityRecognitionBlock from "@/components/masterofsales/IdentityRecognitionBlock";
import OutcomePreviewBlock from "@/components/masterofsales/OutcomePreviewBlock";
import DecisionMomentBlock from "@/components/masterofsales/DecisionMomentBlock";
import ProgressPreviewMini from "@/components/masterofsales/ProgressPreviewMini";
import {
  SystemProofBlock,
  RealityBlock,
  TransparencyBlock,
  ProcessProofBlock,
  EthicalTrustStrip,
  WhyExistsBlock,
  type RealityCopyVariant,
  type TransparencyAngle,
} from "@/components/masterofsales/trust-proof";
// Hero: emotionales Identifikations-Bild (golden hour · ruhige Selbstbestimmung).
// Apple × Loro Piana — holt die Zielgruppe positiv ab, ohne Luxus-Bro-Tropes.
import heroImg from "@/assets/mos-hero-horizon.jpg";
import focusImg from "@/assets/mos-focus.jpg";
import autonomyImg from "@/assets/mos-autonomy.jpg";
import structureImg from "@/assets/mos-structure.jpg";
import directionImg from "@/assets/mos-direction.jpg";
import heroHorizonImg from "@/assets/mos-hero-horizon.jpg";

// Canonical men-funnel quiz entry — unchanged. CTAs MUST route through the
// quiz first; /booking-men is only reachable after a completed quiz.
const MEN_QUIZ_PATH = "/apply/quiz?aud=men";

// ---------------------------------------------------------------------------
// Auto-A/B Slots — beliebige Varianten pro Slot, gewichtet vom Server.
// Holdout-Varianten (alte Texte) bleiben als low-weight Baselines erhalten.
// Neue Varianten verschieben die Botschaft Richtung Creative-Match:
//   Richtung · Potenzial · Entwicklung · Freiheit · Selbstbestimmung.
// ---------------------------------------------------------------------------
const HERO_HEADLINE_SLOT = {
  slot: "mos_hero_headline",
  variants: [
    // Neue, Creative-aligned Varianten (volles Gewicht)
    { id: "richtung", baseWeight: 1 },
    { id: "umfeld", baseWeight: 1 },
    { id: "moderne_karriere", baseWeight: 1 },
    { id: "freiheit_richtung", baseWeight: 1 },
    { id: "potenzial_sichtbar", baseWeight: 1 },
    { id: "naechste_stufe", baseWeight: 1 },
    // Creative-Hook-Test A/B/C/D — direkter Spiegel der Ads.
    { id: "hook_a_mehr_moeglich", baseWeight: 1.2 },
    { id: "hook_b_richtung_statt_motivation", baseWeight: 1.2 },
    { id: "hook_c_entwicklung_statt_stillstand", baseWeight: 1.2 },
    { id: "hook_d_moderne_faehigkeiten", baseWeight: 1.2 },
    // Brief Hooks E/F — additiv, gleichgewichtet wie A–D.
    { id: "hook_e_richtung_statt_motivation_punkt", baseWeight: 1.0 },
    { id: "hook_f_alltag_brechen", baseWeight: 1.0 },
    // Holdouts (alte Headlines, niedriger gewichtet)
    { id: "legacy_a", baseWeight: 0.25 },
    { id: "legacy_b", baseWeight: 0.25 },
  ],
} as const;

const HERO_HEADLINE_COPY: Record<string, string> = {
  richtung: "Vielleicht ist heute der Moment, an dem sich deine Richtung ändert.",
  umfeld: "Ein Umfeld für Männer, die spüren, dass mehr möglich ist.",
  moderne_karriere: "Moderne Karriere. Echte Fähigkeiten. Eigene Richtung.",
  freiheit_richtung:
    "Mehr Freiheit beginnt nicht mit Geld — sondern mit einer Richtung, die zu dir passt.",
  potenzial_sichtbar:
    "Dein Potenzial ist nicht das Problem. Es fehlt nur ein Weg, der es sichtbar macht.",
  naechste_stufe: "Vielleicht ist das die nächste Stufe, die du gesucht hast.",
  hook_a_mehr_moeglich: "Du weißt, dass mehr möglich ist.",
  hook_b_richtung_statt_motivation:
    "Vielleicht fehlt dir nicht Motivation — vielleicht fehlt dir Richtung.",
  hook_c_entwicklung_statt_stillstand: "Entwicklung statt Stillstand.",
  hook_d_moderne_faehigkeiten:
    "Moderne Fähigkeiten schaffen moderne Freiheit.",
  hook_e_richtung_statt_motivation_punkt:
    "Vielleicht fehlt dir nicht Motivation. Vielleicht fehlt dir Richtung.",
  hook_f_alltag_brechen: "Du musst nicht im selben Alltag bleiben.",
  legacy_a: "Nicht jeder ist für High-Ticket Sales gemacht.",
  legacy_b: "Die meisten wollen mehr. Die wenigsten liefern dafür.",
};


const HERO_SUB_SLOT = {
  slot: "mos_hero_sub",
  variants: [
    { id: "kein_hype", baseWeight: 1 },
    { id: "echte_faehigkeiten", baseWeight: 1 },
    { id: "entwicklung_statt_pitch", baseWeight: 1 },
    { id: "selbstbestimmung_alltag", baseWeight: 1 },
  ],
} as const;

const HERO_SUB_COPY: Record<string, string> = {
  kein_hype:
    "Kein Hype. Kein Druck. Ein klarer Weg, dein Potenzial in echte Fähigkeiten zu übersetzen.",
  echte_faehigkeiten:
    "Ein ruhiger Karriereweg statt eines lauten Angebots. Für Menschen, die langfristig wachsen wollen.",
  entwicklung_statt_pitch:
    "Kein Pitch. Kein Verkaufsdruck. Nur Entwicklung — Schritt für Schritt, in deinem Tempo.",
  selbstbestimmung_alltag:
    "Ein Alltag, den du selbst gestaltest. Mit einem Umfeld, das mitwächst, statt dich zu führen.",
};

const PRIMARY_CTA_SLOT = {
  slot: "mos_primary_cta",
  variants: [
    { id: "naechster_schritt", baseWeight: 1 },
    { id: "potenzial_pruefen", baseWeight: 1 },
    { id: "perspektive_ansehen", baseWeight: 1 },
    { id: "moeglichkeiten_entdecken", baseWeight: 1 },
    { id: "potenzial_entdecken", baseWeight: 1 },
    { id: "richtung_ansehen", baseWeight: 1 },
  ],
} as const;

// Canonical CTA label — alle Primary/Closing/MidPage/Sticky CTAs zeigen denselben Text.
// A/B-Slot-Routing bleibt unverändert (Varianten-IDs werden weiter getrackt).
const CANONICAL_CTA_LABEL = "Passt eine Karriere als Closer zu mir?";

const PRIMARY_CTA_COPY: Record<string, string> = {
  naechster_schritt: CANONICAL_CTA_LABEL,
  potenzial_pruefen: CANONICAL_CTA_LABEL,
  perspektive_ansehen: CANONICAL_CTA_LABEL,
  moeglichkeiten_entdecken: CANONICAL_CTA_LABEL,
  potenzial_entdecken: CANONICAL_CTA_LABEL,
  richtung_ansehen: CANONICAL_CTA_LABEL,
};

const CLOSING_CTA_SLOT = {
  slot: "mos_closing_cta",
  variants: [
    { id: "ob_es_passt", baseWeight: 1 },
    { id: "ehrlich_herausfinden", baseWeight: 1 },
    { id: "richtung_pruefen", baseWeight: 1 },
  ],
} as const;

const CLOSING_CTA_COPY: Record<string, string> = {
  ob_es_passt: CANONICAL_CTA_LABEL,
  ehrlich_herausfinden: CANONICAL_CTA_LABEL,
  richtung_pruefen: CANONICAL_CTA_LABEL,
};

// Neue Slots — Eyebrow, Micro-Trust, Hero-Bild.
const HERO_EYEBROW_SLOT = {
  slot: "mos_hero_eyebrow",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "richtung_entwicklung", baseWeight: 1 },
    { id: "freiheit_potenzial", baseWeight: 1 },
    { id: "moderner_weg", baseWeight: 1 },
  ],
} as const;

const HERO_EYEBROW_COPY: Record<string, string> = {
  control: "Master of Sales · Karriereweg für ambitionierte Männer",
  richtung_entwicklung: "Richtung · Entwicklung · Selbstbestimmung",
  freiheit_potenzial: "Freiheit · Potenzial · Echte Fähigkeiten",
  moderner_weg: "Ein moderner Weg für Männer, die mehr wollen",
};

const HERO_MICROTRUST_SLOT = {
  slot: "mos_hero_microtrust",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "selbstcheck", baseWeight: 1 },
    { id: "standortbestimmung", baseWeight: 1 },
  ],
} as const;

const HERO_MICROTRUST_COPY: Record<string, string> = {
  control: "60 Sekunden · unverbindliche Standortbestimmung",
  selbstcheck: "2 Minuten · ehrlicher Selbstcheck",
  standortbestimmung: "Kurzer Selbstcheck · ohne Bewerbung · ohne Druck",
};

const HERO_IMAGE_SLOT = {
  slot: "mos_hero_image",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "focus", baseWeight: 1 },
    { id: "direction", baseWeight: 1 },
  ],
} as const;

const HERO_IMAGE_MAP: Record<string, string> = {
  // Unified emotionales Hero-Bild für alle Varianten. AB-Slot bleibt für spätere Tests aktiv.
  control: heroHorizonImg,
  focus: heroHorizonImg,
  direction: heroHorizonImg,
};

// Offer-Composition Slots (additiv, je 2 Varianten — Brief-Vorgabe).
const VALUE_STACK_ORDER_SLOT = {
  slot: "mos_value_stack_order",
  variants: [
    { id: "methode_first", baseWeight: 1 },
    { id: "community_first", baseWeight: 1 },
  ],
} as const;

const RISK_REVERSAL_POSITION_SLOT = {
  slot: "mos_risk_reversal_position",
  variants: [
    { id: "before_bonus", baseWeight: 1 },
    { id: "after_bonus", baseWeight: 1 },
  ],
} as const;

const SOCIAL_PROOF_POSITION_SLOT = {
  slot: "mos_social_proof_position",
  variants: [
    { id: "proof_before_value", baseWeight: 1 },
    { id: "proof_after_value", baseWeight: 1 },
  ],
} as const;

// Real Proof + First-Win Slots (additiv, je 2 Varianten — Brief-Vorgabe).
const PROOF_ASSET_POSITION_SLOT = {
  slot: "mos_proof_asset_position",
  variants: [
    { id: "after_value_stack", baseWeight: 1 },
    { id: "before_final_cta", baseWeight: 1 },
  ],
} as const;

const FIRST_WIN_ANGLE_SLOT = {
  slot: "mos_first_win_angle",
  variants: [
    { id: "direction", baseWeight: 1 },
    { id: "strength", baseWeight: 1 },
  ],
} as const;

const PROOF_MESSAGE_SLOT = {
  slot: "mos_proof_message",
  variants: [
    { id: "uncertainty_to_confidence", baseWeight: 1 },
    { id: "no_sales_type_needed", baseWeight: 1 },
  ],
} as const;

const FIRST_WIN_CTA_SLOT = {
  slot: "mos_first_win_cta",
  variants: [
    { id: "direction_label", baseWeight: 1 },
    { id: "potential_label", baseWeight: 1 },
  ],
} as const;

// Progress System Slots (additiv, je 2 Varianten — Brief-Vorgabe).
const PROGRESS_POSITION_SLOT = {
  slot: "mos_progress_section_position",
  variants: [
    { id: "after_value_stack", baseWeight: 1 },
    { id: "before_first_win", baseWeight: 1 },
  ],
} as const;

const PROGRESS_MESSAGE_SLOT = {
  slot: "mos_progress_message",
  variants: [
    { id: "clear_path", baseWeight: 1 },
    { id: "unlock_levels", baseWeight: 1 },
  ],
} as const;

// Progress CONTROL Block — additive Positionierung "Dein Fortschritt hängt nicht von Bauchgefühl ab."
const PROGRESS_CONTROL_POSITION_SLOT = {
  slot: "mos_progress_control_position",
  variants: [
    { id: "inside_progress", baseWeight: 1 },
    { id: "before_first_win", baseWeight: 1 },
  ],
} as const;

const PROGRESS_CONTROL_MESSAGE_SLOT = {
  slot: "mos_progress_control_message",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "ownership", baseWeight: 1 },
  ],
} as const;

const FIRST_WIN_CTA_COPY: Record<string, string> = {
  direction_label: CANONICAL_CTA_LABEL,
  potential_label: CANONICAL_CTA_LABEL,
};

// ─── CRO Gap Closure (Problem 1 + 4) — additive A/B Slots ────────────────────
// Quiz-CTA Reframing: behält Canonical Label als Control (A_canonical),
// testet "Potenzial-Analyse starten" + "Meinen nächsten Schritt finden".
const QUIZ_CTA_ANGLE_SLOT = {
  slot: "mos_quiz_cta_angle",
  variants: [
    { id: "A_canonical", baseWeight: 1 },
    { id: "B_potenzial", baseWeight: 1 },
    { id: "C_naechster_schritt", baseWeight: 1 },
    // Phase 9.5 — Conversion-First CTA variants (additive).
    { id: "D_eignung", baseWeight: 1.2 },
    { id: "E_karriereweg", baseWeight: 1 },
    { id: "F_assessment", baseWeight: 1 },
    { id: "G_passt", baseWeight: 1 },
    { id: "H_2min", baseWeight: 1 },
  ],
} as const;

const QUIZ_CTA_ANGLE_COPY: Record<string, string> = {
  A_canonical: CANONICAL_CTA_LABEL,
  B_potenzial: "Potenzial-Analyse starten",
  C_naechster_schritt: "Meinen nächsten Schritt finden",
  // Phase 9.5 — Conversion-First CTA copy.
  D_eignung: "Closing-Eignung prüfen",
  E_karriereweg: "Karriereweg prüfen",
  F_assessment: "Kostenloses Assessment starten",
  G_passt: "Passt Closing zu dir?",
  H_2min: "In 2 Minuten herausfinden",
};

// Quiz-Preview Friction-Chip A/B: Dauer vs. Fragenzahl.
const QUIZ_PREVIEW_SLOT = {
  slot: "mos_quiz_preview",
  variants: [
    { id: "3min", baseWeight: 1 },
    { id: "7questions", baseWeight: 1 },
  ],
} as const;

// Mid-CTA Position A/B: bestehende Positionen vs. zusätzlicher CTA nach Progress.
const MID_CTA_POSITION_SLOT = {
  slot: "mos_mid_cta_position",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "after_progress", baseWeight: 1 },
  ],
} as const;

// ─── Clarity-Reframe (Quiz = Diagnose, kein Pitch) — additive Slots, je 2 Var.
const HERO_CLARITY_SLOT = {
  slot: "mos_hero_clarity",
  variants: [
    { id: "A", baseWeight: 1 },
    { id: "B", baseWeight: 1 },
  ],
} as const;

const IDENTITY_BLOCK_SLOT = {
  slot: "mos_identity_block",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "alt", baseWeight: 1 },
  ],
} as const;

const OUTCOME_PREVIEW_SLOT = {
  slot: "mos_outcome_preview",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "alt", baseWeight: 1 },
  ],
} as const;

// Risk-Copy direkt unter jedem Quiz-CTA — ersetzt mikroTrust-Text NICHT, ergänzt ihn.
const RISK_COPY_SLOT = {
  slot: "mos_risk_copy",
  variants: [
    { id: "A", baseWeight: 1 },
    { id: "B", baseWeight: 1 },
  ],
} as const;

const RISK_COPY_TEXT: Record<string, string> = {
  A: "7 kurze Fragen · ca. 3 Minuten",
  B: "Kostenlos · unverbindlich · sofortiges Ergebnis",
};

// ── Trust & Proof Layer — additive Slots (max. 2 Varianten pro Slot) ──
const SYSTEM_PROOF_POSITION_SLOT = {
  slot: "mos_system_proof_position",
  variants: [
    { id: "after_progress", baseWeight: 1 },
    { id: "before_outcome_preview", baseWeight: 1 },
  ],
} as const;

const TRANSPARENCY_ANGLE_SLOT = {
  slot: "mos_transparency_angle",
  variants: [
    { id: "kontrolle", baseWeight: 1 },
    { id: "klarheit", baseWeight: 1 },
  ],
} as const;

const REALITY_COPY_SLOT = {
  slot: "mos_reality_copy",
  variants: [
    { id: "no_shortcut", baseWeight: 1 },
    { id: "no_promise", baseWeight: 1 },
  ],
} as const;

const ETHICS_STRIP_POSITION_SLOT = {
  slot: "mos_ethics_strip_position",
  variants: [
    { id: "before_first_cta", baseWeight: 1 },
    { id: "before_sticky_cta", baseWeight: 1 },
  ],
} as const;

// Sticky-CTA Label-Test (max. 2 Varianten gleichzeitig aktiv).
const STICKY_CTA_SLOT = {
  slot: "mos_sticky_cta",
  variants: [
    { id: "A_potenzial", baseWeight: 1 },
    { id: "B_naechster_schritt", baseWeight: 1 },
  ],
} as const;

const STICKY_CTA_COPY: Record<string, string> = {
  A_potenzial: "Potenzial-Analyse starten",
  B_naechster_schritt: "Meinen nächsten Schritt finden",
};

const PROOF_HEADLINE_BY_MESSAGE: Record<string, ProofHeadlineVariant> = {
  uncertainty_to_confidence: "uncertain",
  no_sales_type_needed: "decision",
};

const WATCHED_SLOTS = [
  "mos_hero_headline",
  "mos_hero_sub",
  "mos_primary_cta",
  "mos_closing_cta",
  "mos_hero_eyebrow",
  "mos_hero_microtrust",
  "mos_hero_image",
  "mos_emotional_proof",
  "mos_identification",
  "mos_value_stack_order",
  "mos_risk_reversal_position",
  "mos_social_proof_position",
  "mos_outcome_transformation",
  "mos_proof_asset_position",
  "mos_first_win_angle",
  "mos_proof_message",
  "mos_first_win_cta",
  "mos_progress_section_position",
  "mos_progress_message",
  "mos_progress_control_position",
  "mos_progress_control_message",
  "mos_quiz_cta_angle",
  "mos_quiz_preview",
  "mos_mid_cta_position",
  "mos_hero_clarity",
  "mos_identity_block",
  "mos_outcome_preview",
  "mos_risk_copy",
  "mos_sticky_cta",
  "mos_system_proof_position",
  "mos_transparency_angle",
  "mos_reality_copy",
  "mos_ethics_strip_position",
];

// Quietere, weichere Moment-Copy — weg von "Closer/KPI/fliegt raus".
const moments = [
  {
    img: focusImg,
    eyebrow: "01 — Fokus",
    promise: "Tiefe Arbeit",
    title: "Gespräche statt Lärm.",
    body:
      "Wenige, klare Gespräche. Ruhige Arbeit. Du siehst am Ende des Tages, was du wirklich bewegt hast — und kennst dich selbst dabei besser als vorher.",
  },
  {
    img: structureImg,
    eyebrow: "02 — Struktur",
    promise: "Klarheit als System",
    title: "Eine Woche, die einen Plan hat.",
    body:
      "Tiefe Arbeit, ehrliche Gespräche, echte Erholung. Dein Kalender wird zur Architektur deiner Entwicklung — nicht zur Liste fremder Termine.",
  },
  {
    img: autonomyImg,
    eyebrow: "03 — Verantwortung",
    promise: "Selbstbestimmung",
    title: "Du gestaltest deine Richtung.",
    body:
      "Keine Anwesenheitspflicht, keine Ausreden — aber auch kein Allein-Sein. Du übernimmst Verantwortung für deinen Weg und bekommst ein Umfeld, das mitträgt.",
  },
  {
    img: directionImg,
    eyebrow: "04 — Richtung",
    promise: "Karriereweg, kein Funnel",
    title: "Vom ersten Schritt zum nächsten.",
    body:
      "Jede Stufe ist klar definiert, jede Entwicklung sichtbar. Du weißt jederzeit, wo du stehst — und was die nächste Stufe von dir verlangt.",
  },
];

const FUNNEL_VIEW_SESSION_KEY = "mos_funnel_view_fired_v1";

/**
 * MOS LP V1 vs LP V2 — sticky multivariant slot (analog `home_hero_lp`).
 *
 * Resolved once per browser session (localStorage via `getAbSlot`). The
 * assignment automatically rides on every downstream funnel event as
 * `ab_slots: "mos_hero_lp:mos_vN"` via `getActiveSlotSummary()`, so the
 * existing Winner Engine / `ab-winner-rollup` picks the bucket up
 * without any tracking, CRM, pixel, attribution or DB change.
 *
 * Both variants start at equal base weight; auto-rollup shifts weight
 * toward the winner using the canonical reward formula. The hero is the
 * ONLY surface that differs — every CTA, tracking handler, quiz target
 * and downstream block stays identical.
 */
const MOS_HERO_SLOT = {
  slot: "mos_hero_lp",
  variants: [
    { id: "mos_v1", baseWeight: 0.5 },
    { id: "mos_v2", baseWeight: 0.5 },
  ],
} as const;

/**
 * Force-override for QA/preview: `?mos=v1` or `?mos=v2` overrides the
 * sticky allocation for THIS session only and marks the session via
 * sessionStorage. Forced sessions DO NOT emit `experiment_exposure`, so
 * the rollup never counts them.
 */
function readForcedMosHeroVariant(): "mos_v1" | "mos_v2" | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("mos");
    if (q === "v1" || q === "v2") {
      const variant = q === "v2" ? "mos_v2" : "mos_v1";
      sessionStorage.setItem("etc:mos_force_variant", variant);
      return variant;
    }
    const stored = sessionStorage.getItem("etc:mos_force_variant");
    if (stored === "mos_v1" || stored === "mos_v2") return stored;
  } catch {
    /* ignore */
  }
  return null;
}

const MasterOfSales = () => {
  // Server-Gewichte einmal pro 6h holen (additive, no flicker for existing buckets).
  useAbWeights(WATCHED_SLOTS);

  // LP V1 vs LP V2 — sticky bucket + force-param override (?mos=v1|v2).
  // Forced sessions are EXCLUDED from `experiment_exposure` to keep
  // rollup KPIs clean for QA/preview traffic.
  const mosHeroBucket = useMemo(
    () =>
      getAbSlot(
        MOS_HERO_SLOT as unknown as { slot: string; variants: { id: string; baseWeight?: number }[] },
      ),
    [],
  );
  const forcedMosHeroVariant = useMemo(() => readForcedMosHeroVariant(), []);
  const effectiveMosHeroVariant = forcedMosHeroVariant ?? mosHeroBucket.variant;
  const isMosV2 = effectiveMosHeroVariant === "mos_v2";
  const isMosHeroForced = forcedMosHeroVariant !== null;

  const mosExposureFired = useRef(false);
  useEffect(() => {
    if (mosExposureFired.current) return;
    mosExposureFired.current = true;
    if (typeof window === "undefined") return;
    if (isMosHeroForced) return;
    const key = `exposure_fired_${MOS_HERO_SLOT.slot}_v1`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* dedupe is best-effort; rollup dedupes by session_id */
    }
    try {
      void trackFunnelEvent("experiment_exposure", {
        funnel: "masterofsales",
        experiment_id: MOS_HERO_SLOT.slot,
        variant: mosHeroBucket.variant,
        ab_slots: `${MOS_HERO_SLOT.slot}:${mosHeroBucket.variant}`,
        page_path: "/masterofsales",
      });
    } catch {
      /* never throw */
    }
  }, [mosHeroBucket.variant, isMosHeroForced]);


  const heroHeadline = useAbSlot(HERO_HEADLINE_SLOT);
  const heroSub = useAbSlot(HERO_SUB_SLOT);
  const primaryCta = useAbSlot(PRIMARY_CTA_SLOT);
  const closingCta = useAbSlot(CLOSING_CTA_SLOT);
  const heroEyebrow = useAbSlot(HERO_EYEBROW_SLOT);
  const heroMicroTrust = useAbSlot(HERO_MICROTRUST_SLOT);
  const heroImage = useAbSlot(HERO_IMAGE_SLOT);
  const valueStackOrder = useAbSlot(VALUE_STACK_ORDER_SLOT);
  const riskReversalPosition = useAbSlot(RISK_REVERSAL_POSITION_SLOT);
  const socialProofPosition = useAbSlot(SOCIAL_PROOF_POSITION_SLOT);
  const proofAssetPosition = useAbSlot(PROOF_ASSET_POSITION_SLOT);
  const firstWinAngle = useAbSlot(FIRST_WIN_ANGLE_SLOT);
  const proofMessage = useAbSlot(PROOF_MESSAGE_SLOT);
  const firstWinCta = useAbSlot(FIRST_WIN_CTA_SLOT);
  const progressPosition = useAbSlot(PROGRESS_POSITION_SLOT);
  const progressMessage = useAbSlot(PROGRESS_MESSAGE_SLOT);
  const progressControlPosition = useAbSlot(PROGRESS_CONTROL_POSITION_SLOT);
  const progressControlMessage = useAbSlot(PROGRESS_CONTROL_MESSAGE_SLOT);
  const quizCtaAngle = useAbSlot(QUIZ_CTA_ANGLE_SLOT);
  const quizPreview = useAbSlot(QUIZ_PREVIEW_SLOT);
  const midCtaPosition = useAbSlot(MID_CTA_POSITION_SLOT);
  const heroClarity = useAbSlot(HERO_CLARITY_SLOT);
  const identityBlock = useAbSlot(IDENTITY_BLOCK_SLOT);
  const outcomePreview = useAbSlot(OUTCOME_PREVIEW_SLOT);
  const riskCopy = useAbSlot(RISK_COPY_SLOT);
  const stickyCta = useAbSlot(STICKY_CTA_SLOT);
  const systemProofPosition = useAbSlot(SYSTEM_PROOF_POSITION_SLOT);
  const transparencyAngle = useAbSlot(TRANSPARENCY_ANGLE_SLOT);
  const realityCopy = useAbSlot(REALITY_COPY_SLOT);
  const ethicsStripPosition = useAbSlot(ETHICS_STRIP_POSITION_SLOT);
  const transparencyAngleVariant = (transparencyAngle.variant === "klarheit"
    ? "klarheit"
    : "kontrolle") as TransparencyAngle;
  const realityCopyVariant = (realityCopy.variant === "no_promise"
    ? "no_promise"
    : "no_shortcut") as RealityCopyVariant;
  const heroClarityVariant = (heroClarity.variant === "B" ? "B" : "A") as "A" | "B";
  const identityBlockVariant = (identityBlock.variant === "alt" ? "alt" : "control") as "control" | "alt";
  const outcomePreviewVariant = (outcomePreview.variant === "alt" ? "alt" : "control") as "control" | "alt";
  const riskCopyText = RISK_COPY_TEXT[riskCopy.variant] ?? RISK_COPY_TEXT.A;
  const stickyCtaLabel = STICKY_CTA_COPY[stickyCta.variant] ?? STICKY_CTA_COPY.A_potenzial;
  const quizPreviewVariant = (quizPreview.variant === "7questions"
    ? "7questions"
    : "3min") as "3min" | "7questions";
  // Phase 9.7 — additive narrative slots. All default to "control" (invisible).
  const endResultAngle = useAbSlot(MOS_END_RESULT_ANGLE);
  const quizMicroCommitment = useAbSlot(MOS_QUIZ_MICRO_COMMITMENT);
  const quizMotivationAngle = useAbSlot(MOS_QUIZ_MOTIVATION_ANGLE);
  const motivationCtaOverride =
    QUIZ_MOTIVATION_ANGLE_COPY[quizMotivationAngle.variant] ?? null;
  const heroQuizCtaText =
    motivationCtaOverride ??
    QUIZ_CTA_ANGLE_COPY[quizCtaAngle.variant] ??
    CANONICAL_CTA_LABEL;

  const progressMessageVariant = progressMessage.variant as ProgressMessage;
  const progressControlMessageVariant =
    progressControlMessage.variant as ProgressControlMessage;
  const progressBlock = (
    <ProgressSystemSection message={progressMessageVariant}>
      {progressControlPosition.variant === "inside_progress" && (
        <ProgressControlBlock
          message={progressControlMessageVariant}
          variant="embedded"
        />
      )}
    </ProgressSystemSection>
  );

  const proofMessageVariant = proofMessage.variant as ProofMessageVariant;
  const proofHeadlineVariant =
    PROOF_HEADLINE_BY_MESSAGE[proofMessageVariant] ?? "uncertain";
  const firstWinAngleVariant = firstWinAngle.variant as FirstWinAngle;
  const firstWinCtaLabel =
    FIRST_WIN_CTA_COPY[firstWinCta.variant] ?? FIRST_WIN_CTA_COPY.direction_label;
  const realProofBlock = (
    <RealTransformationProofBlock
      headlineVariant={proofHeadlineVariant}
      messageVariant={proofMessageVariant}
    />
  );

  // Idempotency guards — verhindern Doppelauslösung bei Mobile Double-Tap.
  const heroCtaFiredRef = useRef(false);
  const closingCtaFiredRef = useRef(false);

  // Param-Forwarding nur einmal pro Render berechnen.
  const heroHref = useMemo(
    () => forwardTrackingParams(`${MEN_QUIZ_PATH}&source=masterofsales-hero`),
    [],
  );
  const closingHref = useMemo(
    () => forwardTrackingParams(`${MEN_QUIZ_PATH}&source=masterofsales-closing`),
    [],
  );

  useEffect(() => {
    document.title = "Master of Sales — Karriereweg für ambitionierte Männer";
    // Stick audience cohort so /apply/quiz renders the men variant + post-quiz
    // routing falls into /booking-men. Sticky for 30d via localStorage.
    setApplyAudience("male_ambition");

    // Master Funnel Tracking v2 — ensure a stable funnel id exists from the
    // very first paint, so every downstream event (quiz, calendly, booking)
    // is correctly attributable + dedup-able. Pure additive: no behavior
    // change to existing events. Always-on, idempotent.
    void import("@/lib/master-funnel-id").then(({ ensureMasterFunnelId, markFunnelBooted }) => {
      ensureMasterFunnelId();
      if (markFunnelBooted()) {
        // First boot of this session — fire canonical MASTER_LP_VIEW.
        try { trackFunnelEvent("MASTER_LP_VIEW", { funnel: "masterofsales", aud: "men", src: "masterofsales" }); } catch { /* never throw */ }
        try { trackFunnelEvent("MASTER_FUNNEL_ID_CREATED", { funnel: "masterofsales", aud: "men" }); } catch { /* never throw */ }
      }
    });

    // Funnel-View nur einmal pro Session feuern (Back/Forward darf nicht
    // erneut PageView/Lead nach Meta spiegeln).
    let alreadyFired = false;
    try {
      alreadyFired = sessionStorage.getItem(FUNNEL_VIEW_SESSION_KEY) === "1";
    } catch {
      /* ignore — feuern dann eben pro Mount */
    }
    if (alreadyFired) return;
    try {
      sessionStorage.setItem(FUNNEL_VIEW_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }

    const ab_slots = getActiveSlotSummary();
    trackFunnelEvent("funnel_view", { funnel: "masterofsales", ab_slots });
    trackFunnelEvent("apply_view", { funnel: "masterofsales", ab_slots });
    trackFunnelEvent("masterofsales_view", { funnel: "masterofsales", ab_slots });
  }, []);


  // Scroll depth milestones — fire once per session per milestone.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const milestones = [25, 50, 75, 90] as const;
    const fired = new Set<number>();
    const SS_KEY = "mos_scroll_milestones_v1";
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) JSON.parse(raw).forEach((m: number) => fired.add(m));
    } catch {
      /* ignore */
    }
    const onScroll = () => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = (window.scrollY / total) * 100;
      for (const m of milestones) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          try {
            trackFunnelEvent(`scroll_${m}`, {
              page: "masterofsales",
              depth: m,
            });
          } catch {
            /* never throw */
          }
        }
      }
      try {
        sessionStorage.setItem(SS_KEY, JSON.stringify(Array.from(fired)));
      } catch {
        /* ignore */
      }
      if (fired.size === milestones.length) {
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const midCtaFiredRef = useRef<Record<string, boolean>>({});

  const fireQuizIntent = (source: string, ab_slots: string) => {
    // Additive Mirror-Events für Meta-Lernsignale. Bestehende Events bleiben.
    try {
      trackFunnelEvent("MASTEROFSALES_HERO_CTA_CLICK", {
        funnel: "masterofsales",
        source,
        ab_slots,
      });
      trackFunnelEvent("MASTEROFSALES_QUIZ_STARTED", {
        funnel: "masterofsales",
        source,
        ab_slots,
      });
      // Kanonische Kurz-Namen (Brief-Spec).
      trackFunnelEvent("MASTER_HERO_CTA", {
        funnel: "masterofsales",
        source,
        ab_slots,
      });
      trackFunnelEvent("MASTER_QUIZ_START", {
        funnel: "masterofsales",
        source,
        ab_slots,
      });
      // Brief-Spec canonical name (Problem 3).
      trackFunnelEvent("MASTER_QUIZ_STARTED", {
        funnel: "masterofsales",
        source,
        ab_slots,
      });
    } catch {
      /* never throw */
    }
    recordIntentSignal("hero_cta");
    recordIntentSignal("quiz_started");
  };

  const handleHeroCta = () => {
    if (heroCtaFiredRef.current) return;
    heroCtaFiredRef.current = true;
    const ab_slots = getActiveSlotSummary();
    // Brief-Spec canonical events (Micro-CRO Sprint).
    trackFunnelEvent("hero_cta_click", {
      page: "masterofsales",
      section: "hero",
    });
    trackFunnelEvent("cta_primary_click", {
      page: "masterofsales",
      section: "cta",
      source: "masterofsales-hero",
    });
    trackFunnelEvent("cta_click", {
      funnel: "masterofsales",
      cta: "primary",
      source: "masterofsales-hero",
      headline_variant: heroHeadline.variant,
      ab_slots,
    });
    trackFunnelEvent("masterofsales_cta_click", {
      funnel: "masterofsales",
      source: "masterofsales-hero",
      headline_variant: heroHeadline.variant,
      ab_slots,
    });
    trackFunnelEvent("mos_form_intent", {
      funnel: "masterofsales",
      source: "masterofsales-hero",
      ab_slots,
    });
    // Brief-Spec canonical alias — additiv, ersetzt nichts.
    try {
      trackFunnelEvent("MASTER_HERO_CLICK", {
        funnel: "masterofsales",
        source: "masterofsales-hero",
        headline_variant: heroHeadline.variant,
        ab_slots,
      });
    } catch {
      /* never throw */
    }
    fireQuizIntent("masterofsales-hero", ab_slots);
  };

  const handleClosingCta = () => {
    if (closingCtaFiredRef.current) return;
    closingCtaFiredRef.current = true;
    const ab_slots = getActiveSlotSummary();
    trackFunnelEvent("cta_primary_click", {
      page: "masterofsales",
      section: "cta",
      source: "masterofsales-closing",
    });
    trackFunnelEvent("cta_click", {
      funnel: "masterofsales",
      cta: "primary",
      source: "masterofsales-closing",
      ab_slots,
    });
    trackFunnelEvent("mos_form_intent", {
      funnel: "masterofsales",
      source: "masterofsales-closing",
      ab_slots,
    });
    fireQuizIntent("masterofsales-closing", ab_slots);
  };

  const handleMidCta = (slotName: string) => {
    if (midCtaFiredRef.current[slotName]) return;
    midCtaFiredRef.current[slotName] = true;
    const ab_slots = getActiveSlotSummary();
    trackFunnelEvent("cta_primary_click", {
      page: "masterofsales",
      section: "cta",
      source: `masterofsales-${slotName}`,
    });
    trackFunnelEvent("cta_click", {
      funnel: "masterofsales",
      cta: "mid",
      source: `masterofsales-${slotName}`,
      ab_slots,
    });
    trackFunnelEvent("mos_form_intent", {
      funnel: "masterofsales",
      source: `masterofsales-${slotName}`,
      ab_slots,
    });
    fireQuizIntent(`masterofsales-${slotName}`, ab_slots);
  };

  const eyebrowText =
    HERO_EYEBROW_COPY[heroEyebrow.variant] ?? HERO_EYEBROW_COPY.control;
  const microTrustText =
    HERO_MICROTRUST_COPY[heroMicroTrust.variant] ?? HERO_MICROTRUST_COPY.control;
  const heroImageSrc = HERO_IMAGE_MAP[heroImage.variant] ?? heroImg;
  const primaryCtaText =
    PRIMARY_CTA_COPY[primaryCta.variant] ?? PRIMARY_CTA_COPY.naechster_schritt;

  // ─── Ultra-Fast Sprint — additive LP overrides ─────────────────────────
  // When any of the three new LP slots resolves to a non-control variant,
  // we render the SimpleHero with the override copy. SimpleHero existing
  // behaviour is unchanged when all three are control AND mos_simple_hero
  // is also control.
  const lpAboveFold = useAbSlot(MOS_LP_ABOVE_FOLD_V2);
  const lpCtaV2 = useAbSlot(MOS_LP_CTA_V2);
  const lpRemoveFriction = useAbSlot(MOS_LP_REMOVE_FRICTION);
  const aboveFoldCopy = LP_ABOVE_FOLD_V2_COPY[lpAboveFold.variant] ?? null;
  const ctaV2Copy = LP_CTA_V2_COPY[lpCtaV2.variant] ?? null;
  const removeFrictionCopy = LP_REMOVE_FRICTION_COPY[lpRemoveFriction.variant] ?? null;

  useEffect(() => {
    if (aboveFoldCopy) fireMosCroEvent("MASTER_LP_ABOVE_FOLD_V2_VIEW", lpAboveFold.variant);
  }, [lpAboveFold.variant, aboveFoldCopy]);
  useEffect(() => {
    if (ctaV2Copy) fireMosCroEvent("MASTER_LP_CTA_V2_VIEW", lpCtaV2.variant);
  }, [lpCtaV2.variant, ctaV2Copy]);
  useEffect(() => {
    if (removeFrictionCopy) fireMosCroEvent("MASTER_LP_REMOVE_FRICTION_VIEW", lpRemoveFriction.variant);
  }, [lpRemoveFriction.variant, removeFrictionCopy]);

  const simpleHeroBucket = getAbSlot(
    MOS_SIMPLE_HERO as unknown as { slot: string; variants: { id: string; baseWeight?: number }[] },
  );
  const simpleHeroBase = SIMPLE_HERO_COPY[simpleHeroBucket.variant];
  const showSimpleHero = !!simpleHeroBase || !!aboveFoldCopy || !!ctaV2Copy || !!removeFrictionCopy;
  const effectiveSimpleHeroCopy = simpleHeroBase ?? SIMPLE_HERO_COPY.A_more_in_you!;
  const effectiveHeadline = aboveFoldCopy?.headline ?? effectiveSimpleHeroCopy.headline;
  const effectiveSubline = aboveFoldCopy?.subline ?? effectiveSimpleHeroCopy.subline;
  const effectiveCta = ctaV2Copy ?? effectiveSimpleHeroCopy.cta;
  const effectiveMicroTrust = removeFrictionCopy ?? SIMPLE_HERO_MICRO_TRUST;
  const simpleHeroVariantId = [
    simpleHeroBucket.variant !== "control" ? `sh:${simpleHeroBucket.variant}` : null,
    aboveFoldCopy ? `af:${lpAboveFold.variant}` : null,
    ctaV2Copy ? `cta:${lpCtaV2.variant}` : null,
    removeFrictionCopy ? `mt:${lpRemoveFriction.variant}` : null,
  ].filter(Boolean).join("|") || simpleHeroBucket.variant;

  // ─── Zero-Friction Hero — high-priority sprint (MOS-gated, additive) ───
  // When this slot is non-control, render the radically simplified hero
  // INSTEAD of SimpleHero/V1/V2. CTA target + click handler stay identical.
  const zeroFriction = useAbSlot(MOS_LP_ZERO_FRICTION_HERO);
  const zeroFrictionCopy = ZERO_FRICTION_HERO_COPY[zeroFriction.variant] ?? null;
  const showZeroFrictionHero = !!zeroFrictionCopy;

  // ─── Phase 9 — Psychology Hero (HIGHEST priority) ─────────────────────
  const psychHeadlineSlot = useAbSlot(MOS_LP_PSYCHOLOGY_HEADLINE);
  const psychSublineSlot = useAbSlot(MOS_LP_PSYCHOLOGY_SUBLINE);
  const psychCtaSlot = useAbSlot(MOS_LP_CTA_PSYCHOLOGY);
  const psychMicroTrustSlot = useAbSlot(MOS_LP_MICRO_TRUST_INLINE);
  const psychHeadline = LP_PSYCHOLOGY_HEADLINE_COPY[psychHeadlineSlot.variant];
  const psychSubline = LP_PSYCHOLOGY_SUBLINE_COPY[psychSublineSlot.variant];
  const psychCta = LP_CTA_PSYCHOLOGY_COPY[psychCtaSlot.variant];
  const psychMicroTrust = LP_MICRO_TRUST_INLINE_COPY[psychMicroTrustSlot.variant];
  const showPsychologyHero =
    !!psychHeadline || !!psychSubline || !!psychCta || !!psychMicroTrust;
  const psychVariantKey = [
    psychHeadline ? `hl:${psychHeadlineSlot.variant}` : null,
    psychSubline ? `sub:${psychSublineSlot.variant}` : null,
    psychCta ? `cta:${psychCtaSlot.variant}` : null,
    psychMicroTrust ? `mt:${psychMicroTrustSlot.variant}` : null,
  ]
    .filter(Boolean)
    .join("|") || "active";
  const psychThemeKey = [
    psychHeadline ? psychHeadlineSlot.variant : null,
    psychCta ? psychCtaSlot.variant : null,
  ]
    .filter((x) => x && x !== "control_msg")
    .join("+") || "mixed";

  // ─── Phase 9.5 — Conversion-First Hero kill-switch ───
  // Default ON. To roll back to the prior hero cascade (Psychology →
  // Zero-Friction → Simple → V2 → V1), flip this to `false`.
  // No A/B slot, no server dependency — single source of truth.
  const CONVERSION_HERO_ENABLED = true;
  const showConversionHero = CONVERSION_HERO_ENABLED;





  return (
    <div
      id="mos-scope"
      className="min-h-screen bg-background text-foreground"
      style={{
        // Cinematic dark masculine scope — overrides global cream theme for /masterofsales only.
        ["--background" as any]: "0 0% 6%",
        ["--foreground" as any]: "36 18% 92%",
        ["--card" as any]: "0 0% 9%",
        ["--card-foreground" as any]: "36 18% 92%",
        ["--popover" as any]: "0 0% 9%",
        ["--popover-foreground" as any]: "36 18% 92%",
        ["--muted" as any]: "0 0% 12%",
        ["--muted-foreground" as any]: "36 8% 68%",
        ["--accent" as any]: "42 50% 56%",
        ["--accent-foreground" as any]: "0 0% 6%",
        ["--border" as any]: "0 0% 18%",
        ["--input" as any]: "0 0% 18%",
        ["--ring" as any]: "42 50% 56%",
        ["--secondary" as any]: "0 0% 12%",
        ["--secondary-foreground" as any]: "36 18% 92%",
      }}
    >
      <SectionViewTracker />

      {/* ─── Phase 9.5 — Conversion-First Hero (HIGHEST priority renderer) ───
          Additive. Single kill-switch: set CONVERSION_HERO_ENABLED = false
          below to fall back to the prior hero cascade (Psychology → Zero-
          Friction → Simple → V2 → V1). HeroBackgroundLayer drives the
          existing `mos_hero_human_proof` Thompson Sampling slot unchanged.
          CTA copy is wired through the existing `mos_quiz_cta_angle` A/B
          slot — no new tracking, no new event schema. */}
      {showConversionHero && (
        <HeroMosConversion
          heroHref={heroHref}
          onCtaClick={handleHeroCta}
          ctaLabel={heroQuizCtaText}
          variantKey={`cta:${quizCtaAngle.variant}`}
        />
      )}

      {/* Phase 9 — Psychology Hero. */}
      {!showConversionHero && showPsychologyHero && (
        <HeroMosPsychology
          heroHref={heroHref}
          onCtaClick={handleHeroCta}
          variantKey={psychVariantKey}
          themeKey={psychThemeKey}
          copy={{
            headline:
              psychHeadline ?? LP_PSYCHOLOGY_HEADLINE_COPY.transparency!,
            subline: psychSubline ?? undefined,
            cta: psychCta ?? "Potenzial prüfen",
            microTrust: psychMicroTrust ?? undefined,
          }}
        />
      )}

      {/* Zero-Friction Hero — when mos_lp_zero_friction_hero is non-control. */}
      {!showConversionHero && !showPsychologyHero && showZeroFrictionHero && (
        <HeroMosZeroFriction
          heroHref={heroHref}
          onCtaClick={handleHeroCta}
          variantId={zeroFriction.variant}
          copy={zeroFrictionCopy!}
        />
      )}

      {/* Simple-Hero Sprint + Ultra-Fast LP overrides. */}
      {!showConversionHero && !showPsychologyHero && !showZeroFrictionHero && showSimpleHero && (
        <HeroMosSimple
          heroHref={heroHref}
          onCtaClick={handleHeroCta}
          headline={effectiveHeadline}
          subline={effectiveSubline}
          cta={effectiveCta}
          microTrust={effectiveMicroTrust}
          variantId={simpleHeroVariantId}
        />
      )}

      {/* HERO V2 — only when sticky bucket = mos_v2 AND Simple Hero off. */}
      {!showConversionHero && !showPsychologyHero && !showZeroFrictionHero && !showSimpleHero && isMosV2 && (
        <HeroMosV2
          heroHref={heroHref}
          onCtaClick={handleHeroCta}
          heroQuizCtaText={heroQuizCtaText}
          riskCopyText={riskCopyText}
          microTrustText={microTrustText}
          heroImageSrc={heroImageSrc}
        />
      )}

      {/* HERO V1 — identitätsbasiert, ruhig, single CTA (unverändert) */}
      {!showConversionHero && !showPsychologyHero && !showZeroFrictionHero && !showSimpleHero && !isMosV2 && (

      <section
        data-mos-section="hero"
        className="relative isolate overflow-hidden"
      >
        {/* Full-bleed editorial hero background — driven by mos_hero_human_proof
            A/B slot. Each variant only swaps the image; composition unchanged. */}
        <HeroBackgroundLayer fallbackSrc={heroImageSrc} />

        <div className="mx-auto grid min-h-[88vh] max-w-6xl grid-cols-1 items-center gap-10 px-6 pb-20 pt-24 md:min-h-[82vh] md:grid-cols-12 md:gap-12 md:px-10 md:py-24 lg:gap-16">
          <div className="md:col-span-8 flex flex-col justify-center">
          {/* Brand mark */}
          <p className="mb-3 text-[10px] uppercase tracking-[0.32em] text-foreground/70 sm:text-xs sm:tracking-[0.34em]">
            Ethical Top Closer™
          </p>

          {/* Eyebrow — canonical positioning line */}
          <p className="mb-5 text-[11px] uppercase tracking-[0.3em] text-accent sm:text-xs sm:tracking-[0.32em]">
            Das Leistungs-Nachweis-System™
          </p>

          {/* A/B variants preserved for tracking continuity, not rendered visually */}
          <span className="sr-only">{eyebrowText}</span>
          <span className="sr-only">
            {HERO_HEADLINE_COPY[heroHeadline.variant] ?? HERO_HEADLINE_COPY.richtung}
          </span>
          <span className="sr-only">
            {HERO_SUB_COPY[heroSub.variant] ?? HERO_SUB_COPY.kein_hype}
          </span>

          <h1 className="font-serif text-[2.4rem] leading-[1.05] tracking-tight md:text-7xl lg:text-[5.5rem] max-w-3xl">
            Werde Ethical Top Closer™
          </h1>

          <div className="mt-7 max-w-2xl space-y-5 text-base leading-relaxed text-foreground/85 md:text-lg">
            <p>
              Lerne eine der bestbezahlten Fähigkeiten, die Unternehmen
              weltweit händeringend suchen. Arbeite von überall. Bestimme
              selbst, wann, wo und mit wem du arbeitest.
            </p>
            <p>
              Mit der richtigen Ausbildung, echten Leistungsnachweisen und
              Zugang zu renommierten Auftraggebern können Closer je nach
              Leistungsnachweis in 3 bis 9 Monaten ein ortsunabhängiges
              Einkommen von 4.000 bis 12.000 Euro pro Monat oder mehr aufbauen.
            </p>
            <p className="text-foreground/75">
              Das ETC System führt dich Schritt für Schritt dorthin:
            </p>
          </div>


          {/* CRO Clarity-Reframe — Quiz = Diagnose, nicht Bewerbung */}
          <HeroClaritySubline variant={heroClarityVariant} />

          <p className="mt-7 text-sm font-medium uppercase tracking-[0.28em] text-accent md:text-base">
            Learn → Earn → Top Job Placements™
          </p>

          <p className="mt-6 max-w-2xl font-serif text-lg italic leading-relaxed text-foreground/85 md:text-xl">
            Die meisten suchen Chancen.<br />
            Ethical Top Closer hilft dir, sie dir zu verdienen.<br />
            <span className="not-italic font-medium text-foreground">Nicht suchen. Verdienen.</span>
          </p>

          {/* Identity Ladder — Ethical Top Closer als Einstieg, Entscheidungsarchitekt als entwickelter Zustand */}
          <div className="mt-8 max-w-2xl border-l-2 border-accent/40 pl-5">
            <p className="text-base leading-relaxed text-foreground/85 md:text-lg">
              Du startest als angehender <span className="text-foreground">Ethical Top Closer</span>.
            </p>
            <p className="mt-2 text-base leading-relaxed text-foreground/75 md:text-lg">
              Mit wachsender Leistung entwickelst du dich zu einem{" "}
              <span className="text-accent">Entscheidungsarchitekten</span>.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/65 md:text-base">
              Ein Entscheidungsarchitekt ist ein Ethical Top Closer, der Vertrauen aufbauen, Klarheit schaffen und Menschen durch wichtige Entscheidungen begleiten kann.
            </p>
          </div>


          <ul className="mt-7 flex flex-col gap-2 text-sm text-foreground/65 md:mt-8 md:flex-row md:gap-6">
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-accent" />
              Klare Stufen statt vager Versprechen
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-accent" />
              Begrenzte Plätze · persönliche Auswahl
            </li>
          </ul>

          <div className="mt-10 md:mt-12">
            {/* PROMPT 2 — Masterclass-Block direkt OBERHALB des primären CTAs */}
            <div className="mb-5 max-w-2xl rounded-2xl border border-accent/30 bg-foreground/[0.02] p-5 text-sm leading-relaxed text-foreground/80 md:text-base">
              <p>
                Die Masterclass ist die erste Stufe des Systems.
                <br />
                90 Minuten. Dein erstes Gesprächssystem. Sofort anwendbar.
              </p>
              <p className="mt-2 text-foreground">
                Wenn dieser Weg nicht zu dir passt: Geld zurück. Keine Diskussion.
              </p>
            </div>

            {/* CRO Clarity — Decision + Progress + Outcome direkt vor dem Hero-CTA */}
            <DecisionMomentBlock />
            <ProgressPreviewMini />
            {/* SYSTEM PROOF — Position B: direkt vor Outcome Preview */}
            {systemProofPosition.variant === "before_outcome_preview" && (
              <SystemProofBlock />
            )}
            <OutcomePreviewBlock variant={outcomePreviewVariant} />

            {/* CRO Gap Closure — Quiz-Preview direkt vor dem Hero-CTA */}
            <QuizPreviewBlock durationVariant={quizPreviewVariant} />

            {/* Phase 9.7 · Section A — Endergebnis ("Worauf das alles hinausläuft.")
                Renders only when mos_end_result_angle != "control". */}
            {endResultAngle.variant !== "control" && <EndResultSection />}

            {/* Phase 9.7 · Section D — Micro-Commitment direkt vor Quiz-CTA.
                Renders only when mos_quiz_micro_commitment != "control". */}
            {quizMicroCommitment.variant !== "control" && (
              <QuizMicroCommitmentBlock />
            )}

            {/* Trust Layer — Ethical Trust Strip vor erstem Haupt-CTA (A/B Position A) */}
            {ethicsStripPosition.variant === "before_first_cta" && (
              <EthicalTrustStrip positionKey="before_first_cta" />
            )}





            <Link
              to={heroHref}
              onClick={handleHeroCta}
              className="inline-flex min-h-[52px] w-full max-w-[420px] items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
            >
              <Calendar className="h-4 w-4" />
              {heroQuizCtaText}
            </Link>
            <p className="mt-3 text-[11px] leading-relaxed text-foreground/65 sm:text-xs">
              {riskCopyText}
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-foreground/55 sm:text-xs sm:tracking-[0.25em]">
              {microTrustText}
            </p>

            {/* PROMPT 2 — Quartals-Cap-Block direkt UNTERHALB des primären CTAs */}
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-foreground/70 md:text-base">
              Die Plätze pro Quartal sind begrenzt.
              <br />
              Wenn sie belegt sind, gibt es eine Warteliste.
            </p>

            {/* Ergebnis-Disclaimer entfernt — KPI-/Performance-Disclaimer an anderer Stelle reicht. */}
          </div>
          </div>
        </div>

      </section>
      )}



      {/* CRO Identity Recognition — "Vielleicht erkennst du dich wieder" */}
      <IdentityRecognitionBlock variant={identityBlockVariant} />

      {/* REAL PLATFORM PREVIEW™ — direkt unter Hero · 3 echte Plattform-Screens */}
      <RealPlatformPreview />

      {/* Phase 9.2 — Competence Proof Image Rail. Renders nothing when every
          image slot is `control` (default). Pure presentation, no business
          logic touched. Roll back via CRO_ENABLED=false or removing this line. */}
      <MosImageProofRail />

      {/* Phase 9.3 — Human Proof & Visual Trust Rail. Renders nothing when
          every slot is `control` (default). Hero / training / community /
          graduate / certification / transformation. Roll back via
          CRO_ENABLED=false or removing this line. */}
      <MosHumanProofRail />

      {/* SOCIAL PROOF #1 — direkt unter Hero (additiv, ohne Hero zu verändern) */}
      <HeroTrustBlock />


      {/* EARLY TRUST BLOCK — Skepsis-Neutralisierung direkt unter Hero (kein FAQ) */}
      <EarlyTrustBlock />

      {/* MECHANISM — Learn → Earn → Placement (Message-Match Ad → VSL → LP) */}
      <section
        data-mos-section="mechanism_lep"
        className="border-t border-foreground/10 bg-background"
      >
        <div className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
              Der Mechanismus
            </p>
            <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
              Learn → Earn → Top Job Placements™
            </h2>
            <p className="mt-5 text-base leading-relaxed text-foreground/70 md:text-lg">
              Drei klare Schritte. Kein Umweg. Kein Versprechen ohne Nachweis.
            </p>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                label: "Learn",
                title: "Lerne Closing systematisch.",
                body: "Das vollständige EEG-Framework. Klare Module, klare Stufen, kein Bauchgefühl.",
              },
              {
                label: "Earn",
                title: "Sammle echte Leistungsnachweise und Praxiserfahrung.",
                body: "Echte Gespräche, echtes Feedback, echte Ergebnisse — messbar dokumentiert.",
              },
              {
                label: "Top Job Placement™",
                title: "Qualifiziere dich für reale Top Job Placements™.",
                body: "Auftraggeber sehen, was du nachweislich kannst — nicht, was du behauptest.",
              },
            ].map((step, i) => (
              <li
                key={step.label}
                className="flex h-full flex-col gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 md:p-7"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-serif text-2xl text-accent md:text-3xl">
                    {step.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.24em] text-foreground/50">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="font-serif text-lg leading-snug md:text-xl">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-foreground/70">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* IDENTIFIKATIONS-STATEMENT — emotionale Verankerung vor allem anderen */}
      <div data-mos-section="identification">
        <IdentificationStatement />
      </div>

      {/* SOCIAL PROOF #2 — Position via A/B (proof_before_value | proof_after_value) */}
      {socialProofPosition.variant === "proof_before_value" && <EmotionalProofStrip />}

      <MidCta
        slotName="after_identification"
        label={primaryCtaText}
        microCopy="Kurzer Selbstcheck · keine Bewerbung · keine Verpflichtung."
        onFire={handleMidCta}
      />

      {/* GRAND-SLAM VALUE STACK — 5 Bausteine, Reihenfolge per A/B */}
      <ValueStackBlock order={valueStackOrder.variant as ValueStackOrder} />

      {/* PROGRESS SYSTEM — Position A: direkt nach Value Stack */}
      {progressPosition.variant === "after_value_stack" && progressBlock}

      {/* SYSTEM PROOF — Position A: direkt nach Progress System (sofern dort gerendert) */}
      {systemProofPosition.variant === "after_progress" &&
        progressPosition.variant === "after_value_stack" && <SystemProofBlock />}

      {/* CRO Gap Closure — Mid-CTA Position B (zusätzlich nach Progress System) */}
      {midCtaPosition.variant === "after_progress" &&
        progressPosition.variant === "after_value_stack" && (
          <MidCta
            slotName="after_progress"
            label={primaryCtaText}
            microCopy="Sieh in 3 Minuten, ob dieser Weg zu dir passt."
            onFire={handleMidCta}
          />
        )}

      {/* RISK REVERSAL — vor Bonus, wenn before_bonus aktiv */}
      {riskReversalPosition.variant === "before_bonus" && <RiskReversalBlock />}

      {/* BONUS STACK */}
      <BonusStackBlock />

      {/* RISK REVERSAL — nach Bonus, wenn after_bonus aktiv */}
      {riskReversalPosition.variant === "after_bonus" && <RiskReversalBlock />}

      {/* OUTCOME TRANSFORMATION — Vorher/Heute */}
      <OutcomeTransformationStrip />

      {/* REAL TRANSFORMATION PROOF — Position A: direkt nach Value/Outcome */}
      {proofAssetPosition.variant === "after_value_stack" && realProofBlock}

      {/* SOCIAL PROOF #2 — Position via A/B (verschoben hinter Value Stack) */}
      {socialProofPosition.variant === "proof_after_value" && <EmotionalProofStrip />}

      <MidCta
        slotName="after_value_stack"
        label={primaryCtaText}
        microCopy="Wenn dich dieser Weg neugierig macht — prüf in 60 Sekunden, ob er zu dir passt."
        onFire={handleMidCta}
      />


      {/* INTRO zu den Momenten */}
      <section
        data-mos-section="intro"
        className="border-b border-foreground/10 bg-background"
      >
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:px-10">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            Vier Bilder. Ein Standard.
          </p>
          <h2 className="mt-6 font-serif text-3xl leading-tight md:text-5xl">
            So sieht ein gewöhnlicher Tag hier wirklich aus.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-foreground/70 md:text-lg">
            Keine Lambos. Keine Strandbüros. Nur die nüchternen Momente, die
            zeigen, wie ruhig und konzentriert hier gearbeitet wird.
          </p>
        </div>
      </section>

      <div data-mos-section="moments">
        <MomentsStoryboard moments={moments} />
      </div>

      {/* KARRIEREWEG — neue ruhige Visualisierung L1→L6 */}
      <div data-mos-section="career_path">
        <CareerPathLadder />
      </div>

      {/* ROADMAP MANIFEST — 9 Phasen · 33 Module · L0–L8 (Creative-Canon-Match) */}
      <RoadmapManifestBar />

      {/* HOW PROGRESSION LOOKS INSIDE ETC™ — direkt unter Roadmap */}
      <RoadmapInsideStrip />

      {/* TRUST & PROOF LAYER — additive Blöcke (Reality · Transparency · Process · Why) */}
      <RealityBlock variant={realityCopyVariant} />
      <TransparencyBlock angle={transparencyAngleVariant} />
      <ProcessProofBlock />
      <WhyExistsBlock />

      {/* AI DIFFERENTIATION — Simulator · Ethical Simulator · AI Copilot */}
      <AiDifferentiationProof />

      {/* HOW PLACEMENT WORKS™ — 4-Schritt-Strip */}
      <PlacementProcessStrip />

      {/* TOP PERFORMER VAULT — MVP-Vorschau (Platform-Visibility-Layer) */}
      <TopPerformerVaultPreview />

      {/* LIVE PLATFORM DEMO — interaktive, anonymisierte Read-Only-Sicht */}
      <LivePlatformDemo />

      {/* ORIGIN — Why ETC Exists (Match zu Origin-Creatives) */}
      <OriginFounderBlock />

      {/* TRUST ACCELERATORS — verifizierte Substanz-Signale */}
      <TrustAcceleratorsBlock />




      {/* PLACEMENT PROOF — Leistungsdaten statt Lebenslauf (VSL-Match) */}
      <section
        data-mos-section="placement_proof"
        className="border-t border-foreground/10 bg-background"
      >
        <div className="mx-auto max-w-3xl px-6 py-20 text-center md:px-10 md:py-24">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Platzierung durch Leistung
          </p>
          <h2 className="mt-6 font-serif text-3xl leading-tight md:text-5xl">
            Auftraggeber sehen nicht deinen Lebenslauf.
            <br />
            <span className="text-accent">Sie sehen deine Leistungsnachweise.</span>
          </h2>
          <ul className="mx-auto mt-10 max-w-xl space-y-3 text-left text-base leading-relaxed text-foreground/80 md:text-lg">
            <li className="flex items-start gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>Deine Entwicklung wird sichtbar.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>Deine Umsetzung wird messbar.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>Deine Platzierung basiert auf nachgewiesener Leistung.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ENEMY ALIGNMENT — kurze, ruhige Positionierung gegen Lebenslauf-Logik */}
      <section
        data-mos-section="enemy_alignment"
        className="border-t border-foreground/10 bg-foreground/[0.02]"
      >
        <div className="mx-auto max-w-3xl px-6 py-16 text-center md:px-10 md:py-20">
          <p className="font-serif text-2xl leading-snug text-foreground/85 md:text-3xl">
            Die meisten Systeme bewerten Vergangenheit.
          </p>
          <p className="mt-6 font-serif text-3xl leading-snug text-accent md:text-4xl">
            Wir bewerten Leistung.
          </p>
          <p className="mt-6 font-serif text-xl leading-snug text-foreground/80 md:text-2xl">
            Deshalb entstehen echte Chancen.
          </p>
        </div>
      </section>

      <MidCta
        slotName="after_career_path"
        label={primaryCtaText}
        microCopy="Sieh dir an, wo dein nächster Schritt liegen könnte."
        onFire={handleMidCta}
      />

      {/* TRUST-MARKER — vier ruhige Versprechen */}
      <div data-mos-section="trust_markers">
        <TrustMarkers />
      </div>

      <MidCta
        slotName="after_trust"
        label={primaryCtaText}
        microCopy="Wenn das deine Richtung sein könnte — finde es in 60 Sekunden heraus."
        onFire={handleMidCta}
      />

      {/* TESTIMONIALS + FAQ — bleiben strukturell unverändert, A/B-Test läuft weiter */}
      <div data-mos-section="testimonials_faq">
        <TestimonialsAndFaq />
      </div>

      {/* SHOW-UP PSYCHOLOGIE — Erwartungsmanagement vor Closing-CTA */}
      <ShowUpPsychologyBlock />

      <MidCta
        slotName="after_social_proof"
        label={primaryCtaText}
        microCopy="Wenn das deine Richtung sein könnte — finde es in 60 Sekunden heraus."
        onFire={handleMidCta}
      />

      {/* REAL TRANSFORMATION PROOF — Position B: direkt vor Final-CTA */}
      {proofAssetPosition.variant === "before_final_cta" && realProofBlock}

      {/* PROGRESS SYSTEM — Position B: direkt vor First-Win-Mechanismus */}
      {progressPosition.variant === "before_first_win" && progressBlock}

      {/* SYSTEM PROOF — Position A (Fallback): direkt nach Progress System (alternative Position) */}
      {systemProofPosition.variant === "after_progress" &&
        progressPosition.variant === "before_first_win" && <SystemProofBlock />}

      {/* PROGRESS CONTROL — Position B: standalone direkt vor First-Win */}
      {progressControlPosition.variant === "before_first_win" && (
        <ProgressControlBlock
          message={progressControlMessageVariant}
          variant="standalone"
        />
      )}

      {/* FIRST-WIN MECHANISMUS — kleiner Erfolg vor der Entscheidung, direkt vor Final-CTA */}
      <FirstWinMechanismBlock
        angle={firstWinAngleVariant}
        ctaLabel={firstWinCtaLabel}
      />




      {/* CLOSING — ruhig, beidseitig ehrlich */}
      <section
        data-mos-section="closing"
        className="border-t border-foreground/10 bg-background"
      >
        <div className="mx-auto max-w-3xl px-6 py-28 text-center md:px-10">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            Auswahl statt Druck
          </p>
          <h2 className="mt-6 font-serif text-4xl leading-tight md:text-6xl">
            Wenn du wissen willst, ob das deine Richtung ist —<br />
            finde es ehrlich heraus.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-foreground/70 md:text-lg">
            Kurzes Gespräch über deinen Standort, deine Ambition und ob ein
            Karriereweg bei uns für dich überhaupt der richtige ist. Beidseitig
            ehrlich. Ohne Druck. Ohne Verkaufsskript.
          </p>

          {/* Masterclass — erste Stufe des Systems */}
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-accent/30 bg-accent/[0.06] p-6 text-left md:p-7">
            <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
              Erste Stufe
            </p>
            <p className="mt-3 font-serif text-lg leading-snug text-foreground md:text-xl">
              Die Masterclass ist die erste Stufe des Systems.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/75 md:text-base">
              90 Minuten. Das vollständige EEG-Framework. Sofort anwendbar.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground/75 md:text-base">
              Wenn dieser Weg nicht zu dir passt: Geld zurück. Keine Diskussion.
            </p>
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              to={closingHref}
              onClick={handleClosingCta}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
            >
              <Calendar className="h-4 w-4" />
              {CLOSING_CTA_COPY[closingCta.variant] ?? CANONICAL_CTA_LABEL}
            </Link>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-xs leading-relaxed text-foreground/55">
            Die Anzahl der Plätze pro Quartal ist begrenzt.
            <br />
            Wenn die verfügbaren Plätze belegt sind, gibt es eine Warteliste.
          </p>

          {/* Positionierungs-Reprise + Bewegungs-Aussage */}
          <div className="mx-auto mt-14 max-w-2xl border-t border-foreground/10 pt-10">
            <p className="font-serif text-lg leading-snug text-foreground/90 md:text-xl">
              Wir bilden keine gewöhnlichen Closer aus.
              <br />
              <span className="text-accent">Wir entwickeln Entscheidungsarchitekten.</span>
            </p>
            <p className="mt-4 text-sm leading-relaxed text-foreground/65 md:text-base">
              Ein Entscheidungsarchitekt ist ein Ethical Top Closer, der Vertrauen aufbauen, Klarheit schaffen und Menschen durch wichtige Entscheidungen begleiten kann.
            </p>
            <p className="mt-8 font-serif text-base italic leading-relaxed text-foreground/75 md:text-lg">
              Die Zukunft gehört nicht den Menschen mit den besten Zeugnissen.
              <br />
              Sie gehört den Menschen mit den besten Leistungsnachweisen.
            </p>
          </div>

          {/* Philosophie-Block — finaler Anker vor Sticky-CTA */}
          <div className="mx-auto mt-14 max-w-2xl border-t border-foreground/10 pt-10 text-center">
            <p className="font-serif text-xl leading-snug text-foreground md:text-2xl">
              Was Du nicht veränderst, entscheidest Du.
            </p>
            <p className="mt-6 text-sm leading-relaxed text-foreground/70 md:text-base">
              Dein Fortschritt liegt nicht im Zufall.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70 md:text-base">
              Du siehst jederzeit, wo du stehst — und kennst immer deinen
              nächsten Schritt.
            </p>
            <p className="mt-6 font-serif text-base italic leading-relaxed text-foreground/85 md:text-lg">
              Jeder Schritt messbar.
              <br />
              Jede Stufe verdient — nicht geschenkt.
            </p>
          </div>

        </div>
      </section>

      {/* Trust Layer — Ethical Trust Strip vor Sticky-CTA (A/B Position B) */}
      {ethicsStripPosition.variant === "before_sticky_cta" && (
        <section className="border-t border-foreground/10 bg-background">
          <div className="mx-auto max-w-3xl px-6 py-10 md:px-10 md:py-12">
            <EthicalTrustStrip positionKey="before_sticky_cta" />
          </div>
        </section>
      )}

      {/* Sticky CTA bar — Label via mos_sticky_cta A/B (max. 2 Varianten aktiv) */}
      <MasterOfSalesCtaPair
        variant="sticky"
        source="masterofsales"
        ctaLabel={stickyCtaLabel}
      />
      <div className="h-24" aria-hidden />
    </div>
  );
};

// Inline Mid-Page CTA — gleicher Quiz-Flow wie Hero/Closing.
// Erlaubte CTA-Texte werden vom Parent via `label` durchgereicht (A/B-Variante).
const MidCta = ({
  slotName,
  label,
  microCopy,
  onFire,
}: {
  slotName: string;
  label: string;
  microCopy: string;
  onFire: (slot: string) => void;
}) => {
  const href = useMemo(
    () =>
      forwardTrackingParams(`${MEN_QUIZ_PATH}&source=masterofsales-${slotName}`),
    [slotName],
  );
  return (
    <section
      data-mos-section={`midcta_${slotName}`}
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-14 text-center md:px-10 md:py-16">
        <Link
          to={href}
          onClick={() => onFire(slotName)}
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
        >
          <Calendar className="h-4 w-4" />
          {label}
        </Link>
        <p className="mt-4 text-xs text-foreground/55">{microCopy}</p>
      </div>
    </section>
  );
};

// EarlyTrustBlock — Skepsis-Neutralisierung direkt unter Hero.
// Statisch, immer sichtbar (kein Accordion, kein Hover). Feuert `early_trust_view`
// einmal pro Session bei 50% Sichtbarkeit für Funnel-Analyse.
const EARLY_TRUST_ITEMS: { q: string; a: string }[] = [
  {
    q: "Ist Ethical Top Closer manipulativer Vertrieb?",
    a: "Nein. Wir lehren Decision Mastery statt Druck-Techniken. Das Ziel ist Klarheit, nicht Überredung.",
  },
  {
    q: "Brauche ich bereits Erfahrung im Vertrieb?",
    a: "Nein. Das System beginnt bei Level 0 und entwickelt Fähigkeiten Schritt für Schritt.",
  },
  {
    q: "Was unterscheidet ETC von klassischen Sales-Schulen?",
    a: "Die meisten vermitteln Wissen. Wir verbinden Lernen, Leistung und reale Opportunities.",
  },
];

const EARLY_TRUST_VIEW_KEY = "mos_early_trust_view_v1";

const EarlyTrustBlock = () => {
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !sectionRef.current) return;
    try {
      if (sessionStorage.getItem(EARLY_TRUST_VIEW_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(EARLY_TRUST_VIEW_KEY, "1");
            } catch {
              /* ignore */
            }
            try {
              trackFunnelEvent("early_trust_view", {
                page: "masterofsales",
                items: EARLY_TRUST_ITEMS.length,
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
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-mos-section="early_trust"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-20">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Ehrlich beantwortet
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-4xl">
            Vielleicht fragst du dich …
          </h2>
        </div>

        <ul className="mt-10 space-y-6 md:space-y-8">
          {EARLY_TRUST_ITEMS.map((item) => (
            <li
              key={item.q}
              className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 md:p-7"
            >
              <p className="font-serif text-lg leading-snug text-foreground md:text-xl">
                {item.q}
              </p>
              <p className="mt-3 text-base leading-relaxed text-foreground/75 md:text-lg">
                {item.a}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default MasterOfSales;
