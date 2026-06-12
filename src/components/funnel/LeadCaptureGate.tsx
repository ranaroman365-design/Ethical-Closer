import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { trackFunnelEvent } from "@/lib/track-event";
import { trackPixelEvent } from "@/lib/meta-pixel";
import { validatePhone, getPhoneError } from "@/lib/phone-validation";
import { Checkbox } from "@/components/ui/checkbox";

interface LeadCaptureGateProps {
  funnelName: string;
  buttonClass?: string;
  quizAnswers?: Record<string, unknown> | null;
  extraEventPayload?: Record<string, unknown>;
  onLeadCaptured: (data: {
    name: string;
    email: string;
    phone: string;
    leadId?: string;
    verdict?: Record<string, unknown>;
  }) => void;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LeadCaptureGate({ funnelName, buttonClass, quizAnswers, extraEventPayload, onLeadCaptured }: LeadCaptureGateProps) {
  const [name, setName] = useState(() => localStorage.getItem("lead_name") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("lead_email") || "");
  const [phone, setPhone] = useState(() => localStorage.getItem("lead_phone") || "");
  const [microCommitment, setMicroCommitment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name ist erforderlich";
    if (!email.trim()) e.email = "E-Mail ist erforderlich";
    else if (!isValidEmail(email.trim())) e.email = "Ungültige E-Mail-Adresse";
    
    const phoneErr = getPhoneError(phone);
    if (phoneErr) e.phone = phoneErr;
    
    if (!microCommitment) e.commitment = "Bitte bestätige, dass du es ernst meinst.";
    
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const phoneResult = validatePhone(phone);

    // Persist to localStorage for downstream use
    localStorage.setItem("lead_name", trimmedName);
    localStorage.setItem("lead_email", trimmedEmail);
    localStorage.setItem("lead_phone", phoneResult.phone_normalized || phone.trim());

    // Track micro-commitment acceptance
    trackFunnelEvent("MICRO_COMMITMENT_ACCEPTED", {
      funnel: funnelName,
      ...(extraEventPayload ?? {}),
    });

    // Track phone validation result
    trackFunnelEvent(phoneResult.phone_valid ? "PHONE_VALIDATED" : "PHONE_REJECTED", {
      funnel: funnelName,
      phone_valid: phoneResult.phone_valid,
      phone_quality_status: phoneResult.phone_quality_status,
      phone_quality_reason: phoneResult.phone_quality_reason,
      ...(extraEventPayload ?? {}),
    });

    trackFunnelEvent("lead_capture_submitted", {
      funnel: funnelName,
      phone_valid: phoneResult.phone_valid,
      ...(extraEventPayload ?? {}),
    });

    let sessionId: string | null = null;
    try {
      sessionId = (await import("@/lib/attribution-session")).readAttributionSessionId();
    } catch { /* best-effort */ }

    let referralCode: string | null = null;
    try {
      const { getStoredAttribution } = await import("@/lib/referral-attribution");
      const attr = getStoredAttribution();
      if (attr?.ref) referralCode = attr.ref;
    } catch { /* best-effort */ }

    try {
      const { resolveFunnelSource, getCachedTrafficOwner } = await import("@/lib/funnel-source");
      const { data, error } = await supabase.rpc("upsert_funnel_lead", {
        p_name: trimmedName,
        p_email: trimmedEmail,
        p_phone: phoneResult.phone_normalized || phone.trim(),
        p_funnel_source: resolveFunnelSource(funnelName as never),
        p_quiz_answers: quizAnswers ?? null,
        p_session_id: sessionId,
        p_traffic_owner: getCachedTrafficOwner(),
        p_referral_code: referralCode,
      } as never);

      if (error) {
        console.error("Lead upsert error:", error);
      }

      let leadId: string | undefined;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        if (typeof obj.lead_id === "string") leadId = obj.lead_id;
      } else if (typeof data === "string") {
        leadId = data;
      }

      if (leadId) {
        localStorage.setItem("lead_id", leadId);

        // Phone quality fields are now written atomically inside upsert_funnel_lead RPC.
        // No separate client-side post-update needed.
        // Fire Meta Lead — trackPixelEvent fires BOTH browser fbq AND CAPI
        // mirror with a shared event_id (see meta-pixel.ts CAPI_MIRROR_NAMES).
        // DO NOT also call sendCapiEvent("Lead") here — that would emit a
        // duplicate CAPI Lead with identical data (Pixel Helper flags this).
        try {
          const { buildEventId } = await import("@/lib/meta-capi");
          const leadEventId = buildEventId("Lead", leadId);

          trackPixelEvent("LEAD_CAPTURED", {
            email: trimmedEmail,
            phone: phoneResult.phone_normalized,
            first_name: trimmedName,
            lead_id: leadId,
            funnel: funnelName,
            funnel_step: "lead_captured",
            event_id: leadEventId,
          });
        } catch { /* never throw */ }

        // Track LEAD_CAPTURED_VALID
        trackFunnelEvent("LEAD_CAPTURED_VALID", {
          funnel: funnelName,
          lead_id: leadId,
          phone_valid: phoneResult.phone_valid,
          ...(extraEventPayload ?? {}),
        });

        // Fire HighQualityLead event if qualified
        const verdict = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
        const leadQuality = verdict?.lead_quality as string | undefined;
        const quizScore = verdict?.quiz_score as number | undefined;
        const isHighQuality =
          phoneResult.phone_valid &&
          quizScore != null &&
          (leadQuality === "A" || leadQuality === "B");

        if (isHighQuality) {
          try {
            const { buildEventId } = await import("@/lib/meta-capi");
            const eventId = buildEventId("HighQualityLead", leadId);

            // trackPixelEvent fires browser + CAPI HighQualityLead with shared
            // event_id. No second sendCapiEvent — would duplicate the CAPI hit.
            trackPixelEvent("HIGH_QUALITY_LEAD", {
              email: trimmedEmail,
              phone: phoneResult.phone_normalized,
              first_name: trimmedName,
              lead_id: leadId,
              lead_quality: leadQuality,
              quiz_score: quizScore,
              phone_valid: true,
              funnel_step: "high_quality_lead",
              event_id: eventId,
            });

            trackFunnelEvent("HIGH_QUALITY_LEAD", {
              funnel: funnelName,
              lead_id: leadId,
              lead_quality: leadQuality,
              quiz_score: quizScore,
              phone_valid: true,
              source: funnelName,
              ...(extraEventPayload ?? {}),
            });
          } catch (err) {
            console.warn("[LeadCaptureGate] HighQualityLead event failed:", err);
          }
        }

        // Dispatch quiz_completed_hot communication
        try {
          supabase.functions.invoke("dispatch-communication", {
            body: {
              event_key: "quiz_completed_hot",
              lead_id: leadId,
              recipient_phone: phoneResult.phone_normalized,
              recipient_email: trimmedEmail,
              payload: {
                body: `Hi ${trimmedName}! 🎉 Deine Bewerbung ist eingegangen. Wir melden uns in Kürze bei dir. Dein ETC Team`,
                first_name: trimmedName,
                funnel: funnelName,
              },
            },
          }).catch(() => {});
        } catch { /* fire-and-forget */ }

        // Attribution link
        if (sessionId) {
          try {
            await supabase.rpc("link_lead_attribution", {
              p_session_id: sessionId,
              p_lead_id: leadId,
              p_email: trimmedEmail,
            } as never);
            trackFunnelEvent("ATTRIBUTION_LINKED", {
              funnel: funnelName,
              lead_id: leadId,
              session_id: sessionId,
              ...(extraEventPayload ?? {}),
            });
          } catch (linkErr) {
            console.warn("[LeadCaptureGate] link_lead_attribution fallback failed:", linkErr);
            trackFunnelEvent("ATTRIBUTION_LINK_FAILED", {
              funnel: funnelName,
              lead_id: leadId,
              session_id: sessionId,
              error: String(linkErr),
              ...(extraEventPayload ?? {}),
            });
          }
        } else {
          console.warn("[LeadCaptureGate] No attribution session found for lead", leadId);
          trackFunnelEvent("ATTRIBUTION_LINK_FAILED", {
            funnel: funnelName,
            lead_id: leadId,
            reason: "no_session_id",
            ...(extraEventPayload ?? {}),
          });
        }
      }

      const verdictObj = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined;
      onLeadCaptured({ name: trimmedName, email: trimmedEmail, phone: phoneResult.phone_normalized || phone.trim(), leadId, verdict: verdictObj });
    } catch (err) {
      console.error("Lead capture error:", err);
      onLeadCaptured({ name: trimmedName, email: trimmedEmail, phone: phoneResult.phone_normalized || phone.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  const phoneErr = phone.trim() ? getPhoneError(phone) : null;
  const isValid = name.trim() && isValidEmail(email.trim()) && !getPhoneError(phone) && microCommitment;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 text-center"
    >
      <div className="space-y-2">
        <h3 className="font-display text-xl md:text-2xl font-semibold text-foreground">
          Fast geschafft.
        </h3>
        <p className="font-sans text-sm text-muted-foreground max-w-sm mx-auto">
          Bevor wir dein Ergebnis auswerten, brauchen wir noch kurz deine Daten.
        </p>
      </div>

      {/* Micro-commitment gate */}
      <div className="max-w-sm mx-auto text-left">
        <div className="rounded-lg border border-border/60 bg-card/50 p-4">
          <p className="font-sans text-xs font-medium text-muted-foreground mb-3">
            Dieser Prozess ist nur für ernsthafte Bewerber.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={microCommitment}
              onCheckedChange={(checked) => {
                setMicroCommitment(!!checked);
                setErrors(prev => ({ ...prev, commitment: "" }));
              }}
              className="mt-0.5"
            />
            <span className="font-sans text-sm leading-relaxed text-foreground/80">
              Ich bin bereit, Zeit zu investieren und echte Verkaufsgespräche zu führen.
            </span>
          </label>
          {errors.commitment && <p className="text-xs text-destructive mt-2">{errors.commitment}</p>}
        </div>
      </div>

      <div className="space-y-3 max-w-sm mx-auto text-left">
        <div>
          <input
            type="text"
            placeholder="Vorname *"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors(prev => ({ ...prev, name: "" })); }}
            className={cn(
              "w-full rounded-lg border px-4 py-3 font-sans text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
              errors.name ? "border-destructive" : "border-border"
            )}
            autoFocus
          />
          {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
        </div>
        <div>
          <input
            type="email"
            placeholder="E-Mail-Adresse *"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: "" })); }}
            className={cn(
              "w-full rounded-lg border px-4 py-3 font-sans text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
              errors.email ? "border-destructive" : "border-border"
            )}
          />
          {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
        </div>
        <div>
          <input
            type="tel"
            placeholder="Telefonnummer * (z.B. +49 170 1234567)"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrors(prev => ({ ...prev, phone: "" })); }}
            className={cn(
              "w-full rounded-lg border px-4 py-3 font-sans text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
              errors.phone ? "border-destructive" : "border-border"
            )}
          />
          {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
          {!errors.phone && phoneErr && <p className="text-xs text-destructive mt-1">{phoneErr}</p>}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !isValid}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 font-sans font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none w-full max-w-sm mx-auto",
          buttonClass || "bg-primary text-primary-foreground"
        )}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Ergebnis anzeigen
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="text-[10px] text-muted-foreground/50 max-w-xs mx-auto">
        Deine Daten werden vertraulich behandelt und nicht an Dritte weitergegeben.
      </p>
    </motion.div>
  );
}
