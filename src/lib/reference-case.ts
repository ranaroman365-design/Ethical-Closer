/**
 * Reference Case domain helpers.
 *
 * The verification_hash is the cornerstone of "auditor-verifiable":
 * a third party who is given the canonical payload below can recompute
 * the SHA-256 and confirm the one-pager wasn't tampered with after
 * publication. Keep the field set + ordering stable forever — changing
 * it invalidates every previously signed case.
 */

export interface ReferenceCaseInput {
  client_name: string;
  client_industry: string | null;
  client_company_size: string | null;
  pilot_window_start: string; // YYYY-MM-DD
  pilot_window_end: string;
  outcome_headline: string;
  metric_leads_in: number;
  metric_calls_booked: number;
  metric_calls_held: number;
  metric_deals_closed: number;
  metric_revenue_eur: number;
  metric_close_rate_pct: number;
  proof_type: "named_testimonial" | "anonymized_audit" | "internal_only";
  testimonial_quote: string | null;
  testimonial_author: string | null;
  testimonial_role: string | null;
  testimonial_anonymized: boolean;
  source_partner_profile_id: string | null;
  source_partner_lead_id: string | null;
}

/**
 * Canonical, locale-stable serialization. Numbers are coerced to a fixed
 * representation so JS float quirks (1.10 vs 1.1) can't drift the hash.
 */
export function canonicalPayload(input: ReferenceCaseInput): string {
  const ordered = {
    client_name: input.client_name.trim(),
    client_industry: (input.client_industry ?? "").trim(),
    client_company_size: (input.client_company_size ?? "").trim(),
    pilot_window_start: input.pilot_window_start,
    pilot_window_end: input.pilot_window_end,
    outcome_headline: input.outcome_headline.trim(),
    metric_leads_in: Math.trunc(input.metric_leads_in),
    metric_calls_booked: Math.trunc(input.metric_calls_booked),
    metric_calls_held: Math.trunc(input.metric_calls_held),
    metric_deals_closed: Math.trunc(input.metric_deals_closed),
    metric_revenue_eur: Number(input.metric_revenue_eur).toFixed(2),
    metric_close_rate_pct: Number(input.metric_close_rate_pct).toFixed(2),
    proof_type: input.proof_type,
    testimonial_quote: (input.testimonial_quote ?? "").trim(),
    testimonial_author: (input.testimonial_author ?? "").trim(),
    testimonial_role: (input.testimonial_role ?? "").trim(),
    testimonial_anonymized: !!input.testimonial_anonymized,
    source_partner_profile_id: input.source_partner_profile_id,
    source_partner_lead_id: input.source_partner_lead_id,
  };
  return JSON.stringify(ordered);
}

export async function verificationHash(input: ReferenceCaseInput): Promise<string> {
  const payload = canonicalPayload(input);
  const buf = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function deriveCloseRate(held: number, closed: number): number {
  if (!held || held <= 0) return 0;
  return Math.round((closed / held) * 10000) / 100;
}

/**
 * Quality gate — what makes a case buyer-ready vs draft.
 * Returns the list of missing requirements, or an empty array if green-lit.
 */
export function buyerReadyIssues(input: ReferenceCaseInput): string[] {
  const issues: string[] = [];
  if (!input.client_name.trim()) issues.push("Kundenname fehlt.");
  if (!input.outcome_headline.trim()) issues.push("Headline-Outcome fehlt.");
  if (input.metric_calls_held <= 0) issues.push("Mindestens 1 gehaltener Call nötig.");
  if (input.metric_revenue_eur <= 0 && input.metric_deals_closed <= 0)
    issues.push("Weder Umsatz noch Deals — nichts zu zeigen.");
  if (input.proof_type === "internal_only")
    issues.push("Kein extern verwertbarer Proof gewählt (named oder anonymized_audit).");
  if (input.proof_type === "named_testimonial") {
    if (!input.testimonial_quote?.trim()) issues.push("Testimonial-Zitat fehlt.");
    if (!input.testimonial_author?.trim()) issues.push("Testimonial-Autor fehlt.");
    if (input.testimonial_anonymized)
      issues.push("Named-Testimonial darf nicht anonymisiert sein.");
  }
  if (input.proof_type === "anonymized_audit") {
    if (!input.testimonial_anonymized)
      issues.push("Anonymized-Audit muss als anonymisiert markiert sein.");
    if (!input.testimonial_quote?.trim())
      issues.push("Auch ein anonymisierter Proof braucht einen Auditor-Hinweis.");
  }
  return issues;
}
