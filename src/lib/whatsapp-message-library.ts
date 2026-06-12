/**
 * Layer 48.1 — WhatsApp Message Library (Goldstandard Templates)
 *
 * Constitutional position:
 *   Block:        Foundation + Conversion
 *   Governing:    Communication OS (Layer 48) + Canonical Message Library (Layer 31)
 *   Channel role: WhatsApp = ACTION / REACTION (locked in Layer 48)
 *
 * Purpose:
 *   Single registry of the 15 canonical WhatsApp templates. Every outbound
 *   WhatsApp body MUST be sourced from here — no inline strings in senders,
 *   no scattered copies, no operator-typed conversion messages.
 *
 * Hard rules:
 *   1. Every entry maps to exactly ONE event_key from TOUCHPOINT_MATRIX
 *      (Layer 48) OR an internal alert key prefixed with "internal.".
 *   2. Body MUST stay short, calm, action-oriented. No emojis stacking,
 *      no hype, no pressure language. Selection-over-Pressure principle.
 *   3. Variables use {{snake_case}}. Use renderTemplate() — never string-concat.
 *   4. DE + EN versions kept in lockstep. Add both or neither.
 *   5. Tone classification is read-only metadata for the dashboard preview.
 */

import type { CommChannel } from "./communication-os";

export const WHATSAPP_LIBRARY_LAYER_ID = 48.1 as const;

export type MessageTone =
  | "internal_alert"   // operator-facing, terse, dashboard-style
  | "calm_action"      // lead-facing, primary conversion driver
  | "confirmation"     // factual, reduces uncertainty
  | "reminder"         // gentle attendance nudge
  | "critical_reminder"// last-mile, time-sensitive
  | "recovery"         // post no-show, low pressure
  | "decision_trigger" // forces clean yes/no
  | "soft_follow_up"   // reactivation without push
  | "outcome"          // post-call qualification
  | "rejection_calm"   // not-qualified, dignified
  | "onboarding"       // welcome, set expectations
  | "progression"      // level-up, scope shift
  | "performance_warning" // talent dip, corrective
  | "performance_praise"; // talent peak, reinforce

export interface WhatsAppVariant {
  /** Stable variant id within a template. NEVER rename. "control" is reserved. */
  variant_id: string;
  /** Routing weight. Sum across active variants ≠ 0. */
  weight: number;
  /** Set false to retire a losing variant without deleting it. */
  active?: boolean;
  /** Bilingual bodies for this variant. */
  body: { de: string; en: string };
  /** Optional short label for the dashboard. */
  label?: string;
}

export interface WhatsAppTemplate {
  /** Stable key used by senders + analytics. NEVER rename. */
  template_key: string;
  /** Maps to TOUCHPOINT_MATRIX.event_key. "internal.*" = operator alert. */
  event_key: string;
  /** Always "whatsapp" — typed for join with Layer 48. */
  channel: Extract<CommChannel, "whatsapp">;
  tone: MessageTone;
  /** Required variables. Render fails if any are missing. */
  variables: readonly string[];
  /** Optional variables (omitted lines are dropped at render time). */
  optional_variables?: readonly string[];
  /** Bilingual bodies (the control variant). */
  body: { de: string; en: string };
  /** Optional A/B challengers. Control = the body field above (variant_id "control"). */
  variants?: readonly WhatsAppVariant[];
  /** Why this exists, audit-only. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// 15 canonical templates
// ---------------------------------------------------------------------------
export const WHATSAPP_TEMPLATES: readonly WhatsAppTemplate[] = [
  // 1 — HOT LEAD ALERT (internal, operator)
  {
    template_key: "wa.internal.hot_lead_alert",
    event_key: "internal.hot_lead_alert",
    channel: "whatsapp",
    tone: "internal_alert",
    variables: ["name", "score", "income_goal"],
    body: {
      en: "🔥 Hot Lead\n\nName: {{name}}\nScore: {{score}} / 18\nTarget: {{income_goal}}\n\nStatus: Ready to book\n\n→ Open dashboard or assign now",
      de: "🔥 Hot Lead\n\nName: {{name}}\nScore: {{score}} / 18\nZiel: {{income_goal}}\n\nStatus: Bereit für Buchung\n\n→ Dashboard öffnen oder jetzt zuweisen",
    },
    rationale: "Operator-facing dashboard-style alert. Trigger immediate reaction.",
  },

  // 2 — QUIZ COMPLETED (lead)
  {
    template_key: "wa.lead.quiz_completed",
    event_key: "quiz_completed_followup",
    channel: "whatsapp",
    tone: "calm_action",
    variables: ["name", "booking_link"],
    body: {
      en: "Hey {{name}},\n\nbased on your answers, you're a strong fit for the system.\n\nNext step is simple:\nsecure a short call and see if this actually makes sense for you.\n\n→ {{booking_link}}",
      de: "Hey {{name}},\n\nbasierend auf deinen Antworten passt das System gut zu dir.\n\nNächster Schritt ist einfach:\nKurzes Gespräch sichern und schauen, ob es wirklich passt.\n\n→ {{booking_link}}",
    },
    rationale: "Calm conversion to booking. No pressure, clear next step.",
    variants: [
      {
        variant_id: "direct_v1",
        weight: 1,
        label: "Direct opener",
        body: {
          en: "Hey {{name}},\n\nyou qualify.\n\nOne short call decides the rest:\n→ {{booking_link}}",
          de: "Hey {{name}},\n\ndu qualifizierst dich.\n\nEin kurzes Gespräch entscheidet den Rest:\n→ {{booking_link}}",
        },
      },
      {
        variant_id: "question_v1",
        weight: 1,
        label: "Question opener",
        body: {
          en: "Hey {{name}},\n\nbased on your answers — do you want to see if this actually fits you?\n\n→ {{booking_link}}",
          de: "Hey {{name}},\n\nbasierend auf deinen Antworten — willst du schauen, ob das wirklich zu dir passt?\n\n→ {{booking_link}}",
        },
      },
    ],
  },

  // 3 — BOOKING CONFIRMATION
  {
    template_key: "wa.booking.confirmation",
    event_key: "booking_confirmation",
    channel: "whatsapp",
    tone: "confirmation",
    variables: ["time", "reschedule_link"],
    body: {
      en: "Your call is confirmed.\n\nWe'll speak at {{time}}.\n\nMake sure you're in a quiet place — this is where we look at whether this actually fits.\n\nIf something changes:\n→ {{reschedule_link}}",
      de: "Dein Call ist bestätigt.\n\nWir sprechen um {{time}}.\n\nSorge dafür, dass du an einem ruhigen Ort bist — hier schauen wir, ob das wirklich passt.\n\nFalls sich etwas ändert:\n→ {{reschedule_link}}",
    },
    rationale: "Reduce uncertainty. Set context before the call.",
  },

  // 4 — 24H REMINDER
  {
    template_key: "wa.reminder.24h",
    event_key: "pre_call_reminder_24h",
    channel: "whatsapp",
    tone: "reminder",
    variables: ["time"],
    body: {
      en: "Quick reminder for tomorrow.\n\nWe'll speak at {{time}}.\n\nNothing to prepare — just be there and we'll walk through it together.",
      de: "Kurze Erinnerung für morgen.\n\nWir sprechen um {{time}}.\n\nNichts vorzubereiten — sei einfach da, wir gehen es gemeinsam durch.",
    },
    rationale: "Maintain momentum without pressure 24h ahead.",
  },

  // 5 — 3H REMINDER
  {
    template_key: "wa.reminder.3h",
    event_key: "pre_call_reminder_3h",
    channel: "whatsapp",
    tone: "reminder",
    variables: ["calendar_link"],
    body: {
      en: "We're speaking in a few hours.\n\nIf this is still relevant for you, make sure you're there.\n\n→ {{calendar_link}}",
      de: "Wir sprechen in wenigen Stunden.\n\nWenn das für dich noch relevant ist, sei dabei.\n\n→ {{calendar_link}}",
    },
    rationale: "Soft commitment check 3h ahead.",
  },

  // 6 — 30MIN REMINDER (CRITICAL)
  {
    template_key: "wa.reminder.30min",
    event_key: "pre_call_reminder_30min",
    channel: "whatsapp",
    tone: "critical_reminder",
    variables: ["call_link", "reschedule_link"],
    body: {
      en: "Starting in 30 minutes.\n\nJoin here:\n→ {{call_link}}\n\nIf you can't make it, reschedule now:\n→ {{reschedule_link}}",
      de: "Start in 30 Minuten.\n\nHier beitreten:\n→ {{call_link}}\n\nFalls du es nicht schaffst, jetzt verschieben:\n→ {{reschedule_link}}",
    },
    rationale: "Last-mile attendance nudge with reschedule escape hatch.",
    variants: [
      {
        variant_id: "urgent_v1",
        weight: 1,
        label: "Urgent direct",
        body: {
          en: "30 minutes.\n\n→ {{call_link}}\n\nCan't make it? → {{reschedule_link}}",
          de: "30 Minuten.\n\n→ {{call_link}}\n\nNicht möglich? → {{reschedule_link}}",
        },
      },
    ],
  },

  // 7 — NO SHOW (5–10 MIN)
  {
    template_key: "wa.no_show.immediate",
    event_key: "no_show_immediate",
    channel: "whatsapp",
    tone: "recovery",
    variables: ["name", "reschedule_link"],
    body: {
      en: "Hey {{name}},\n\nlooks like you couldn't make it.\n\nNo problem — happens.\n\nIf you still want to move forward:\n→ {{reschedule_link}}",
      de: "Hey {{name}},\n\nsieht aus, als hättest du es nicht geschafft.\n\nKein Problem — passiert.\n\nWenn du trotzdem weitergehen willst:\n→ {{reschedule_link}}",
    },
    rationale: "Low-pressure recovery within 10min of missed call.",
  },

  // 7b — NO SHOW 2H REMINDER (soft check-in)
  {
    template_key: "wa.no_show.2h_reminder",
    event_key: "no_show_2h_reminder",
    channel: "whatsapp",
    tone: "soft_follow_up",
    variables: ["name", "reschedule_link"],
    body: {
      en: "Hey {{name}},\n\njust checking in.\n\nYour session is still available — just pick a new time:\n→ {{reschedule_link}}",
      de: "Hey {{name}},\n\nkurzes Check-in.\n\nDein Gespräch ist noch verfügbar — wähle einfach einen neuen Termin:\n→ {{reschedule_link}}",
    },
    rationale: "2h soft follow-up. Still warm, no pressure. Reschedule link only.",
  },

  // 8 — NO SHOW 24H FOLLOW-UP (decision trigger)
  {
    template_key: "wa.no_show.24h_decision",
    event_key: "no_show_24h_followup",
    channel: "whatsapp",
    tone: "decision_trigger",
    variables: ["reschedule_link"],
    body: {
      en: "Quick check:\n\ndo you still want to look into this, or should I close this on my side?\n\n→ {{reschedule_link}}",
      de: "Kurze Frage:\n\nWillst du dir das noch ansehen, oder soll ich das von meiner Seite schließen?\n\n→ {{reschedule_link}}",
    },
    rationale: "Forces clean yes/no. Highest-converting reactivation message.",
    variants: [
      {
        variant_id: "softer_v1",
        weight: 1,
        label: "Soft re-open",
        body: {
          en: "Hey — short one:\n\nshould I keep this slot open for you, or close it?\n\n→ {{reschedule_link}}",
          de: "Hey — kurz:\n\nsoll ich den Slot für dich offen halten oder schließen?\n\n→ {{reschedule_link}}",
        },
      },
    ],
  },

  // 9 — SETTER FOLLOW-UP (no booking)
  {
    template_key: "wa.setter.no_booking_followup",
    event_key: "setter_followup_no_booking",
    channel: "whatsapp",
    tone: "soft_follow_up",
    variables: ["name", "link"],
    body: {
      en: "Hey {{name}},\n\nyou started but didn't finish your application.\n\nIf this is something you want to explore, you can complete it here:\n\n→ {{link}}",
      de: "Hey {{name}},\n\ndu hast angefangen, aber deine Bewerbung nicht abgeschlossen.\n\nFalls du das weiter prüfen willst, hier abschließen:\n\n→ {{link}}",
    },
    rationale: "Reactivate abandoned applicants without sales pressure.",
    variants: [
      {
        variant_id: "permission_v1",
        weight: 1,
        label: "Permission ask",
        body: {
          en: "Hey {{name}},\n\nokay if I send you the link to finish your application?\n\n→ {{link}}",
          de: "Hey {{name}},\n\nokay, wenn ich dir den Link zum Abschließen schicke?\n\n→ {{link}}",
        },
      },
    ],
  },

  // 10 — QUALIFIED AFTER CALL
  {
    template_key: "wa.post_call.qualified",
    event_key: "post_call_qualified",
    channel: "whatsapp",
    tone: "outcome",
    variables: [],
    body: {
      en: "Good speaking with you.\n\nBased on this, you're a strong fit.\n\nNext step:\nwe move this forward.\n\nYou'll get everything you need shortly.",
      de: "Gut, mit dir gesprochen zu haben.\n\nBasierend darauf passt es.\n\nNächster Schritt:\nwir gehen weiter.\n\nDu bekommst gleich alles, was du brauchst.",
    },
    rationale: "Confirms outcome and signals next-step delivery is automatic.",
  },

  // 11 — NOT QUALIFIED
  {
    template_key: "wa.post_call.not_qualified",
    event_key: "post_call_not_qualified",
    channel: "whatsapp",
    tone: "rejection_calm",
    variables: [],
    body: {
      en: "Thanks for taking the time.\n\nRight now, this might not be the right step.\n\nIf things change, you can always come back.",
      de: "Danke für deine Zeit.\n\nAktuell ist das vielleicht nicht der richtige Schritt.\n\nFalls sich das ändert, du kannst jederzeit zurückkommen.",
    },
    rationale: "Dignified rejection. Keeps door open without future-pacing pressure.",
  },

  // 12 — ONBOARDING START
  {
    template_key: "wa.onboarding.start",
    event_key: "onboarding_started",
    channel: "whatsapp",
    tone: "onboarding",
    variables: [],
    body: {
      en: "You're in.\n\nWe'll start step by step.\n\nCheck your email for access — and we'll guide you from there.",
      de: "Du bist drin.\n\nWir starten Schritt für Schritt.\n\nCheck deine E-Mail für den Zugang — wir führen dich von dort.",
    },
    rationale: "Welcome confirmation. Hands off to email for documentation (Layer 43).",
  },

  // 13 — LEVEL UP / PROMOTION
  {
    template_key: "wa.progression.level_up",
    event_key: "level_up",
    channel: "whatsapp",
    tone: "progression",
    variables: [],
    body: {
      en: "You've moved to the next level.\n\nThis means more responsibility — and more opportunity.\n\nWe'll show you exactly what changes now.",
      de: "Du hast das nächste Level erreicht.\n\nDas heißt mehr Verantwortung — und mehr Möglichkeit.\n\nWir zeigen dir genau, was sich jetzt ändert.",
    },
    rationale: "Frame promotion as scope expansion, not just status (Layer 19).",
  },

  // 14 — PERFORMANCE WARNING (talent)
  {
    template_key: "wa.talent.performance_warning",
    event_key: "talent_performance_warning",
    channel: "whatsapp",
    tone: "performance_warning",
    variables: [],
    body: {
      en: "Quick note:\n\nyour current performance needs attention.\n\nWe'll go through what to adjust — and get you back on track.",
      de: "Kurzer Hinweis:\n\ndeine aktuelle Performance braucht Aufmerksamkeit.\n\nWir gehen durch, was anzupassen ist — und bringen dich zurück auf Kurs.",
    },
    rationale: "Corrective signal without shame. Implies coaching is automatic.",
  },

  // 15 — HIGH PERFORMER
  {
    template_key: "wa.talent.high_performer",
    event_key: "talent_high_performer",
    channel: "whatsapp",
    tone: "performance_praise",
    variables: [],
    body: {
      en: "Strong work.\n\nYou're operating above the expected level.\n\nWe'll build on this.",
      de: "Starke Arbeit.\n\nDu arbeitest über dem erwarteten Level.\n\nWir bauen darauf auf.",
    },
    rationale: "Reinforce peak performance. Calm, no overhype.",
  },
] as const;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
const TEMPLATES_BY_KEY = new Map<string, WhatsAppTemplate>(
  WHATSAPP_TEMPLATES.map((t) => [t.template_key, t]),
);
const TEMPLATES_BY_EVENT = new Map<string, WhatsAppTemplate>(
  WHATSAPP_TEMPLATES.map((t) => [t.event_key, t]),
);

export function getWhatsAppTemplate(key: string): WhatsAppTemplate | null {
  return TEMPLATES_BY_KEY.get(key) ?? TEMPLATES_BY_EVENT.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// Renderer (strict — fails closed on missing variables)
// ---------------------------------------------------------------------------
export interface RenderResult {
  body: string;
  missing_variables: string[];
}

export function renderWhatsAppTemplate(
  templateKeyOrEvent: string,
  vars: Record<string, string | number | undefined | null>,
  lang: "de" | "en" = "de",
  opts: { variantId?: string } = {},
): (RenderResult & { variant_id: string }) | null {
  const tpl = getWhatsAppTemplate(templateKeyOrEvent);
  if (!tpl) return null;

  const variant = resolveVariant(tpl, opts.variantId);
  const source = variant.body[lang];

  const missing: string[] = [];
  let body = source;

  for (const v of tpl.variables) {
    const val = vars[v];
    if (val === undefined || val === null || val === "") {
      missing.push(v);
      continue;
    }
    body = body.split(`{{${v}}}`).join(String(val));
  }

  // Optional variables — if missing, drop the entire line containing the placeholder.
  for (const v of tpl.optional_variables ?? []) {
    const val = vars[v];
    const placeholder = `{{${v}}}`;
    if (val === undefined || val === null || val === "") {
      body = body
        .split("\n")
        .filter((line) => !line.includes(placeholder))
        .join("\n");
    } else {
      body = body.split(placeholder).join(String(val));
    }
  }

  return { body, missing_variables: missing, variant_id: variant.variant_id };
}

// ---------------------------------------------------------------------------
// Variants — A/B picker (deterministic, weight-based)
// ---------------------------------------------------------------------------

/** Stable string hash (FNV-1a 32-bit). */
function hashKey(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** All variants for a template, including the implicit "control" body. */
export function getAllVariants(tpl: WhatsAppTemplate): WhatsAppVariant[] {
  const control: WhatsAppVariant = {
    variant_id: "control",
    weight: 1,
    active: true,
    label: "Control",
    body: tpl.body,
  };
  const challengers = (tpl.variants ?? []).filter((v) => v.active !== false);
  return [control, ...challengers];
}

/** Pick a variant for a template using a stable bucket key (lead_id/user_id/recipient/random). */
export function pickVariant(
  templateKeyOrEvent: string,
  bucketKey: string,
): { variant_id: string; template_key: string } | null {
  const tpl = getWhatsAppTemplate(templateKeyOrEvent);
  if (!tpl) return null;
  const variants = getAllVariants(tpl);
  if (variants.length === 1) {
    return { variant_id: "control", template_key: tpl.template_key };
  }
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) return { variant_id: "control", template_key: tpl.template_key };
  const bucket = hashKey(`${tpl.template_key}:${bucketKey}`) % total;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (bucket < acc) return { variant_id: v.variant_id, template_key: tpl.template_key };
  }
  return { variant_id: "control", template_key: tpl.template_key };
}

/** Resolve a specific variant (or fall back to control). */
export function resolveVariant(
  tpl: WhatsAppTemplate,
  variantId?: string,
): WhatsAppVariant {
  const all = getAllVariants(tpl);
  if (!variantId) return all[0];
  return all.find((v) => v.variant_id === variantId) ?? all[0];
}

/** Templates that currently run an A/B test (≥1 active challenger). */
export function getABTestedTemplates(): WhatsAppTemplate[] {
  return WHATSAPP_TEMPLATES.filter(
    (t) => (t.variants ?? []).some((v) => v.active !== false),
  );
}

// ---------------------------------------------------------------------------
// Tone metadata for dashboard
// ---------------------------------------------------------------------------
export const TONE_LABEL: Record<MessageTone, string> = {
  internal_alert: "Internal Alert",
  calm_action: "Calm Action",
  confirmation: "Confirmation",
  reminder: "Reminder",
  critical_reminder: "Critical Reminder",
  recovery: "Recovery",
  decision_trigger: "Decision Trigger",
  soft_follow_up: "Soft Follow-up",
  outcome: "Outcome",
  rejection_calm: "Calm Rejection",
  onboarding: "Onboarding",
  progression: "Progression",
  performance_warning: "Performance Warning",
  performance_praise: "Performance Praise",
};
