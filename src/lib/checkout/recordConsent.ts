import { supabase } from "@/integrations/supabase/client";
import { PRODUCT } from "@/config/product";
import type { ConsentState } from "@/components/checkout/CheckoutLegalConsent";

interface RecordConsentArgs {
  paymentToken?: string | null;
  leadId?: string | null;
  userId?: string | null;
  email?: string | null;
  consent: ConsentState;
  locale?: string;
  isPaymentPlan?: boolean;
}

/**
 * Persist explicit checkout consent into the append-only audit log.
 * Called immediately BEFORE redirecting to the payment provider.
 *
 * Captures: policy versions, individual checkbox states, IP (server-resolved),
 * user agent, locale, program identification, and a snapshot of policy text identifiers.
 */
export async function recordCheckoutConsent({
  paymentToken,
  leadId,
  userId,
  email,
  consent,
  locale,
  isPaymentPlan = false,
}: RecordConsentArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (
    !consent.acceptedTerms ||
    !consent.acceptedRefund ||
    !consent.acceptedWaiver ||
    !consent.acceptedNoGuarantee ||
    !consent.acceptedAccessDuration
  ) {
    return { ok: false, error: "Consent incomplete" };
  }
  if (isPaymentPlan && consent.acceptedPaymentObligation !== true) {
    return { ok: false, error: "Payment-plan obligation not accepted" };
  }

  // Best-effort IP (set by edge proxy on insert via header pass-through;
  // the column accepts text and may be backfilled server-side).
  let ipAddress: string | null = null;
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    if (r.ok) {
      const j = await r.json();
      ipAddress = typeof j?.ip === "string" ? j.ip : null;
    }
  } catch {
    /* non-blocking */
  }

  const { data, error } = await (supabase as any)
    .from("checkout_consent_log")
    .insert({
      payment_token: paymentToken ?? null,
      lead_id: leadId ?? null,
      user_id: userId ?? null,
      email: email ?? null,
      terms_version: PRODUCT.legal.version,
      refund_version: PRODUCT.legal.version,
      privacy_version: PRODUCT.legal.version,
      accepted_terms: consent.acceptedTerms,
      accepted_refund: consent.acceptedRefund,
      accepted_waiver: consent.acceptedWaiver,
      accepted_no_guarantee: consent.acceptedNoGuarantee,
      accepted_access_duration: consent.acceptedAccessDuration,
      accepted_payment_obligation: isPaymentPlan
        ? consent.acceptedPaymentObligation === true
        : null,
      program_key: PRODUCT.program.key,
      program_duration_weeks: PRODUCT.program.durationWeeks,
      policy_snapshot: {
        company: PRODUCT.legal.company,
        version: PRODUCT.legal.version,
        last_updated: PRODUCT.legal.lastUpdated,
        program: {
          key: PRODUCT.program.key,
          name: PRODUCT.program.name,
          duration_weeks: PRODUCT.program.durationWeeks,
          start_condition: PRODUCT.program.startCondition,
          access_expires: PRODUCT.program.accessExpires,
        },
        is_payment_plan: isPaymentPlan,
        documents: {
          terms: "/terms",
          refund: "/refund-policy",
          privacy: "/privacy",
          legal_notice: "/legal-notice",
          cookie: "/cookie-policy",
        },
      },
      ip_address: ipAddress,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      locale: locale ?? (typeof navigator !== "undefined" ? navigator.language : null),
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[checkout] consent log failed", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data?.id };
}
