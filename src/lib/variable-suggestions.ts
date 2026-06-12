/**
 * Layer 48.6 — Variable Validation & Suggestions
 *
 * Constitutional position:
 *   Block:        Conversion (operator UX over Layer 48.1)
 *   Governing:    WhatsApp Message Library (Layer 48.1)
 *
 * Purpose:
 *   Single source of truth for "what value should fill {{variable}}" when an
 *   operator previews or dispatches a template. Used by the dashboard's
 *   Variable Validation Panel to highlight missing vars and propose values
 *   BEFORE dispatch — no inline guessing in components.
 *
 * Hard rules:
 *   1. Suggestions are advisory only. The dispatcher still rejects sends with
 *      missing REQUIRED variables (renderWhatsAppTemplate returns missing_variables).
 *   2. Never invent personal data (name/email/phone). For those, source = lead row.
 *   3. Links must come from the canonical link map — never hardcoded URLs in copy.
 */

export type SuggestionConfidence = "high" | "medium" | "low" | "manual";

export interface VariableSuggestion {
  variable: string;
  suggested_value: string | null;
  confidence: SuggestionConfidence;
  source: string;
  /** Why this suggestion exists; shown as a tooltip. */
  rationale: string;
}

// Canonical link map — single source for any *_link / link variable.
// In production these come from product_config, but defaults are safe.
export const CANONICAL_LINKS: Record<string, string> = {
  booking_link: "https://etc.de/book",
  reschedule_link: "https://etc.de/reschedule",
  apply_link: "https://etc.de/apply",
  payment_link: "https://etc.de/pay",
  link: "https://etc.de/x",
};

// Heuristic suggester — exhaustive for every variable used in WHATSAPP_TEMPLATES.
// Map kept here (not in the library file) so library stays a pure registry.
export function suggestVariableValue(
  variable: string,
  ctx: Record<string, unknown> = {},
): VariableSuggestion {
  const v = variable.toLowerCase();
  const fromCtx = (key: string) =>
    typeof ctx[key] === "string" || typeof ctx[key] === "number"
      ? String(ctx[key])
      : null;

  // 1. Direct context hit always wins (high confidence).
  const direct = fromCtx(variable);
  if (direct && direct.trim() !== "") {
    return {
      variable,
      suggested_value: direct,
      confidence: "high",
      source: "lead_context",
      rationale: `Resolved from supplied lead context field "${variable}".`,
    };
  }

  // 2. Personal identity — never invent.
  if (["name", "first_name", "firstname"].includes(v)) {
    const candidate =
      fromCtx("name") ?? fromCtx("first_name") ?? fromCtx("firstname");
    return {
      variable,
      suggested_value: candidate,
      confidence: candidate ? "high" : "manual",
      source: candidate ? "lead_context" : "operator_required",
      rationale: candidate
        ? "Lead's first name."
        : "Personal — never auto-generated. Operator must supply.",
    };
  }
  if (["email"].includes(v)) {
    const candidate = fromCtx("email");
    return {
      variable,
      suggested_value: candidate,
      confidence: candidate ? "high" : "manual",
      source: candidate ? "lead_context" : "operator_required",
      rationale: candidate ? "Lead email." : "Personal — operator must supply.",
    };
  }
  if (["phone", "phone_number"].includes(v)) {
    const candidate = fromCtx("phone") ?? fromCtx("phone_number");
    return {
      variable,
      suggested_value: candidate,
      confidence: candidate ? "high" : "manual",
      source: candidate ? "lead_context" : "operator_required",
      rationale: candidate ? "Lead phone." : "Personal — operator must supply.",
    };
  }

  // 3. Score / qualification.
  if (["score", "lead_score", "qualification_score"].includes(v)) {
    const candidate =
      fromCtx("score") ?? fromCtx("lead_score") ?? fromCtx("qualification_score");
    return {
      variable,
      suggested_value: candidate ?? "12",
      confidence: candidate ? "high" : "low",
      source: candidate ? "lead_context" : "default_median",
      rationale: candidate
        ? "Lead's qualification score."
        : "No score supplied — falling back to a neutral median.",
    };
  }

  // 4. Income / goal.
  if (["income_goal", "goal", "monthly_goal"].includes(v)) {
    const candidate =
      fromCtx("income_goal") ?? fromCtx("goal") ?? fromCtx("monthly_goal");
    return {
      variable,
      suggested_value: candidate ?? "10k/Monat",
      confidence: candidate ? "high" : "low",
      source: candidate ? "lead_context" : "default_anchor",
      rationale: candidate
        ? "Stated income goal from quiz."
        : "No goal supplied — using calm anchor 10k/Monat.",
    };
  }

  // 5. Time / appointment.
  if (["time", "appointment_time", "slot", "when"].includes(v)) {
    const candidate =
      fromCtx("time") ??
      fromCtx("appointment_time") ??
      fromCtx("slot") ??
      fromCtx("when");
    return {
      variable,
      suggested_value: candidate ?? "Mittwoch 15:00",
      confidence: candidate ? "high" : "medium",
      source: candidate ? "calendar" : "next_available_default",
      rationale: candidate
        ? "Booked slot."
        : "No slot supplied — using next-available placeholder. Replace before dispatch.",
    };
  }

  // 6. Level / role.
  if (["level", "current_level"].includes(v)) {
    const candidate = fromCtx("level") ?? fromCtx("current_level");
    return {
      variable,
      suggested_value: candidate ?? "L1",
      confidence: candidate ? "high" : "low",
      source: candidate ? "operator_profile" : "default_entry_level",
      rationale: candidate
        ? "Operator level from profile."
        : "Defaulting to L1.",
    };
  }
  if (["closer_name", "setter_name", "operator_name"].includes(v)) {
    const candidate =
      fromCtx("closer_name") ??
      fromCtx("setter_name") ??
      fromCtx("operator_name");
    return {
      variable,
      suggested_value: candidate,
      confidence: candidate ? "high" : "manual",
      source: candidate ? "assignment" : "operator_required",
      rationale: candidate
        ? "Assigned operator."
        : "Operator name required from assignment table.",
    };
  }

  // 7. Reason / outcome free-text.
  if (["reason", "rejection_reason"].includes(v)) {
    return {
      variable,
      suggested_value: fromCtx(v),
      confidence: fromCtx(v) ? "high" : "manual",
      source: fromCtx(v) ? "operator_input" : "operator_required",
      rationale: "Free-text — operator should write a calm, specific reason.",
    };
  }

  // 8. Links — canonical map.
  if (v.endsWith("_link") || v === "link") {
    const url = CANONICAL_LINKS[v] ?? CANONICAL_LINKS.link;
    return {
      variable,
      suggested_value: url,
      confidence: "high",
      source: "canonical_link_map",
      rationale: `Canonical ${v}. Override only via product_config.`,
    };
  }

  // 9. Fallback — surface as manual.
  return {
    variable,
    suggested_value: null,
    confidence: "manual",
    source: "operator_required",
    rationale:
      "No heuristic for this variable. Operator must supply a value before dispatch.",
  };
}

export interface ValidationResult {
  template_key: string;
  required_missing: string[];
  optional_missing: string[];
  suggestions: VariableSuggestion[];
  /** Vars that have a high/medium-confidence auto-fill — safe to dispatch. */
  auto_fillable: string[];
  /** Vars that need a human (manual confidence or missing personal data). */
  human_required: string[];
  ready_to_send: boolean;
}

export function validateTemplateVariables(args: {
  template_key: string;
  required: readonly string[];
  optional?: readonly string[];
  context: Record<string, unknown>;
}): ValidationResult {
  const required_missing: string[] = [];
  const optional_missing: string[] = [];
  const suggestions: VariableSuggestion[] = [];
  const auto_fillable: string[] = [];
  const human_required: string[] = [];

  for (const v of args.required) {
    const has = args.context[v];
    if (has === undefined || has === null || has === "") {
      required_missing.push(v);
    }
    const s = suggestVariableValue(v, args.context);
    suggestions.push(s);
    if (
      s.suggested_value &&
      (s.confidence === "high" || s.confidence === "medium")
    ) {
      auto_fillable.push(v);
    } else {
      human_required.push(v);
    }
  }

  for (const v of args.optional ?? []) {
    const has = args.context[v];
    if (has === undefined || has === null || has === "") optional_missing.push(v);
    suggestions.push(suggestVariableValue(v, args.context));
  }

  // Ready to send = every REQUIRED var either supplied or auto-fillable.
  const ready_to_send = args.required.every((v) => {
    if (args.context[v]) return true;
    const s = suggestions.find((x) => x.variable === v);
    return !!(s && s.suggested_value && s.confidence !== "manual");
  });

  return {
    template_key: args.template_key,
    required_missing,
    optional_missing,
    suggestions,
    auto_fillable,
    human_required,
    ready_to_send,
  };
}

/** Merges supplied context with high/medium-confidence suggestions. */
export function buildAutoFilledContext(
  required: readonly string[],
  optional: readonly string[] = [],
  context: Record<string, unknown> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of [...required, ...optional]) {
    const supplied = context[v];
    if (supplied !== undefined && supplied !== null && supplied !== "") {
      out[v] = String(supplied);
      continue;
    }
    const s = suggestVariableValue(v, context);
    if (s.suggested_value && s.confidence !== "manual") {
      out[v] = s.suggested_value;
    }
  }
  return out;
}
