import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { trackFunnelEvent } from "@/lib/track-event";
import { APPLY_AB_TEST_KEY, getApplyAbBucket, type ApplyAbBucket } from "@/lib/apply-ab-test";
import {
  PLAYBOOK_AB_COPY,
  PLAYBOOK_AB_TEST_KEY,
  getPlaybookAbBucket,
  type PlaybookAbBucket,
} from "@/lib/playbook-ab-test";
import { getStickyCtaAttribution } from "@/lib/sticky-cta-state";

const FUNNEL_ID = "playbook";

/** Logical placement of the lead-magnet block. Drives `page_section` on every event. */
export type LeadMagnetSection =
  | "hero"
  | "social_proof"
  | "cta"
  | "faq"
  | "footer"
  | "lead_magnet"
  | "exit_intent";

export interface LeadMagnetProps {
  /**
   * Where this instance is rendered on the page. Sent on every playbook event
   * so we can attribute lead source by section (hero/cta/faq/...).
   * Defaults to "lead_magnet" for backwards compatibility.
   */
  pageSection?: LeadMagnetSection;
}

/**
 * Lead-magnet ("Ethical Closing Playbook") form.
 *
 * Runs a dedicated A/B test on the microcopy block under the CTA via
 * `playbook-ab-test.ts` (`playbook_microcopy_v1`) — independent from the
 * landing-page Apply test so we can isolate the lift on this secondary
 * conversion. Both bucket IDs are emitted on every event so we can also
 * cross-tabulate them later.
 */
const LeadMagnet = ({ pageSection = "lead_magnet" }: LeadMagnetProps = {}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [applyBucket, setApplyBucket] = useState<ApplyAbBucket>("A");
  const [microcopyBucket, setMicrocopyBucket] = useState<PlaybookAbBucket>("A");

  useEffect(() => {
    setApplyBucket(getApplyAbBucket());
    setMicrocopyBucket(getPlaybookAbBucket());
  }, []);

  const { benefit, note } = useMemo(
    () => PLAYBOOK_AB_COPY[microcopyBucket],
    [microcopyBucket],
  );

  // Shared attribution payload for all playbook events.
  // Includes:
  //   - page_section: where the lead magnet is rendered (hero/cta/faq/...)
  //   - sticky_*:     mobile sticky-CTA runtime status at event-time
  //   - apply_ab_*:   landing-page A/B for cross-test analysis
  // Re-evaluated per event call (sticky state is read at call-site, not memoized).
  const baseAttribution = {
    funnel: FUNNEL_ID,
    page_section: pageSection,
    ab_test: PLAYBOOK_AB_TEST_KEY,
    ab_variant: microcopyBucket,
    copy_variant: microcopyBucket,
    holdout: microcopyBucket === "H",
    apply_ab_test: APPLY_AB_TEST_KEY,
    apply_ab_variant: applyBucket,
  } as const;

  // Viewport-triggered impression for the microcopy block.
  // We deliberately do NOT fire on mount — a user might never scroll the CTA
  // into view, in which case the microcopy never had a chance to convert and
  // should not pollute the impression denominator.
  //
  // Each in-view event gets a unique `impression_id` (UUID/random fallback) so
  // downstream analytics can:
  //   1) dedupe on impression_id,
  //   2) join click/submit events back to the exact impression that triggered them,
  //   3) measure time-to-convert per impression.
  //
  // Re-fires once if the user scrolls away and back (≥50% in view), giving us
  // re-exposure data without spamming on every pixel of intersection.
  const microcopyRef = useRef<HTMLDivElement | null>(null);
  const confirmationRef = useRef<HTMLParagraphElement | null>(null);
  const [currentImpressionId, setCurrentImpressionId] = useState<string | null>(null);
  // Timestamp of the successful submit — used to measure perceived delivery latency
  // (i.e. how long between submit and the confirmation actually rendering on screen).
  const submitAtRef = useRef<number | null>(null);
  const confirmationFiredRef = useRef(false);
  // Drop-off instrumentation: track whether the user ever engaged with the form
  // (focused a field, typed) and how many validation rejects they hit before
  // either succeeding or abandoning. Fires `playbook_form_view` once on mount
  // and `playbook_form_first_focus` on the first focus event.
  const formViewFiredRef = useRef(false);
  const firstFocusFiredRef = useRef(false);
  const blockedAttemptsRef = useRef(0);

  // Dev-only mirror of failure events to the browser console so drop-offs are
  // immediately visible while debugging the "Playbook ansehen" flow without
  // having to query event_logs. No-op in production builds.
  const debugLog = (label: string, payload: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[LeadMagnet] ${label}`, payload);
    }
  };

  // Fire `playbook_form_view` once per mount so we can compute the
  // view→submit funnel (denominator) and split conversion by referrer
  // (e.g. came from "Playbook ansehen" CTA on /apply vs direct).
  useEffect(() => {
    if (formViewFiredRef.current) return;
    formViewFiredRef.current = true;
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const fromApplyCta =
      typeof window !== "undefined" &&
      (window.location.search.includes("from=apply") ||
        referrer.includes("/apply"));
    trackFunnelEvent("playbook_form_view", {
      ...baseAttribution,
      referrer: referrer || null,
      arrived_from_apply_cta: fromApplyCta,
      ...getStickyCtaAttribution(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microcopyBucket, applyBucket, pageSection]);

  const handleFieldFocus = (field: "name" | "email") => {
    if (firstFocusFiredRef.current) return;
    firstFocusFiredRef.current = true;
    trackFunnelEvent("playbook_form_first_focus", {
      ...baseAttribution,
      field,
      impression_id: currentImpressionId,
      ...getStickyCtaAttribution(),
    });
  };

  useEffect(() => {
    const el = microcopyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let inView = false;
    let firstSeenAt: number | null = null;

    const newId = (): string => {
      try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
          return crypto.randomUUID();
        }
      } catch { /* fall through */ }
      return `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const nowVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
          if (nowVisible && !inView) {
            inView = true;
            const isFirst = firstSeenAt === null;
            if (isFirst) firstSeenAt = performance.now();
            const impressionId = newId();
            setCurrentImpressionId(impressionId);
            trackFunnelEvent("playbook_microcopy_impression", {
              ...baseAttribution,
              impression_id: impressionId,
              first_impression: isFirst,
              ms_since_mount: Math.round(performance.now()),
              intersection_ratio: Math.round(entry.intersectionRatio * 100) / 100,
              viewport_width: window.innerWidth,
              ...getStickyCtaAttribution(),
            });
          } else if (!nowVisible && inView) {
            inView = false;
          }
        });
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // baseAttribution is derived from the bucket states — depend on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microcopyBucket, applyBucket, pageSection]);

  // Confirmation-shown tracking.
  // Fires `playbook_delivery_confirmed` once per submit, **only** after the
  // confirmation node is actually mounted AND visible in the viewport (≥50%).
  // Why this matters:
  //   - `setSubmitted(true)` only proves the React state flipped — not that the
  //     user perceived a successful delivery acknowledgment.
  //   - The confirmation may render below the fold on small screens; without a
  //     visibility check we'd over-count "delivered" UX.
  // We also report `delivery_latency_ms` (submit → confirmation visible) so we
  // can surface UX regressions where the success state appears with delay.
  useEffect(() => {
    if (!submitted) return;
    const el = confirmationRef.current;
    if (!el) return;

    const fire = (visible: boolean, ratio: number) => {
      if (confirmationFiredRef.current) return;
      confirmationFiredRef.current = true;
      const startedAt = submitAtRef.current ?? performance.now();
      trackFunnelEvent("playbook_delivery_confirmed", {
        ...baseAttribution,
        impression_id: currentImpressionId,
        delivery_latency_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        confirmation_visible: visible,
        intersection_ratio: Math.round(ratio * 100) / 100,
        delivery_method: "email",   // PDF wird laut Confirmation-Copy per E-Mail zugestellt
        ui_state: "confirmation_shown",
        ...getStickyCtaAttribution(),
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      // No IO support → fire immediately on mount as graceful fallback.
      fire(true, 1);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            fire(true, entry.intersectionRatio);
            observer.disconnect();
          }
        });
      },
      { threshold: [0.25, 0.5, 0.75, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, currentImpressionId, microcopyBucket, applyBucket, pageSection]);

  // Lightweight RFC-5322-ish email shape check. Not a deliverability guarantee —
  // we only want to catch obvious typos client-side and tag them in analytics.
  const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const missingName = trimmedName.length === 0;
    const missingEmail = trimmedEmail.length === 0;
    const invalidEmail = !missingEmail && !EMAIL_SHAPE.test(trimmedEmail);

    // Validation failure → emit dedicated event so we can quantify drop-off
    // by reason (missing_name / missing_email / invalid_email_format) and
    // separate it cleanly from real submit attempts.
    if (missingName || missingEmail || invalidEmail) {
      const reasons: string[] = [];
      if (missingName) reasons.push("missing_name");
      if (missingEmail) reasons.push("missing_email");
      if (invalidEmail) reasons.push("invalid_email_format");

      blockedAttemptsRef.current += 1;
      const payload = {
        ...baseAttribution,
        location: "cta",
        variant: "primary",
        reason: reasons[0],          // primary reason for simple bucketing
        reasons,                     // full list for multi-issue cases
        has_name: !missingName,
        has_email: !missingEmail,
        email_format_valid: !invalidEmail,
        // Lengths (not contents) help spot users who typed something but were
        // still blocked — typical case: trailing space, missing TLD, etc.
        name_length: trimmedName.length,
        email_length: trimmedEmail.length,
        attempt_number: blockedAttemptsRef.current,
        impression_id: currentImpressionId,
        ...getStickyCtaAttribution(),
      };
      trackFunnelEvent("playbook_submit_blocked", payload);
      debugLog("submit blocked", payload);
      return;
    }

    try {
      window.dispatchEvent(
        new CustomEvent("analytics", {
          detail: { event: "leadmagnet_submit", name: trimmedName, email: trimmedEmail },
        }),
      );

      trackFunnelEvent("playbook_submit", {
        ...baseAttribution,
        location: "cta",
        variant: "primary",
        attempts_before_success: blockedAttemptsRef.current,
        impression_id: currentImpressionId,
        ...getStickyCtaAttribution(),
      });
      submitAtRef.current = performance.now();
      confirmationFiredRef.current = false;
      setSubmitted(true);
    } catch (err) {
      // Unexpected runtime failure inside the submit handler — emit a separate
      // error event so blocked-validation noise stays out of the error funnel.
      const payload = {
        ...baseAttribution,
        location: "cta",
        variant: "primary",
        error_message: err instanceof Error ? err.message : String(err),
        error_name: err instanceof Error ? err.name : "UnknownError",
        error_stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
        impression_id: currentImpressionId,
        ...getStickyCtaAttribution(),
      };
      trackFunnelEvent("playbook_submit_error", payload);
      debugLog("submit error", payload);
    }
  };

  return (
    <section id="lead-magnet" className="bg-card py-20 md:py-28">
      <div className="container mx-auto max-w-xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="rounded-sm border border-accent/30 bg-background p-8 text-center md:p-12"
        >
          <p className="mb-2 font-sans text-xs font-medium uppercase tracking-widest text-accent">
            Gratis Ressource
          </p>
          <h2 className="mb-4 font-serif text-2xl font-semibold text-foreground md:text-3xl">
            Ethical Closing Playbook
          </h2>
          <p className="mx-auto mb-8 max-w-sm font-sans text-sm text-muted-foreground">
            7 Seiten: Fit-Check, Frage-Framework, Einwand-Reframes, No-Sale Standards.
          </p>

          {submitted ? (
            <p
              ref={confirmationRef}
              className="font-sans text-sm font-medium text-primary"
              role="status"
              aria-live="polite"
            >
              ✓ Danke! Dein Playbook ist unterwegs.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto flex max-w-sm flex-col gap-3">
              <input
                type="text"
                placeholder="Vorname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => handleFieldFocus("name")}
                required
                maxLength={100}
                className="rounded-sm border border-border bg-card px-4 py-2.5 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="email"
                placeholder="E-Mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => handleFieldFocus("email")}
                required
                maxLength={255}
                className="rounded-sm border border-border bg-card px-4 py-2.5 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="submit"
                className="rounded-sm bg-accent px-6 py-2.5 font-sans text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                Playbook erhalten
              </button>
            </form>
          )}

          {/* A/B-tested microcopy block — variant from `playbook_microcopy_v1`. */}
          <div
            ref={microcopyRef}
            className="mx-auto mt-6 max-w-sm space-y-1.5"
            data-ab-test={PLAYBOOK_AB_TEST_KEY}
            data-ab-variant={microcopyBucket}
            data-impression-id={currentImpressionId ?? undefined}
          >
            <p className="font-sans text-[12px] leading-relaxed text-foreground/75">
              {benefit}
            </p>
            <p className="font-sans text-[10.5px] leading-snug text-muted-foreground">
              {note}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default LeadMagnet;
