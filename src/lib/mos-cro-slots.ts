/**
 * MasterOfSales CRO — A/B slot registry (Part 1–5).
 *
 * Purely additive. Each slot is sticky per browser session via the shared
 * `getAbSlot` / `useAbSlot` infrastructure. Server-side weights from
 * `ab_slot_weights` feed in automatically; Winner Engine + Confidence
 * Engine pick these up via `getActiveSlotSummary()` on every funnel event.
 *
 * Weighting (UNCHANGED — owned by Winner Engine, never edited here):
 *   Booking ×12 · HQL ×8 · Lead ×4 · Quiz Completion ×2 · Quiz Start ×1
 *   CTR = 0 · Clicks = 0 · Impressions = 0
 */
import type { AbSlotDef } from "@/lib/ab-multivariant";

// ─── Part 1: LP → Quiz Start ─────────────────────────────────────────────
export const MOS_LP_FIRST_WIN: AbSlotDef = {
  slot: "mos_lp_first_win",
  variants: [
    { id: "klarheit_90s", baseWeight: 1 },
    { id: "naechster_schritt", baseWeight: 1 },
    { id: "potenzial_check", baseWeight: 1 },
    { id: "passt_zu_dir", baseWeight: 1 },
  ],
};

export const MOS_LP_MICRO_TRUST: AbSlotDef = {
  slot: "mos_lp_micro_trust",
  variants: [
    { id: "90s_5fragen", baseWeight: 1 },
    { id: "kostenlos_kein_druck", baseWeight: 1 },
    { id: "keine_bewerbung", baseWeight: 1 },
  ],
};

export const MOS_LP_RISK_REDUCER: AbSlotDef = {
  slot: "mos_lp_risk_reducer",
  variants: [
    { id: "nichts_entscheiden", baseWeight: 1 },
    { id: "nur_orientierung", baseWeight: 1 },
    { id: "nur_klarheit", baseWeight: 1 },
  ],
};

export const MOS_LP_CTA_STYLE: AbSlotDef = {
  slot: "mos_lp_cta_style",
  variants: [
    { id: "button", baseWeight: 1 },
    { id: "button_arrow", baseWeight: 1 },
    { id: "button_trust", baseWeight: 1 },
  ],
};

export const MOS_LP_STICKY_CTA: AbSlotDef = {
  slot: "mos_lp_sticky_cta",
  variants: [
    { id: "klarheit_90s", baseWeight: 1 },
    { id: "richtungs_check", baseWeight: 1 },
    { id: "potenzial_pruefen", baseWeight: 1 },
  ],
};

// ─── Part 2: Quiz Start → Q1 ─────────────────────────────────────────────
export const MOS_QUIZ_ENTRY_MODE: AbSlotDef = {
  slot: "mos_quiz_entry_mode",
  variants: [
    { id: "direct", baseWeight: 1 },
    { id: "mini_intro", baseWeight: 1 },
    { id: "commitment", baseWeight: 1 },
  ],
};

export const MOS_Q1_VISUAL: AbSlotDef = {
  slot: "mos_q1_visual",
  variants: [
    { id: "list", baseWeight: 1 },
    { id: "cards", baseWeight: 1 },
    { id: "cards_icons", baseWeight: 1 },
  ],
};

// ─── Part 3: Quiz Completion ─────────────────────────────────────────────
export const MOS_PROGRESS_SYSTEM: AbSlotDef = {
  slot: "mos_progress_system",
  variants: [
    { id: "linear", baseWeight: 1 },
    { id: "segment", baseWeight: 1 },
    { id: "circle", baseWeight: 1 },
  ],
};

export const MOS_COMPLETION_BOOSTER: AbSlotDef = {
  slot: "mos_completion_booster",
  variants: [
    { id: "ergebnis_wartet", baseWeight: 1 },
    { id: "wenige_sekunden", baseWeight: 1 },
    { id: "fast_geschafft", baseWeight: 1 },
  ],
};

// ─── Part 5: Lead Quality — Commitment Line ──────────────────────────────
export const MOS_LEAD_COMMITMENT_LINE: AbSlotDef = {
  slot: "mos_lead_commitment_line",
  variants: [
    { id: "entwicklungsorientiert", baseWeight: 1 },
    { id: "potenzial_remote_sales", baseWeight: 1 },
    { id: "aktiv_wachsen", baseWeight: 1 },
  ],
};

// ─── Hero-Simplification Sprint (additive) ───────────────────────────────
// New simple-hero test. `control` keeps the existing hero (V1/V2) untouched.
export const MOS_SIMPLE_HERO: AbSlotDef = {
  slot: "mos_simple_hero",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_more_in_you", baseWeight: 1 },
    { id: "B_direction", baseWeight: 1 },
    { id: "C_path_fits", baseWeight: 1 },
  ],
};

// Direct-entry behaviour AFTER LP CTA click (MOS-only).
//   direct       → skip intro, go straight to Q1
//   transition   → 0.8s confirmation line, then Q1
//   mini_intro   → one short reassurance line, then Q1
export const MOS_QUIZ_DIRECT_ENTRY: AbSlotDef = {
  slot: "mos_quiz_direct_entry",
  variants: [
    { id: "direct", baseWeight: 1 },
    { id: "transition", baseWeight: 1 },
    { id: "mini_intro", baseWeight: 1 },
  ],
};

// Q1 rendering variant (visual only — answers identical, scoring unchanged).
//   list        → existing list buttons
//   cards       → larger card layout
//   cards_icons → cards + leading icon dot
//   auto_advance→ cards + auto-advance on tap (visual hint; advance already auto)
export const MOS_Q1_INSTANT_ANSWER: AbSlotDef = {
  slot: "mos_q1_instant_answer",
  variants: [
    { id: "list", baseWeight: 1 },
    { id: "cards", baseWeight: 1 },
    { id: "cards_icons", baseWeight: 1 },
    { id: "auto_advance", baseWeight: 1 },
  ],
};


// ─── Ultra-Fast Sprint (Teil A–D) — additive, MOS-gated ─────────────────
export const MOS_LP_ABOVE_FOLD_V2: AbSlotDef = {
  slot: "mos_lp_above_fold_v2",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_90s_passt", baseWeight: 1 },
    { id: "B_schnellster_weg", baseWeight: 1 },
    { id: "C_bevor_monate", baseWeight: 1 },
    { id: "D_kostenloser_check", baseWeight: 1 },
  ],
};

export const MOS_LP_CTA_V2: AbSlotDef = {
  slot: "mos_lp_cta_v2",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "potenzial_pruefen", baseWeight: 1 },
    { id: "test_starten_90s", baseWeight: 1 },
    { id: "kostenloser_check", baseWeight: 1 },
    { id: "jetzt_herausfinden", baseWeight: 1 },
  ],
};

export const MOS_LP_REMOVE_FRICTION: AbSlotDef = {
  slot: "mos_lp_remove_friction",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_5_fragen", baseWeight: 1 },
    { id: "B_90s", baseWeight: 1 },
    { id: "C_kein_verkauf", baseWeight: 1 },
    { id: "D_all_three", baseWeight: 1 },
  ],
};

export const MOS_Q1_ULTRA_FAST: AbSlotDef = {
  slot: "mos_q1_ultra_fast",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "large_cards_icons", baseWeight: 1 },
    { id: "only_cards", baseWeight: 1 },
    { id: "hover_cards", baseWeight: 1 },
    { id: "auto_advance", baseWeight: 1 },
  ],
};

export const MOS_Q1_MICRO_COMMITMENT: AbSlotDef = {
  slot: "mos_q1_micro_commitment",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_5_fragen", baseWeight: 1 },
    { id: "B_unter_90s", baseWeight: 1 },
    { id: "C_sofort", baseWeight: 1 },
    { id: "D_all_three", baseWeight: 1 },
  ],
};

export const MOS_PROGRESS_FAST: AbSlotDef = {
  slot: "mos_progress_fast",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "pct_20", baseWeight: 1 },
    { id: "step_1_of_5", baseWeight: 1 },
    { id: "fast_geschafft", baseWeight: 1 },
    { id: "analyse_laeuft", baseWeight: 1 },
  ],
};

// ─── Zero-Friction Hero (additive, MOS-gated, high-priority sprint) ──────
// Testet, ob ein nahezu textloser Hero die LP→Quiz Conversion signifikant
// erhöht. `control` belässt bestehenden Hero (V1/V2/SimpleHero) unverändert.
// A–C: Headline + 3 Bullets + CTA. D: maximal reduziert — Headline + 2
// Mini-Lines + CTA, ohne Bullets, ohne Subline, minimale vertikale Höhe.
export const MOS_LP_ZERO_FRICTION_HERO: AbSlotDef = {
  slot: "mos_lp_zero_friction_hero",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_90s_check", baseWeight: 1 },
    { id: "B_passt_zu_dir", baseWeight: 1 },
    { id: "C_bevor_monate", baseWeight: 1 },
    { id: "D_minimal", baseWeight: 1 },
  ],
};

export type ZeroFrictionHeroCopy = {
  headline: string | string[];
  bullets: string[];
  miniLines?: string[];
  cta: string;
  ultraMinimal?: boolean;
};

export const ZERO_FRICTION_HERO_COPY: Record<string, ZeroFrictionHeroCopy | null> = {
  control: null,
  A_90s_check: {
    headline: "90 Sekunden Potenzialcheck",
    bullets: ["5 Fragen", "Sofortiges Ergebnis", "Kein Verkaufsgespräch"],
    cta: "Potenzial prüfen",
  },
  B_passt_zu_dir: {
    headline: [
      "Finde in 90 Sekunden heraus,",
      "ob Closing zu dir passt.",
    ],
    bullets: ["5 kurze Fragen", "Sofortige Auswertung", "Kein Verkaufsgespräch"],
    cta: "Potenzial prüfen",
  },
  C_bevor_monate: {
    headline: [
      "Bevor du Monate verschwendest:",
      "Prüfe jetzt dein Closing-Potenzial.",
    ],
    bullets: ["90 Sekunden", "5 Fragen", "Sofortiges Ergebnis"],
    cta: "Jetzt prüfen",
  },
  D_minimal: {
    headline: "90 Sekunden Potenzialcheck",
    bullets: [],
    miniLines: ["5 Fragen", "Kein Verkaufsgespräch"],
    cta: "Potenzial prüfen",
    ultraMinimal: true,
  },
};


// ─── Phase 9 — LP→Quiz Start optimization (additive, MOS-gated) ─────────
// 7 new slots that test psychology-themed copy and layout for cold MOS
// traffic. All default to `control` → existing LP renders unchanged.
export const MOS_LP_PSYCHOLOGY_HEADLINE: AbSlotDef = {
  slot: "mos_lp_psychology_headline",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "trust", baseWeight: 1 },
    { id: "transparency", baseWeight: 1 },
    { id: "control_msg", baseWeight: 1 },
    { id: "risk_reduction", baseWeight: 1 },
    // Phase 9.1 — audience-aligned (performance / competence / career)
    { id: "competence", baseWeight: 1 },
    { id: "professional", baseWeight: 1 },
    { id: "market_reality", baseWeight: 1 },
    { id: "career_competence", baseWeight: 1 },
  ],
};

export const MOS_LP_PSYCHOLOGY_SUBLINE: AbSlotDef = {
  slot: "mos_lp_psychology_subline",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "trust", baseWeight: 1 },
    { id: "transparency", baseWeight: 1 },
    { id: "control_msg", baseWeight: 1 },
    { id: "risk_reduction", baseWeight: 1 },
    // Phase 9.1
    { id: "skill_fit", baseWeight: 1 },
    { id: "growth_no_shortcut", baseWeight: 1 },
    { id: "performance_standard", baseWeight: 1 },
  ],
};

export const MOS_LP_CTA_PSYCHOLOGY: AbSlotDef = {
  slot: "mos_lp_cta_psychology",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "risk_reduction", baseWeight: 1 },
    { id: "transparency", baseWeight: 1 },
    { id: "control_msg", baseWeight: 1 },
    // Phase 9.1
    { id: "eignung_pruefen", baseWeight: 1 },
    { id: "eignungstest", baseWeight: 1 },
    { id: "passt_zu_mir", baseWeight: 1 },
    { id: "karriere_potenzial", baseWeight: 1 },
    { id: "faehigkeiten_test", baseWeight: 1 },
  ],
};

export const MOS_LP_MICRO_TRUST_INLINE: AbSlotDef = {
  slot: "mos_lp_micro_trust_inline",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_3stat", baseWeight: 1 },
    { id: "B_testimonial_line", baseWeight: 1 },
    { id: "C_no_promise", baseWeight: 1 },
    // Phase 9.1
    { id: "D_competence_focus", baseWeight: 1 },
    { id: "E_performance_line", baseWeight: 1 },
  ],
};

export const MOS_LP_TRUST_BLOCK_POSITION: AbSlotDef = {
  slot: "mos_lp_trust_block_position",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "above_fold", baseWeight: 1 },
    { id: "just_below_cta", baseWeight: 1 },
    { id: "sticky_footer", baseWeight: 1 },
  ],
};

export const MOS_LP_SCROLL_PROGRESS: AbSlotDef = {
  slot: "mos_lp_scroll_progress",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "thin_top_bar", baseWeight: 1 },
    { id: "section_dots", baseWeight: 1 },
  ],
};

export const MOS_LP_COMPETING_CTA_SUPPRESS: AbSlotDef = {
  slot: "mos_lp_competing_cta_suppress",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "suppress_secondary_mobile", baseWeight: 1 },
  ],
};

export const LP_PSYCHOLOGY_HEADLINE_COPY: Record<string, string | null> = {
  control: null,
  trust:
    "Kein Karriereversprechen. Ein echter Weg, Verkauf professionell zu lernen.",
  transparency:
    "Bevor du Zeit investierst: Finde heraus, ob Closing überhaupt zu dir passt.",
  control_msg:
    "Prüfe unverbindlich, ob dieser Karriereweg für dich Sinn ergibt.",
  risk_reduction:
    "Keine Bewerbung. Keine Verpflichtung. Nur eine ehrliche Einschätzung.",
  // Phase 9.1 — performance / competence / career
  competence: "Eine Fähigkeit, die dir niemand mehr nehmen kann.",
  professional: "Werde professioneller Verkäufer statt Kurs-Sammler.",
  market_reality: "Der Markt bezahlt keine Wünsche. Er bezahlt Fähigkeiten.",
  career_competence: "Karriere entsteht durch Kompetenz. Nicht durch Hoffnung.",
};

export const LP_PSYCHOLOGY_SUBLINE_COPY: Record<string, string | null> = {
  control: null,
  trust:
    "Wir versprechen kein schnelles Geld. Wir zeigen dir, wie professionelles Closing wirklich funktioniert.",
  transparency:
    "5 kurze Fragen zeigen dir ehrlich, ob dieser Karriereweg zu deiner Situation passt.",
  control_msg:
    "Du entscheidest, ob du weitergehst. Jeder Schritt bleibt freiwillig.",
  risk_reduction:
    "Kein Verkaufsgespräch. Keine Daten an Dritte. Nur dein Ergebnis.",
  // Phase 9.1
  skill_fit:
    "Lerne eine gefragte Vertriebsfähigkeit und finde heraus, ob Closing zu deinen Stärken passt.",
  growth_no_shortcut:
    "Für Menschen, die beruflich wachsen wollen statt nach Abkürzungen zu suchen.",
  performance_standard:
    "Nicht für jeden. Sondern für Menschen mit Leistungsanspruch.",
};

export const LP_CTA_PSYCHOLOGY_COPY: Record<string, string | null> = {
  control: null,
  risk_reduction: "Unverbindlich prüfen",
  transparency: "Ehrlich herausfinden",
  control_msg: "Selbst entscheiden",
  // Phase 9.1
  eignung_pruefen: "Eignung prüfen",
  eignungstest: "Kostenlosen Eignungstest starten",
  passt_zu_mir: "Passt Closing zu mir?",
  karriere_potenzial: "Karriere-Potenzial prüfen",
  faehigkeiten_test: "Fähigkeiten-Test starten",
};

export const LP_MICRO_TRUST_INLINE_COPY: Record<string, string | null> = {
  control: null,
  A_3stat: "90 Sekunden · 5 Fragen · kein Verkaufsgespräch",
  B_testimonial_line:
    "Über 1.000 Teilnehmer haben bereits ihren Weg geprüft.",
  C_no_promise:
    "Wir versprechen kein Einkommen. Nur eine ehrliche Einschätzung.",
  // Phase 9.1
  D_competence_focus: "Echte Ausbildung · Echte Fähigkeit · Echte Karriere",
  E_performance_line:
    "Für Menschen mit Leistungsanspruch — kein Lifestyle-Marketing.",
};

// ─── Phase 9.6 — Conversion-First Hero V2 (additive) ─────────────────────
// New CRO slots layered on top of the Phase 9.5 HeroMosConversion. All
// default to `control` → existing copy renders unchanged. Sticky-bucketed
// via getAbSlot; weights live in `ab_slot_weights`; Thompson Sampling +
// force_slot + Winner Engine all untouched.
export const MOS_CONVERSION_HERO_HEADLINE: AbSlotDef = {
  slot: "mos_conversion_hero_headline",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_passt_zu_dir", baseWeight: 1 },
    { id: "B_potenzial_closer", baseWeight: 1 },
    { id: "C_ehrlichster_test", baseWeight: 1 },
    { id: "D_bevor_zeit", baseWeight: 1 },
    { id: "E_karriere_kompetenz", baseWeight: 1 },
  ],
};

export const MOS_HERO_MICROTRUST_V2: AbSlotDef = {
  slot: "mos_hero_microtrust_v2",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_1000_karriereweg", baseWeight: 1 },
    { id: "B_1000_passt", baseWeight: 1 },
    { id: "C_klare_ergebnisse", baseWeight: 1 },
    { id: "D_kostenlos_ehrlich", baseWeight: 1 },
  ],
};

export const CONVERSION_HERO_HEADLINE_COPY: Record<
  string,
  { lines: [string, string, string] } | null
> = {
  control: null,
  A_passt_zu_dir: {
    lines: [
      "Prüfe in 2 Minuten,",
      "ob eine Karriere im Closing",
      "wirklich zu dir passt.",
    ],
  },
  B_potenzial_closer: {
    lines: [
      "Finde in 2 Minuten heraus,",
      "ob du das Potenzial zum",
      "High-Ticket Closer hast.",
    ],
  },
  C_ehrlichster_test: {
    lines: [
      "Der ehrlichste Karriere-Test",
      "für angehende Closer.",
      "In 2 Minuten.",
    ],
  },
  D_bevor_zeit: {
    lines: [
      "Bevor du Zeit investierst:",
      "Prüfe zuerst, ob Closing",
      "überhaupt zu dir passt.",
    ],
  },
  E_karriere_kompetenz: {
    lines: [
      "Karriere entsteht durch Kompetenz.",
      "Prüfe, ob Closing",
      "dein Weg sein könnte.",
    ],
  },
};

export const HERO_MICROTRUST_V2_COPY: Record<string, string | null> = {
  control: null,
  A_1000_karriereweg:
    "Über 1.000 Teilnehmer haben ihren Karriereweg geprüft.",
  B_1000_passt:
    "Über 1.000 Teilnehmer haben geprüft, ob Closing zu ihnen passt.",
  C_klare_ergebnisse:
    "Tausende Quiz-Durchläufe. Klare Ergebnisse. Kein Verkaufsdruck.",
  D_kostenlos_ehrlich:
    "Kostenlos. Ehrlich. In 2 Minuten abgeschlossen.",
};

// ─── Phase 9.7 — Narrative Flow & Quiz Conversion ──────────────────────
// Three additive slots that ALL default to `control` (no visible change).

// Renders new "Worauf das alles hinausläuft." section above hero quiz CTA.
export const MOS_END_RESULT_ANGLE: AbSlotDef = {
  slot: "mos_end_result_angle",
  variants: [
    { id: "control", baseWeight: 1 },      // hidden
    { id: "on_competence", baseWeight: 1 }, // visible — competence framing
  ],
};

// Renders "Bevor du Zeit investierst" micro-commitment block above hero quiz CTA.
export const MOS_QUIZ_MICRO_COMMITMENT: AbSlotDef = {
  slot: "mos_quiz_micro_commitment",
  variants: [
    { id: "control", baseWeight: 1 }, // hidden
    { id: "on", baseWeight: 1 },      // visible
  ],
};

// New motivation angle for the hero quiz CTA label.
// When != "control", overrides existing heroQuizCtaText.
// Existing mos_quiz_cta_angle slot continues to be tracked separately.
export const MOS_QUIZ_MOTIVATION_ANGLE: AbSlotDef = {
  slot: "mos_quiz_motivation_angle",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "A_eignung_pruefen", baseWeight: 1 },
    { id: "B_potenzial_closer", baseWeight: 1 },
    { id: "C_assessment", baseWeight: 1 },
    { id: "D_passt_zu_dir", baseWeight: 1 },
    { id: "E_2min_klarheit", baseWeight: 1 },
  ],
};

export const QUIZ_MOTIVATION_ANGLE_COPY: Record<string, string | null> = {
  control: null,
  A_eignung_pruefen: "Prüfe jetzt deine Closing-Eignung",
  B_potenzial_closer: "Finde heraus, ob du das Potenzial zum Closer hast",
  C_assessment: "Kostenloses Karriere-Assessment starten",
  D_passt_zu_dir: "Passt Closing wirklich zu dir?",
  E_2min_klarheit: "In 2 Minuten Klarheit bekommen",
};

/** Full registry — used by dashboards/tests to enumerate new slots. */
export const MOS_CRO_SLOTS: readonly AbSlotDef[] = [
  MOS_LP_FIRST_WIN,
  MOS_LP_MICRO_TRUST,
  MOS_LP_RISK_REDUCER,
  MOS_LP_CTA_STYLE,
  MOS_LP_STICKY_CTA,
  MOS_QUIZ_ENTRY_MODE,
  MOS_Q1_VISUAL,
  MOS_PROGRESS_SYSTEM,
  MOS_COMPLETION_BOOSTER,
  MOS_LEAD_COMMITMENT_LINE,
  MOS_SIMPLE_HERO,
  MOS_QUIZ_DIRECT_ENTRY,
  MOS_Q1_INSTANT_ANSWER,
  MOS_LP_ABOVE_FOLD_V2,
  MOS_LP_CTA_V2,
  MOS_LP_REMOVE_FRICTION,
  MOS_Q1_ULTRA_FAST,
  MOS_Q1_MICRO_COMMITMENT,
  MOS_PROGRESS_FAST,
  MOS_LP_ZERO_FRICTION_HERO,
  MOS_LP_PSYCHOLOGY_HEADLINE,
  MOS_LP_PSYCHOLOGY_SUBLINE,
  MOS_LP_CTA_PSYCHOLOGY,
  MOS_LP_MICRO_TRUST_INLINE,
  MOS_LP_TRUST_BLOCK_POSITION,
  MOS_LP_SCROLL_PROGRESS,
  MOS_LP_COMPETING_CTA_SUPPRESS,
  // Phase 9.6 — Conversion-First Hero V2
  MOS_CONVERSION_HERO_HEADLINE,
  MOS_HERO_MICROTRUST_V2,
  // Phase 9.7 — Narrative Flow & Quiz Conversion
  MOS_END_RESULT_ANGLE,
  MOS_QUIZ_MICRO_COMMITMENT,
  MOS_QUIZ_MOTIVATION_ANGLE,
] as const;


export const LP_ABOVE_FOLD_V2_COPY: Record<string, { headline: string; subline: string } | null> = {
  control: null,
  A_90s_passt: {
    headline: "Finde in 90 Sekunden heraus, ob Closing zu dir passt.",
    subline: "5 kurze Fragen. Kein Verkaufsgespräch. Sofortiges Ergebnis.",
  },
  B_schnellster_weg: {
    headline: "Der schnellste Weg zu 3.000–10.000 € im High-Ticket-Sales.",
    subline: "Prüfe in 90 Sekunden, ob du das Potenzial hast — kostenlos und unverbindlich.",
  },
  C_bevor_monate: {
    headline: "Bevor du Monate verschwendest: Prüfe jetzt, ob du echtes Closing-Potenzial hast.",
    subline: "5 Fragen. 90 Sekunden. Eine ehrliche Einschätzung.",
  },
  D_kostenloser_check: {
    headline: "Kostenloser Potenzial-Check für angehende Closer.",
    subline: "5 Fragen. 90 Sekunden. Kein Druck. Kein Verkaufsgespräch.",
  },
};

export const LP_CTA_V2_COPY: Record<string, string | null> = {
  control: null,
  potenzial_pruefen: "Potenzial prüfen",
  test_starten_90s: "90-Sekunden-Test starten",
  kostenloser_check: "Kostenlosen Check starten",
  jetzt_herausfinden: "Jetzt herausfinden",
};

export const LP_REMOVE_FRICTION_COPY: Record<string, string | null> = {
  control: null,
  A_5_fragen: "5 Fragen",
  B_90s: "90 Sekunden",
  C_kein_verkauf: "Kein Verkaufsgespräch",
  D_all_three: "5 Fragen · 90 Sekunden · kein Verkaufsgespräch",
};

export const Q1_MICRO_COMMITMENT_COPY: Record<string, string | null> = {
  control: null,
  A_5_fragen: "Beantworte 5 kurze Fragen.",
  B_unter_90s: "Dauert weniger als 90 Sekunden.",
  C_sofort: "Dein Ergebnis wird sofort berechnet.",
  D_all_three: "5 kurze Fragen · unter 90 Sekunden · sofortiges Ergebnis",
};

export const PROGRESS_FAST_COPY: Record<string, string | null> = {
  control: null,
  pct_20: "20 % erledigt",
  step_1_of_5: "Schritt 1 von 5",
  fast_geschafft: "Fast geschafft",
  analyse_laeuft: "Persönliche Analyse läuft",
};

/**
 * Low-signal archive threshold (Teil F). Slots that, after 14 days, have
 * <100 exposures AND 0 leads AND 0 bookings are flagged `archived_low_signal`
 * by `isLowSignalSlot()` so dashboards can hide them. Winner Engine,
 * Attribution and history remain untouched.
 */
export const LOW_SIGNAL_ARCHIVE = {
  minAgeDays: 14,
  maxExposures: 100,
  maxLeads: 0,
  maxBookings: 0,
} as const;


// ─── Hero-Simplification copy maps ───────────────────────────────────────
export const SIMPLE_HERO_COPY: Record<
  string,
  { headline: string; subline: string; cta: string } | null
> = {
  control: null,
  A_more_in_you: {
    headline: "Vielleicht steckt mehr in dir.",
    subline:
      "Finde in 90 Sekunden heraus, ob Remote Sales ein sinnvoller nächster Schritt für dich ist.",
    cta: "90-Sekunden Check starten",
  },
  B_direction: {
    headline:
      "Vielleicht fehlt dir nicht Motivation. Vielleicht fehlt dir Richtung.",
    subline:
      "Beantworte 5 kurze Fragen und finde heraus, welcher nächste Schritt zu dir passt.",
    cta: "Richtungs-Check starten",
  },
  C_path_fits: {
    headline: "Finde heraus, ob dieser Weg zu dir passt.",
    subline: "5 kurze Fragen. 90 Sekunden. Kein Druck. Keine Verpflichtung.",
    cta: "Potenzial prüfen",
  },
};

export const SIMPLE_HERO_MICRO_TRUST =
  "90 Sekunden · 5 Fragen · kein Verkaufsgespräch";

export const Q1_INSTANT_OPTIONS: readonly string[] = [
  "Ich möchte mich beruflich weiterentwickeln",
  "Ich suche nach einer neuen Perspektive",
  "Ich möchte ortsunabhängiger arbeiten",
  "Ich möchte neue Fähigkeiten aufbauen",
  "Ich möchte mehr aus meinem Potenzial machen",
];

// ─── Copy maps ───────────────────────────────────────────────────────────
export const LP_FIRST_WIN_COPY: Record<string, string> = {
  klarheit_90s: "90 Sekunden Klarheit",
  naechster_schritt: "Finde deinen nächsten Schritt",
  potenzial_check: "Prüfe dein Potenzial",
  passt_zu_dir: "Finde heraus, ob dieser Weg zu dir passt",
};

export const LP_MICRO_TRUST_COPY: Record<string, string[]> = {
  "90s_5fragen": ["90 Sekunden", "5 Fragen", "kein Verkaufsgespräch"],
  kostenlos_kein_druck: [
    "kostenlose Einschätzung",
    "kein Druck",
    "sofortiges Ergebnis",
  ],
  keine_bewerbung: ["keine Bewerbung", "keine Verpflichtung", "nur Klarheit"],
};

export const LP_RISK_REDUCER_COPY: Record<string, string> = {
  nichts_entscheiden: "Du musst heute nichts entscheiden.",
  nur_orientierung: "Der Check dient nur deiner Orientierung.",
  nur_klarheit: "Keine Verpflichtung. Nur Klarheit.",
};

export const LP_STICKY_CTA_COPY: Record<string, string> = {
  klarheit_90s: "90 Sek. Klarheit",
  richtungs_check: "Richtungs-Check",
  potenzial_pruefen: "Potenzial prüfen",
};

export const COMPLETION_BOOSTER_COPY: Record<string, string> = {
  ergebnis_wartet: "Dein Ergebnis wartet.",
  wenige_sekunden: "Noch wenige Sekunden.",
  fast_geschafft: "Fast geschafft.",
};

export const LEAD_COMMITMENT_COPY: Record<string, string> = {
  entwicklungsorientiert: "Du wirkst entwicklungsorientiert.",
  potenzial_remote_sales: "Du hast Potenzial für Remote Sales.",
  aktiv_wachsen:
    "Dein Profil passt zu Menschen, die aktiv wachsen möchten.",
};
