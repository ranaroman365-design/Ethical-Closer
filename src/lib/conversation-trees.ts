/**
 * ========================================================================
 * CONVERSATION TREES — Layer 48.3
 * ========================================================================
 *
 * Deterministic branching layer for the WhatsApp AI Setter.
 * Sits on top of:
 *  - Layer 38 (Conversational AI — intents, states, collisions)
 *  - Layer 48.1 (WhatsApp Message Library — canonical templates)
 *  - Layer 48.2 (Humanized Message Generator — AI overlay)
 *
 * NOT a script. A decision graph:
 *   start → detect lead state → choose branch → respond → re-evaluate
 *
 * Hard rules (immutable):
 *  - 5 lead states only: interested · curious · hesitant · resistant · silent
 *  - One state ⇒ exactly one branch (deterministic, no AI choice here)
 *  - Branch returns: next_template_key + goal + next_action
 *  - Booking link is ONLY emitted when state = interested OR booking confirmed
 *  - No pressure copy, no repetition, no spam
 *  - Tone/wording always sourced from Message Library (Layer 48.1)
 *  - Humanizer (Layer 48.2) may only refine inside the chosen branch
 *
 * Block: Conversion · Canon-Map: C8.3
 */

export const LAYER_ID = 48.3;
export const LAYER_NAME = "Conversation Trees";

// ─── Lead states (the 5 canonical only) ──────────────────────────────────
export const LEAD_STATES = [
  "interested",
  "curious",
  "hesitant",
  "resistant",
  "silent",
] as const;
export type LeadState = (typeof LEAD_STATES)[number];

// ─── Reply tempo (micro-dynamic) ─────────────────────────────────────────
export type ReplySpeed = "fast" | "normal" | "slow" | "none";
export type ReplyTone = "direct" | "soft" | "neutral";

// ─── Branch goals (what this turn must achieve) ──────────────────────────
export const BRANCH_GOALS = [
  "move_to_booking",
  "give_safety",
  "neutralize_uncertainty",
  "remove_pressure_keep_door_open",
  "force_decision_soft",
  "force_decision_hard",
  "confirm_booking",
] as const;
export type BranchGoal = (typeof BRANCH_GOALS)[number];

// ─── Next action the orchestrator must take ──────────────────────────────
export type NextAction =
  | "send_message"
  | "send_message_with_booking_link"
  | "schedule_followup_2_4h"
  | "schedule_followup_24h"
  | "close_conversation"
  | "escalate_to_human";

// ─── Branch definition ───────────────────────────────────────────────────
export interface ConversationBranch {
  state: LeadState;
  goal: BranchGoal;
  /** Reference into Layer 48.1 message library (event_key or template_key). */
  template_key: string;
  next_action: NextAction;
  /** Optional follow-up branch if user goes silent after this turn. */
  on_silence?: LeadState;
  tone: ReplyTone;
  notes: string;
}

// ─── The tree (one branch per state) ─────────────────────────────────────
export const CONVERSATION_TREE: Record<LeadState, ConversationBranch> = {
  interested: {
    state: "interested",
    goal: "move_to_booking",
    template_key: "branch_interested",
    next_action: "send_message_with_booking_link",
    on_silence: "silent",
    tone: "direct",
    notes: "User confirmed goal. Move directly to booking.",
  },
  curious: {
    state: "curious",
    goal: "give_safety",
    template_key: "branch_curious",
    next_action: "send_message",
    on_silence: "silent",
    tone: "neutral",
    notes: "User wants to understand. Give clarity, no pressure.",
  },
  hesitant: {
    state: "hesitant",
    goal: "neutralize_uncertainty",
    template_key: "branch_hesitant",
    next_action: "send_message",
    on_silence: "silent",
    tone: "soft",
    notes: "User unsure. Normalize, then offer low-friction next step.",
  },
  resistant: {
    state: "resistant",
    goal: "remove_pressure_keep_door_open",
    template_key: "branch_resistant",
    next_action: "send_message",
    on_silence: "silent",
    tone: "soft",
    notes: "User pushing back. De-escalate. Door stays open, no chase.",
  },
  silent: {
    state: "silent",
    goal: "force_decision_soft",
    template_key: "branch_silent_followup_1",
    next_action: "schedule_followup_2_4h",
    tone: "neutral",
    notes:
      "Ghosting. Two-step follow-up: 2–4h soft, then 24h hard decision-forcing.",
  },
};

// ─── Tone hint by reply speed (micro-dynamic) ────────────────────────────
export function toneFromSpeed(speed: ReplySpeed): ReplyTone {
  switch (speed) {
    case "fast":
      return "direct";
    case "slow":
      return "soft";
    case "none":
      return "neutral";
    case "normal":
    default:
      return "neutral";
  }
}

// ─── Lightweight state classifier from raw text ──────────────────────────
// Deterministic keyword pass — Layer 38 may override with AI intent.
const PATTERNS: Record<LeadState, RegExp[]> = {
  interested: [
    /\b(ja|jap|jo|genau|passt|stimmt|klar|sicher|yes|right|exactly)\b/i,
    /\b(buchen|termin|los geht'?s|machen wir)\b/i,
  ],
  curious: [
    /\b(vielleicht|wie läuft|wie funktioniert|was kostet|was ist|maybe|how does)\b/i,
    /\?$/,
  ],
  hesitant: [
    /\b(weiß nicht|unsicher|nicht sicher|hmm|mal sehen|not sure|i don'?t know)\b/i,
  ],
  resistant: [
    /\b(kein interesse|zu teuer|keine zeit|nein danke|nicht für mich|not interested|no thanks|too expensive)\b/i,
  ],
  silent: [/^$/],
};

export function detectLeadState(input: {
  text?: string;
  hours_since_last_user_message?: number;
}): LeadState {
  const text = (input.text ?? "").trim();
  if (!text) return "silent";
  if ((input.hours_since_last_user_message ?? 0) >= 4 && text.length === 0)
    return "silent";

  for (const state of LEAD_STATES) {
    if (state === "silent") continue;
    if (PATTERNS[state].some((re) => re.test(text))) return state;
  }
  // Default: a typed-but-unclassified reply is "curious" not "silent"
  return "curious";
}

// ─── Resolve next branch (the one public entrypoint) ─────────────────────
export interface BranchInput {
  state: LeadState;
  speed?: ReplySpeed;
  follow_up_stage?: 0 | 1 | 2; // for silent state only
}

export interface BranchOutput {
  branch: ConversationBranch;
  tone: ReplyTone;
  template_key: string;
  next_action: NextAction;
  emit_booking_link: boolean;
  rationale: string;
}

export function resolveBranch(input: BranchInput): BranchOutput {
  const base = CONVERSATION_TREE[input.state];
  const tone = toneFromSpeed(input.speed ?? "normal");

  // Silent has a 2-step ladder
  if (input.state === "silent") {
    const stage = input.follow_up_stage ?? 1;
    if (stage >= 2) {
      return {
        branch: base,
        tone: "neutral",
        template_key: "branch_silent_followup_2",
        next_action: "schedule_followup_24h",
        emit_booking_link: false,
        rationale:
          "Silent stage 2 — force decision: continue or close. No further chase.",
      };
    }
    return {
      branch: base,
      tone: "neutral",
      template_key: "branch_silent_followup_1",
      next_action: "schedule_followup_2_4h",
      emit_booking_link: false,
      rationale: "Silent stage 1 — soft relevance check at 2–4h.",
    };
  }

  return {
    branch: base,
    tone,
    template_key: base.template_key,
    next_action: base.next_action,
    emit_booking_link: input.state === "interested",
    rationale: `State=${input.state} → goal=${base.goal} via ${base.template_key} (tone=${tone}).`,
  };
}

// ─── Inline copy templates (DE/EN) for the 5 branches + 2 silent steps ──
// These mirror the canonical script. Keep short. No pressure. No hype.
export const BRANCH_COPY: Record<
  string,
  { de: string; en: string; vars: string[] }
> = {
  branch_start: {
    de: `Hey {{first_name}},\n\nich habe mir kurz deine Antworten angeschaut.\n\nDu meintest, dass du {{goal}} erreichen willst — passt das noch so?`,
    en: `Hey {{first_name}},\n\nI took a quick look at your answers.\n\nYou mentioned you want to reach {{goal}} — is that still accurate?`,
    vars: ["first_name", "goal"],
  },
  branch_interested: {
    de: `Perfekt.\n\nDann macht es Sinn, dass wir das kurz gemeinsam durchgehen.\n\nHier kannst du dir direkt einen Termin aussuchen:\n{{booking_link}}`,
    en: `Perfect.\n\nThen it makes sense to walk through this together.\n\nPick a time that works for you here:\n{{booking_link}}`,
    vars: ["booking_link"],
  },
  branch_curious: {
    de: `Gute Frage.\n\nIm Prinzip schauen wir gemeinsam, wo du gerade stehst und ob das System für dich Sinn macht.\n\nKein Druck — nur Klarheit.\n\nWillst du dir das kurz anschauen?`,
    en: `Good question.\n\nWe simply look at where you are and whether the system makes sense for you.\n\nNo pressure — just clarity.\n\nWant to take a quick look?`,
    vars: [],
  },
  branch_hesitant: {
    de: `Verstehe ich.\n\nDie meisten sind an genau dem Punkt.\n\nDeshalb macht ein kurzes Gespräch Sinn — damit du danach klar entscheiden kannst.\n\nWann würde es dir passen?`,
    en: `Understandable.\n\nMost people are exactly at this point.\n\nThat's why a short call helps — so you can decide clearly afterwards.\n\nWhen would work for you?`,
    vars: [],
  },
  branch_resistant: {
    de: `Alles gut.\n\nDann lass uns nichts überstürzen.\n\nEine kurze Einschätzung kann dir aber helfen, die Situation besser einzuordnen.\n\nWenn du willst, können wir das kurz machen.`,
    en: `All good.\n\nLet's not rush anything.\n\nA short assessment can still help you place your situation better.\n\nIf you want, we can do that briefly.`,
    vars: [],
  },
  branch_silent_followup_1: {
    de: `Kurze Frage:\n\nIst das Thema gerade noch relevant für dich?`,
    en: `Quick question:\n\nIs this still relevant for you right now?`,
    vars: [],
  },
  branch_silent_followup_2: {
    de: `Ich will dich nicht unnötig anschreiben.\n\nSag mir kurz: sollen wir das weiterverfolgen oder schließen?`,
    en: `I don't want to keep messaging unnecessarily.\n\nLet me know: should we keep going or close this?`,
    vars: [],
  },
};

export function renderBranchCopy(
  templateKey: string,
  vars: Record<string, string | undefined>,
  lang: "de" | "en" = "de",
): { body: string; missing_variables: string[] } {
  const tpl = BRANCH_COPY[templateKey];
  if (!tpl) return { body: "", missing_variables: [`template:${templateKey}`] };
  const missing: string[] = [];
  let body = tpl[lang];
  for (const v of tpl.vars) {
    const val = vars[v];
    if (val == null || val === "") {
      missing.push(v);
      continue;
    }
    body = body.split(`{{${v}}}`).join(String(val));
  }
  // Drop any unresolved {{...}} lines defensively
  body = body
    .split("\n")
    .filter((line) => !/\{\{[^}]+\}\}/.test(line))
    .join("\n");
  return { body, missing_variables: missing };
}

// ─── Learning surface (read-only metric keys) ────────────────────────────
export const TREE_METRICS = {
  booking_rate_per_branch: "tree.booking_rate.{state}",
  drop_off_per_branch: "tree.drop_off.{state}",
  silent_recovery_rate: "tree.silent_recovery_rate",
  avg_turns_to_booking: "tree.avg_turns_to_booking",
} as const;
