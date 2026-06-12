/**
 * MasterOfSales Phase 11 — LP→Quiz Maximizer slots.
 *
 * STRICTLY ADDITIVE. New A/B slots only — no existing slot, copy,
 * weight, or registry entry is modified.
 *
 * Registered automatically with the Winner Engine via `ab_slot_weights`.
 * Winner Engine scoring is UNCHANGED:
 *   Booking ×12 · HQL ×8 · Lead ×4 · Quiz Completion ×2 · Quiz Start ×1
 *
 * Slot summary:
 *   mos_lp_action_mode    — 5 CTA-headline modes
 *   mos_lp_visual_focus   — 4 above-the-fold visual emphases
 *   mos_lp_zero_text      — 4 text-reduction levels (incl. zero-text CTA hero)
 *   mos_lp_instant_start  — 4 CTA-click behaviors (normal / inline / scroll / instant Q1)
 *   mos_lp_message_match  — 6 UTM/creative-driven hero angles
 *   mos_q1_momentum       — 5 Q1 momentum labels
 *
 * MOS-gated: only rendered when `attribution_source` starts with `masterofsales`.
 */
import type { AbSlotDef } from "@/lib/ab-multivariant";

// ─── Part A: LP action mode (CTA headline) ───────────────────────────────
export const MOS_LP_ACTION_MODE: AbSlotDef = {
  slot: "mos_lp_action_mode",
  variants: [
    { id: "A_90s_potenzialcheck", baseWeight: 1 },
    { id: "B_5_fragen_potenzialcheck", baseWeight: 1 },
    { id: "C_potenzial_kostenlos_pruefen", baseWeight: 1 },
    { id: "D_closing_passt_zu_dir", baseWeight: 1 },
    { id: "E_erfolgreich_als_closer", baseWeight: 1 },
  ],
};

export const LP_ACTION_MODE_COPY: Record<
  string,
  { headline: [string, string, string]; cta: string }
> = {
  A_90s_potenzialcheck: {
    headline: ["90 Sekunden", "Potenzialcheck —", "passt Closing zu dir?"],
    cta: "Jetzt in 90 Sek. prüfen",
  },
  B_5_fragen_potenzialcheck: {
    headline: ["5 Fragen.", "Klare Antwort.", "Passt Closing zu dir?"],
    cta: "5 Fragen starten",
  },
  C_potenzial_kostenlos_pruefen: {
    headline: ["Prüfe kostenlos,", "ob Closing wirklich", "zu dir passt."],
    cta: "Potenzial kostenlos prüfen",
  },
  D_closing_passt_zu_dir: {
    headline: ["Finde heraus,", "ob eine Karriere im Closing", "zu dir passt."],
    cta: "Finde es heraus",
  },
  E_erfolgreich_als_closer: {
    headline: ["Kannst du", "als Closer", "wirklich erfolgreich werden?"],
    cta: "Antwort in 90 Sek.",
  },
};

// ─── Part B: Visual focus ────────────────────────────────────────────────
export const MOS_LP_VISUAL_FOCUS: AbSlotDef = {
  slot: "mos_lp_visual_focus",
  variants: [
    { id: "A_cta_only", baseWeight: 1 },
    { id: "B_cta_progress", baseWeight: 1 },
    { id: "C_cta_quizpreview", baseWeight: 1 },
    { id: "D_cta_resultpreview", baseWeight: 1 },
  ],
};

// ─── Part C: Zero-text levels ────────────────────────────────────────────
export const MOS_LP_ZERO_TEXT: AbSlotDef = {
  slot: "mos_lp_zero_text",
  variants: [
    { id: "A_normal_text", baseWeight: 1 },
    { id: "B_half_text", baseWeight: 1 },
    { id: "C_minimal_three_lines", baseWeight: 1 },
    { id: "D_cta_centric", baseWeight: 1 },
  ],
};

// ─── Part D: Instant start behavior ──────────────────────────────────────
export const MOS_LP_INSTANT_START: AbSlotDef = {
  slot: "mos_lp_instant_start",
  variants: [
    { id: "A_normal", baseWeight: 1 },
    { id: "B_quiz_visible", baseWeight: 1 },
    { id: "C_scroll_to_q1", baseWeight: 1 },
    { id: "D_cta_opens_q1", baseWeight: 1 },
  ],
};

// ─── Part E: Message match (UTM/Creative) ────────────────────────────────
export const MOS_LP_MESSAGE_MATCH: AbSlotDef = {
  slot: "mos_lp_message_match",
  variants: [
    { id: "karriere", baseWeight: 1 },
    { id: "freiheit", baseWeight: 1 },
    { id: "remote", baseWeight: 1 },
    { id: "high_ticket", baseWeight: 1 },
    { id: "weiterentwicklung", baseWeight: 1 },
    { id: "einkommen", baseWeight: 1 },
  ],
};

export const MESSAGE_MATCH_COPY: Record<
  string,
  { headline: [string, string, string]; subline: string }
> = {
  karriere: {
    headline: ["Ein klarer Karriereweg", "im Closing —", "Schritt für Schritt."],
    subline:
      "Für Menschen, die einen echten Karriereweg statt eines Side-Hustles wollen.",
  },
  freiheit: {
    headline: ["Arbeite ortsunabhängig.", "Verdiene leistungsbasiert.", "Lebe frei."],
    subline:
      "Closing als Fähigkeit, die dir echte Freiheit gibt — nicht nur das Versprechen davon.",
  },
  remote: {
    headline: ["100 % remote.", "Klar strukturiert.", "Kein Büro mehr."],
    subline:
      "Ortsunabhängig arbeiten, in einem professionellen Closer-Team — von überall.",
  },
  high_ticket: {
    headline: ["Verkaufe High-Ticket-Angebote", "mit echter Methode —", "ohne Druck."],
    subline:
      "Ethische High-Ticket-Closing-Fähigkeit. Keine Tricks. Echte Klarheit.",
  },
  weiterentwicklung: {
    headline: ["Weiterentwicklung statt", "Standby-Karriere —", "lerne eine echte Fähigkeit."],
    subline:
      "Für Menschen, die wachsen wollen statt verwalten.",
  },
  einkommen: {
    headline: ["Leistungsbasiertes Einkommen", "ohne Stundenlohn —", "verdiene, was du leistest."],
    subline:
      "Closing belohnt Können. Lerne die Fähigkeit, die dein Einkommen entkoppelt.",
  },
};

/** Resolve UTM → message-match variant (overrides Winner-Engine pick if matched). */
export function resolveMessageMatchFromUtm(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const p = new URLSearchParams(window.location.search);
    const raw = (
      p.get("utm_content") ||
      p.get("utm_term") ||
      p.get("utm_campaign") ||
      p.get("creative") ||
      ""
    ).toLowerCase();
    if (!raw) return null;
    const map: Array<[RegExp, string]> = [
      [/karrier|career/, "karriere"],
      [/freiheit|freedom|frei\b/, "freiheit"],
      [/remote|ortsunabh/, "remote"],
      [/high.?ticket|highticket|ht/, "high_ticket"],
      [/weiterent|wachs|growth|develop/, "weiterentwicklung"],
      [/einkommen|income|verdien|salary/, "einkommen"],
    ];
    for (const [re, variant] of map) {
      if (re.test(raw)) return variant;
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Part F: Q1 momentum label ───────────────────────────────────────────
export const MOS_Q1_MOMENTUM: AbSlotDef = {
  slot: "mos_q1_momentum",
  variants: [
    { id: "A_normal", baseWeight: 1 },
    { id: "B_1_of_5", baseWeight: 1 },
    { id: "C_progress_bar", baseWeight: 1 },
    { id: "D_90_seconds", baseWeight: 1 },
    { id: "E_no_application", baseWeight: 1 },
  ],
};

export const Q1_MOMENTUM_COPY: Record<string, string | null> = {
  A_normal: null,
  B_1_of_5: "1 von 5",
  C_progress_bar: "Fortschritt",
  D_90_seconds: "Dauert nur 90 Sekunden",
  E_no_application: "Keine Bewerbung erforderlich",
};
