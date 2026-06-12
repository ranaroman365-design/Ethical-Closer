/**
 * Lead-storage helper.
 *
 * Single source of truth for persisting the server's qualification verdict
 * into localStorage and choosing the post-quiz route. Without this, every
 * quiz funnel (Apply, Bewerbung, QuizHighIncomeSkill, Booking) had its own
 * ad-hoc handling — which silently dropped the new score after a retake
 * and left the user stuck on a stale "low" verdict.
 *
 * Usage:
 *   const verdict = persistLeadVerdict(rpcResult, { name, email, phone });
 *   navigate(routeForVerdict(verdict));
 */

export type LeadVerdict = {
  leadId?: string;
  quizScore?: number | null;
  leadScore?: number | null;
  leadQuality?: string | null;
  qualificationBucket?: "low" | "mid" | "high" | string | null;
};

type RpcLike = unknown;

export function parseLeadVerdict(rpcResult: RpcLike): LeadVerdict {
  if (!rpcResult || typeof rpcResult !== "object" || Array.isArray(rpcResult)) {
    return {};
  }
  const o = rpcResult as Record<string, unknown>;
  return {
    leadId: typeof o.lead_id === "string" ? o.lead_id : undefined,
    quizScore: typeof o.quiz_score === "number" ? o.quiz_score : null,
    leadScore: typeof o.lead_score === "number" ? o.lead_score : null,
    leadQuality: typeof o.lead_quality === "string" ? o.lead_quality : null,
    qualificationBucket:
      typeof o.qualification_bucket === "string" ? o.qualification_bucket : null,
  };
}

export function persistLeadVerdict(
  rpcResult: RpcLike,
  contact?: { name?: string; email?: string; phone?: string },
): LeadVerdict {
  const v = parseLeadVerdict(rpcResult);

  try {
    if (v.leadId) localStorage.setItem("lead_id", v.leadId);
    if (v.quizScore != null) localStorage.setItem("quiz_score", String(v.quizScore));
    if (v.leadScore != null) localStorage.setItem("lead_score", String(v.leadScore));
    if (v.leadQuality) localStorage.setItem("lead_quality", v.leadQuality);
    if (v.qualificationBucket) {
      localStorage.setItem("qualification_bucket", v.qualificationBucket);
    }
    if (v.quizScore != null) {
      // Booking.tsx and other surfaces still read the historical key name.
      localStorage.setItem("qualification_score", String(v.quizScore));
    }
    if (contact?.name) localStorage.setItem("lead_name", contact.name.trim());
    if (contact?.email) {
      localStorage.setItem("lead_email", contact.email.trim().toLowerCase());
    }
    if (contact?.phone) localStorage.setItem("lead_phone", contact.phone.trim());

    const staleLowKeys = [
      "low_result",
      "low_lead",
      "disqualified",
      "quiz_low_result",
      "low_quality_cache",
      "low_lead_result",
      "low_lead_blocked",
    ];
    staleLowKeys.forEach((key) => localStorage.removeItem(key));

    // Whenever the verdict is no longer "low", clear every stale low gate so
    // a retake can escape the previous disqualified snapshot. If it is still
    // low, keep only the canonical low lock.
    if (v.qualificationBucket && v.qualificationBucket !== "low") {
      localStorage.removeItem("low_lead_locked");
      localStorage.removeItem("qualification_hard_blocked");
    } else if (v.qualificationBucket === "low") {
      localStorage.setItem("low_lead_locked", "1");
    }
  } catch {
    /* localStorage may be unavailable in private mode — non-fatal */
  }

  // ── Auto-provision the L0 applicant portal on quiz submit ──
  // Fire-and-forget: never blocks the funnel, never throws. The edge function
  // is idempotent (finds-or-creates by email), so retakes are safe. The
  // returned magic link is cached so every "Zum Bewerberbereich" CTA can land
  // the user directly inside their own applicant area instead of /members/login.
  // Skips low-bucket leads (they don't get an applicant area).
  if (v.leadId && contact?.email && v.qualificationBucket !== "low") {
    void provisionApplicantBackground({
      leadId: v.leadId,
      email: contact.email.trim().toLowerCase(),
      name: contact.name?.trim(),
    });

    // ── Optional: SMS / WhatsApp access ping ──
    // TODO(provider): no outbound SMS/WhatsApp provider is wired yet.
    // When one is added (e.g. GHL outbound, Twilio), invoke an edge function
    // here with { phone, message } where message =
    //   "Dein Zugang zur Ethical Top Closer Bewerbungsplattform wurde
    //    erstellt. Prüfe deine E-Mail für den Login."
    // Must be fire-and-forget (never block the funnel) and idempotent
    // per (lead_id, channel). Email above remains the mandatory channel.
    if (contact?.phone) {
      // intentionally no-op until provider is configured
    }
  }

  return v;
}

let _provisioningInFlight = false;
async function provisionApplicantBackground(args: {
  leadId: string;
  email: string;
  name?: string;
}) {
  if (_provisioningInFlight) return;
  // De-duplicate per email within a session to avoid spamming the edge function
  // on rapid retakes / double submits.
  try {
    const key = `applicant_provisioned_for:${args.email}`;
    if (typeof localStorage !== "undefined" && localStorage.getItem(key) === "1") {
      return;
    }
  } catch { /* ignore */ }

  _provisioningInFlight = true;
  try {
    const { data, error } = await supabase.functions.invoke("provision-applicant-account", {
      body: { lead_id: args.leadId, email: args.email, name: args.name },
    });
    if (error) {
      console.warn("[lead-storage] applicant provisioning failed (non-fatal)", error);
      return;
    }
    try {
      localStorage.setItem(`applicant_provisioned_for:${args.email}`, "1");
      const magicLink = (data as any)?.magic_link;
      if (typeof magicLink === "string" && magicLink.length > 0) {
        localStorage.setItem("applicant_magic_link", magicLink);
      }
    } catch { /* ignore */ }
  } catch (e) {
    console.warn("[lead-storage] applicant provisioning threw (non-fatal)", e);
  } finally {
    _provisioningInFlight = false;
  }
}

/**
 * Resolve the applicant-portal URL for any "Zum Bewerberbereich" CTA.
 * Prefers the cached magic link from provisioning; falls back to /members/login.
 * Never returns an admin route.
 */
export function getApplicantPortalUrl(): string {
  try {
    const cached = typeof localStorage !== "undefined"
      ? localStorage.getItem("applicant_magic_link")
      : null;
    if (cached && /^https?:\/\//i.test(cached)) return cached;
  } catch { /* ignore */ }
  // Fallback: send to login pre-tagged with applicant context so post-login
  // routing locks the session to the applicant portal even if the email also
  // belongs to an admin/partner profile.
  return "/members/login?ctx=applicant&next=/members/interview";
}

/** Decide where to send the user based on the latest server verdict. */
export function routeForVerdict(
  v: LeadVerdict,
  fallback: { lowPath?: string; defaultPath: string },
): string {
  if (v.qualificationBucket === "low" || v.leadQuality === "C") {
    return fallback.lowPath ?? "/quiz/low-result";
  }
  return fallback.defaultPath;
}

/**
 * Re-read the lead's qualification straight from the DB and (server-side)
 * recompute scores from the stored quiz_answers if that would IMPROVE the
 * bucket. Returns the freshest verdict and persists it to localStorage so
 * UI guards stop relying on a stale snapshot.
 *
 * Used by the Booking gate: never block a user without first confirming
 * with the database that they really are still "low".
 *
 * Safe to call when no lead_id/email is known — returns an empty verdict.
 */
import { supabase } from "@/integrations/supabase/client";

export async function refreshLeadQualification(args?: {
  leadId?: string | null;
  email?: string | null;
}): Promise<LeadVerdict> {
  const leadId =
    args?.leadId ?? (typeof localStorage !== "undefined" ? localStorage.getItem("lead_id") : null);
  const email =
    args?.email ?? (typeof localStorage !== "undefined" ? localStorage.getItem("lead_email") : null);

  if (!leadId && !email) return {};

  try {
    const { data, error } = await supabase.rpc("refresh_lead_qualification" as never, {
      p_lead_id: leadId ?? null,
      p_email: email ?? null,
    } as never);
    if (error) {
      console.warn("[refreshLeadQualification] RPC error", error);
      return {};
    }
    const verdict = persistLeadVerdict(data);
    return verdict;
  } catch (e) {
    console.warn("[refreshLeadQualification] threw", e);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
// Booking Continuation — Token generation & resolution
// ══════════════════════════════════════════════════════════════

/**
 * Generate a secure booking token for a lead. Fire-and-forget safe.
 * Returns the token string, or null if generation fails.
 */
export async function generateBookingToken(leadId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("generate_booking_token", {
      p_lead_id: leadId,
    });
    if (error) {
      console.warn("[generateBookingToken] RPC error", error);
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch (e) {
    console.warn("[generateBookingToken] threw", e);
    return null;
  }
}

/**
 * Result shape from token or email resolution for booking continuation.
 */
export type BookingContinuationResult = {
  leadId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  qualificationBucket: string | null;
  leadQuality: string | null;
  bookingStatus: string | null;
  resolvedVia: "token" | "email";
};

/**
 * Validate a booking continuation token. Returns lead data for prefill,
 * or null if token is invalid/expired.
 */
export async function resolveBookingToken(
  token: string,
): Promise<BookingContinuationResult | null> {
  const tracePrefix = `[resolveBookingToken][${token.substring(0, 8)}…]`;
  try {
    console.info(`${tracePrefix} calling validate_booking_token`);
    const { data, error } = await supabase.rpc("validate_booking_token", {
      p_token: token,
    });
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      console.warn(`${tracePrefix} invalid/expired`, { error: error?.message, dataLength: Array.isArray(data) ? data.length : typeof data });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.lead_id) {
      console.warn(`${tracePrefix} resolved but no lead_id in row`, row);
      return null;
    }
    console.info(`${tracePrefix} resolved → lead_id=${row.lead_id}, email=${row.lead_email ?? "?"}, bucket=${row.qualification_bucket ?? "?"}`);
    return {
      leadId: row.lead_id,
      name: row.lead_name ?? null,
      email: row.lead_email ?? null,
      phone: row.lead_phone ?? null,
      qualificationBucket: row.qualification_bucket ?? null,
      leadQuality: row.lead_quality ?? null,
      bookingStatus: row.booking_status ?? null,
      resolvedVia: "token",
    };
  } catch (e) {
    console.warn(`${tracePrefix} threw`, e);
    return null;
  }
}

/**
 * Resolve a lead by email (fallback when no token available).
 * Returns lead data for prefill, or null if no matching lead.
 */
export async function resolveLeadByEmail(
  email: string,
): Promise<BookingContinuationResult | null> {
  const normalized = email.trim().toLowerCase();
  const tracePrefix = `[resolveLeadByEmail][${normalized}]`;
  try {
    console.info(`${tracePrefix} calling resolve_lead_by_email`);
    const { data, error } = await supabase.rpc("resolve_lead_by_email", {
      p_email: normalized,
    });
    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      console.warn(`${tracePrefix} no match`, { error: error?.message, dataLength: Array.isArray(data) ? data.length : typeof data });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.lead_id) {
      console.warn(`${tracePrefix} resolved but no lead_id in row`, row);
      return null;
    }
    console.info(`${tracePrefix} resolved → lead_id=${row.lead_id}, bucket=${row.qualification_bucket ?? "?"}`);
    return {
      leadId: row.lead_id,
      name: row.lead_name ?? null,
      email: normalized,
      phone: row.lead_phone ?? null,
      qualificationBucket: row.qualification_bucket ?? null,
      leadQuality: row.lead_quality ?? null,
      bookingStatus: row.booking_status ?? null,
      resolvedVia: "email",
    };
  } catch (e) {
    console.warn(`${tracePrefix} threw`, e);
    return null;
  }
}

/**
 * Mark a booking token as used (soft — still valid for the session).
 */
export async function markBookingTokenUsed(token: string): Promise<void> {
  try {
    await supabase.rpc("mark_booking_token_used", { p_token: token });
  } catch {
    /* non-fatal */
  }
}

/**
 * Build a booking continuation URL with token.
 */
export function buildBookingUrl(token: string): string {
  return `/booking?token=${encodeURIComponent(token)}`;
}
