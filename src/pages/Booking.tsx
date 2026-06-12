import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, Shield, Clock, Zap, AlertTriangle, Loader2, Mail, UserCheck, Target, Ban, ExternalLink, Info, X, Calendar, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackFunnelEvent } from "@/lib/track-event";
import { getSocialProofDwellAttribution } from "@/lib/social-proof-dwell";
import { getAbAttributionPayload } from "@/lib/ab-attribution";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { cn } from "@/lib/utils";
import SlotPicker from "@/components/booking/SlotPicker";
import { useLeadQuality } from "@/hooks/useLeadQuality";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { persistLeadVerdict, refreshLeadQualification, routeForVerdict, getApplicantPortalUrl, resolveBookingToken, resolveLeadByEmail, markBookingTokenUsed, generateBookingToken, type BookingContinuationResult } from "@/lib/lead-storage";
import { getCurrentAttributionSessionId, linkCurrentLeadAttribution } from "@/lib/lead-attribution";
import { captureAttributionSource, getAttributionSource } from "@/lib/attribution-source";
import { FastlaneAssignmentStatus } from "@/components/booking/FastlaneAssignmentStatus";
import { downloadIcs } from "@/lib/generate-ics";
import ActiveAppointmentConflict from "@/components/booking/ActiveAppointmentConflict";
import BookingSoftFrame from "@/components/booking/BookingSoftFrame";
import { type CalendarProvider, getGoogleCalendarUrl, getOutlookCalendarUrl, savePreferredCalendar, loadPreferredCalendar } from "@/lib/calendar-links";
import { captureMbfPrefill, applyMbfToLead, applyMbfToAppointment, isMbfSession } from "@/lib/mbf-prefill";
import { dispatchMosPostBooking } from "@/lib/mos-post-booking-dispatch";

const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

type BookingStep = "contact" | "slots" | "confirmed";

const Booking = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirmRef = useRef<HTMLDivElement>(null);

  // ── ATTRIBUTION CAPTURE ──
  // First-touch attribution for direct /booking?source=... entries.
  // (V3: hard-block redirect to /ergebnis removed — "no dead-end" rule.
  //  Low/hard-blocked applicants now stay on /booking and receive the
  //  orientation calendar via useLeadQuality.calendarType === "orientation".
  //  This unblocks the qualification → booking funnel and eliminates the
  //  /quiz/low-result 404 dead-end.)
  useEffect(() => {
    captureAttributionSource();
    // Best-effort refresh so the orientation calendar resolves against the
    // freshest server verdict (recompute may upgrade a stale "low").
    void refreshLeadQualification();
  }, []);

  // ── MBF PREFILL (Mama baut Freiheit → ETC) ──
  // If /booking is opened with ?source_system=MBF&..., prefill contact
  // fields, mark the session as MBF, and skip the contact step when all
  // three required fields are present. Tagging of the resulting lead +
  // appointment happens after creation (see handleSaveLead / handleConfirmBooking).
  useEffect(() => {
    const mbf = captureMbfPrefill();
    if (!mbf) return;
    if (mbf.name) { setName(mbf.name); localStorage.setItem("lead_name", mbf.name); }
    if (mbf.email) { setEmail(mbf.email); localStorage.setItem("lead_email", mbf.email); }
    if (mbf.phone) { setPhone(mbf.phone); localStorage.setItem("lead_phone", mbf.phone); }
    if (mbf.name && mbf.email && mbf.phone) {
      setStep("slots");
    }
    trackFunnelEvent("mbf_prefill_received", {
      brand: mbf.brand ?? null,
      entry_route: mbf.entry_route ?? null,
      utm_campaign: mbf.utm_campaign ?? null,
      has_name: !!mbf.name,
      has_email: !!mbf.email,
      has_phone: !!mbf.phone,
    });
  }, []);


  const leadQuality = useLeadQuality();
  const qualificationPath = localStorage.getItem("qualification_path") || "setter_flow";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);
  const [confirmedAppointmentId, setConfirmedAppointmentId] = useState<string | null>(null);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [tokenResolving, setTokenResolving] = useState(false);
  const [continuationLead, setContinuationLead] = useState<BookingContinuationResult | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [preferredCalendar, setPreferredCalendar] = useState<CalendarProvider>("ics");

  // Load preferred calendar from lead record on mount
  useEffect(() => {
    const leadId = localStorage.getItem("lead_id");
    if (!leadId) return;
    loadPreferredCalendar(leadId).then((pref) => {
      if (pref) setPreferredCalendar(pref);
    });
  }, []);
  // Sichtbare Fehler-Box (statt nur Toast). Wird bei jedem neuen Versuch
  // bzw. bei Slot-Wechsel zurückgesetzt.
  const [bookingError, setBookingError] = useState<{
    code?: string;
    message: string;
    title?: string;
  } | null>(null);
  const [activeAppointmentConflict, setActiveAppointmentConflict] = useState<{
    existing_appointment_id: string;
    existing_starts_at: string;
    existing_ends_at: string;
    existing_status: string;
  } | null>(null);
  const [provisioningFailed, setProvisioningFailed] = useState(false);
  const [priorityInfoOpen, setPriorityInfoOpen] = useState(false);
  const [standardInfoOpen, setStandardInfoOpen] = useState(false);
  const [slotPickerRefreshKey, setSlotPickerRefreshKey] = useState(0);

  // Inline call-type toggle — defaults derived from lead-quality calendar.
  // For high/medium leads: "standard" by default (priority is upsell).
  // For low leads: "orientation" — no toggle visible, but type still flows through.
  const [selectedOption, setSelectedOption] = useState<"standard" | "priority" | "orientation">("standard");
  const [resolvedCalendar, setResolvedCalendar] = useState<"standard" | "priority" | "orientation">("standard");

  const [quizCompletedAt] = useState(() => localStorage.getItem("quiz_completed_at") || new Date().toISOString());
  const [isReschedule] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reschedule") === "true";
  });

  // Determine initial step: skip contact if data already exists
  const [step, setStep] = useState<BookingStep>(() => {
    const params = new URLSearchParams(window.location.search);
    const rescheduleEmail = params.get("email");
    if (params.get("reschedule") === "true" && rescheduleEmail) {
      return "slots";
    }
    const savedLeadId = localStorage.getItem("lead_id");
    const savedEmail = localStorage.getItem("lead_email");
    const savedName = localStorage.getItem("lead_name");
    const savedPhone = localStorage.getItem("lead_phone");
    if (savedLeadId && savedEmail && savedName && savedPhone) {
      return "slots";
    }
    return "contact";
  });

  // Reset scroll on mount — fixes "blank page" symptom when navigating from
  // a deeply-scrolled funnel quiz into /booking (browser keeps scrollY).
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // ── BOOKING CONTINUATION — Token / Email resolution ──
  // If ?token= is present, validate it server-side and prefill the form.
  // This lets unbooked leads who click a reminder link resume booking
  // without re-entering their details.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;

    let cancelled = false;
    setTokenResolving(true);

    void (async () => {
      const result = await resolveBookingToken(token);
      if (cancelled) return;

      if (result) {
        setContinuationLead(result);
        if (result.name) { setName(result.name); localStorage.setItem("lead_name", result.name); }
        if (result.email) { setEmail(result.email); localStorage.setItem("lead_email", result.email); }
        if (result.phone) { setPhone(result.phone); localStorage.setItem("lead_phone", result.phone); }
        if (result.leadId) localStorage.setItem("lead_id", result.leadId);
        if (result.qualificationBucket) localStorage.setItem("qualification_bucket", result.qualificationBucket);
        if (result.leadQuality) localStorage.setItem("lead_quality", result.leadQuality);

        // Skip contact step — data is prefilled
        if (result.name && result.email && result.phone) {
          setStep("slots");
        }

        // Mark token as used (non-blocking)
        void markBookingTokenUsed(token);

        trackFunnelEvent("booking_continuation_resolved", {
          resolved_via: "token",
          lead_id: result.leadId,
          booking_status: result.bookingStatus,
        });
      } else {
        // Token invalid/expired — user will see contact form (email fallback)
        trackFunnelEvent("booking_continuation_token_expired", { token_prefix: token.substring(0, 8) });
      }
      setTokenResolving(false);
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rescheduleEmail = params.get("email");
    if (rescheduleEmail) {
      setEmail(decodeURIComponent(rescheduleEmail).trim().toLowerCase());
      localStorage.setItem("lead_email", decodeURIComponent(rescheduleEmail).trim().toLowerCase());
    }
    // Don't overwrite if already set by token resolution
    if (!continuationLead) {
      const savedName = localStorage.getItem("lead_name");
      const savedEmail = localStorage.getItem("lead_email");
      const savedPhone = localStorage.getItem("lead_phone");
      if (savedName) setName(savedName);
      if (savedEmail && !rescheduleEmail) setEmail(savedEmail);
      if (savedPhone) setPhone(savedPhone || "");
    }
    trackFunnelEvent("booking_view", {
      is_reschedule: isReschedule,
      qualification_score: leadQuality.score,
      qualification_tier: leadQuality.tier,
      calendar_type_shown: leadQuality.calendarType,
      continuation_token: !!new URLSearchParams(window.location.search).get("token"),
      ...getSocialProofDwellAttribution(),
    });
  }, [continuationLead]);

  // ── Stripe return / mode pre-select ──
  // SECURITY: NEVER trust ?fastlane=success on its own — that param is fully
  // user-controllable. Confirmation must come from the Stripe webhook, which
  // sets `appointments.payment_status = 'paid'` + `appointment_status =
  // 'confirmed'` via the `confirm_fastlane_appointment` RPC. We verify by
  // polling the appointment row by id (returned by Stripe in the success URL)
  // and only then flip UI to "confirmed".
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "priority") {
      setSelectedOption("priority");
    }

    if (params.get("fastlane") === "cancelled") {
      toast({
        title: "Zahlung abgebrochen",
        description: "Du kannst es jederzeit erneut versuchen oder einen Standard-Termin wählen.",
        variant: "destructive",
      });
      return;
    }

    if (params.get("fastlane") !== "success") return;

    const appointmentId = params.get("appointment");
    if (!appointmentId) {
      // Manipulated URL (success without appointment id) → ignore silently.
      // No toast, no state change. Webhook is the source of truth.
      console.warn("[booking] fastlane=success without appointment id — ignored");
      return;
    }

    // Show neutral pending state while we verify.
    toast({
      title: "Zahlung wird verifiziert…",
      description: "Wir prüfen deinen Termin. Einen Moment.",
    });

    // Poll for the confirmed appointment (webhook may take 1–3s).
    let attempts = 0;
    const maxAttempts = 10; // ~20s total
    const verify = async () => {
      attempts += 1;
      const { data, error } = await supabase
        .from("appointments")
        .select("id, appointment_status, payment_status, starts_at, call_type")
        .eq("id", appointmentId)
        .maybeSingle();

      if (error) {
        console.error("[booking] fastlane verification query error", error);
        return;
      }

      const verified =
        data &&
        data.payment_status === "paid" &&
        ["confirmed", "booked"].includes(data.appointment_status);

      if (verified) {
        if (data.starts_at) setSelectedSlotTime(data.starts_at);
        setConfirmedAppointmentId(data.id);
        setStep("confirmed");
        trackFunnelEvent("fastlane_payment_completed", {
          appointment_id: data.id,
          lead_id: localStorage.getItem("lead_id") ?? null,
          session_id: params.get("session_id") ?? null,
          verified_via: "appointment_row",
        });
        toast({
          title: "Zahlung bestätigt ✓",
          description: "Dein Priority-Termin ist bestätigt.",
        });
        // Fetch magic link for the "Zum Bewerberbereich" CTA. The webhook
        // already provisioned the account; this is a safety net so the
        // success page CTA always lands the user inside the applicant area
        // instead of the generic /members/login.
        try {
          const leadIdLs = localStorage.getItem("lead_id");
          const emailLs = localStorage.getItem("lead_email");
          const nameLs = localStorage.getItem("lead_name") || undefined;
          if (leadIdLs && emailLs) {
            const { data: prov } = await supabase.functions.invoke(
              "provision-applicant-account",
              { body: { lead_id: leadIdLs, email: emailLs, name: nameLs } },
            );
            if (prov?.magic_link) setMagicLink(prov.magic_link as string);
          }
        } catch (e) {
          console.warn("[booking] magic link fetch failed (non-fatal)", e);
        }
        return;
      }

      if (attempts >= maxAttempts) {
        toast({
          title: "Zahlung wird noch geprüft",
          description:
            "Falls bereits abgebucht: Du erhältst die Bestätigung per E-Mail, sobald wir die Zahlung verbucht haben.",
          variant: "destructive",
        });
        return;
      }
      setTimeout(verify, 2000);
    };
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize default calendar selection from lead quality (no dead-end).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "priority") return; // respect explicit URL preference
    // High → still defaults to "standard" (priority is upsell card).
    // Medium → "standard". Low → "orientation".
    setSelectedOption(leadQuality.calendarType === "priority" ? "standard" : leadQuality.calendarType);
    setResolvedCalendar(leadQuality.calendarType);
  }, [leadQuality.calendarType]);

  // Auto-scroll to confirm button when slot selected
  useEffect(() => {
    if (selectedSlotId && confirmRef.current) {
      setTimeout(() => {
        confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [selectedSlotId]);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleConfirmBooking = async () => {
    if (!selectedSlotId || !selectedOption || bookingInProgress) return;
    const savedEmail = email.trim().toLowerCase();
    if (!savedEmail) return;

    setBookingInProgress(true);
    setBookingError(null);
    try {
      let latestVerdict = await refreshLeadQualification({
        leadId: localStorage.getItem("lead_id"),
        email: savedEmail,
      });
      if (!latestVerdict.leadId) {
        const existingLead = await resolveLeadByEmail(savedEmail);
        if (existingLead?.leadId) {
          localStorage.setItem("lead_id", existingLead.leadId);
          if (existingLead.name) setName(existingLead.name);
          if (existingLead.phone) setPhone(existingLead.phone);
          setContinuationLead(existingLead);
          latestVerdict = await refreshLeadQualification({ leadId: existingLead.leadId, email: savedEmail });
        }
      }
      if (!latestVerdict.leadId) {
        setBookingError({
          title: "Kontaktdaten fehlen",
          code: "lead_context_required",
          message: "Bitte speichere deine Kontaktdaten zuerst. Dein gewählter Termin bleibt erhalten.",
        });
        setStep("contact");
        setBookingInProgress(false);
        return;
      }
      const stillLow = latestVerdict.qualificationBucket === "low" || latestVerdict.leadQuality === "C";
      const missingQualification = !latestVerdict.leadId || !latestVerdict.qualificationBucket || !latestVerdict.leadQuality;
      if (stillLow || missingQualification) {
        toast({
          title: stillLow ? "Profil noch nicht freigegeben" : "Quiz noch nicht abgeschlossen",
          description: stillLow
            ? "Du wurdest auf die Warteliste gesetzt. Wir melden uns."
            : "Bitte schließe zuerst die Qualifikation ab.",
          variant: "destructive",
        });
        setBookingInProgress(false);
        window.location.href = stillLow ? "/quiz/low-result" : "/quiz";
        return;
      }

      const funnelSource = localStorage.getItem("quiz_funnel") || "start";

      // ── PRIORITY / FASTLANE → Stripe deposit (€29) BEFORE the appointment ──
      // The webhook will create the appointment server-side after payment.
      if (selectedOption === "priority") {
        trackFunnelEvent("fastlane_checkout_started", {
          slot_id: selectedSlotId,
          source_funnel: funnelSource,
        });
        const { data, error } = await supabase.functions.invoke("create-fastlane-checkout", {
          body: {
            email: savedEmail,
            lead_id: latestVerdict.leadId,
            name: name.trim(),
            phone: phone.trim(),
            slot_id: selectedSlotId,
            funnel_source: funnelSource,
            reschedule: isReschedule || undefined,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });

        // `supabase.functions.invoke` collapses any non-2xx into a generic
        // "Edge Function returned a non-2xx status code" — the real reason
        // (lead missing / slot taken / stripe down) sits in the JSON body
        // attached to error.context. Surface it so the user sees something
        // actionable and we get a usable trace in the console.
        let serverMessage: string | undefined;
        if (error) {
          try {
            const ctx = (error as { context?: Response }).context;
            if (ctx && typeof ctx.text === "function") {
              const raw = await ctx.clone().text().catch(() => "");
              const parsed = raw ? JSON.parse(raw) : null;
              if (parsed && typeof parsed.error === "string") serverMessage = parsed.error;
            }
          } catch { /* swallow — fall back to generic message */ }
          // eslint-disable-next-line no-console
          console.error("[booking] create-fastlane-checkout failed", { error, serverMessage });
        }

        if (error || !data?.url) {
          setBookingError({
            title: "Zahlung konnte nicht gestartet werden",
            code: "fastlane_checkout_failed",
            message:
              serverMessage ??
              "Bitte versuche es erneut oder wähle einen Standardtermin.",
          });
          setBookingInProgress(false);
          return;
        }
        // Persist intent so we can finish the UI on return.
        localStorage.setItem("fastlane_pending_slot", selectedSlotId);
        window.location.href = data.url;
        return;
      }

      // ── STANDARD / ORIENTATION → free appointment (no deposit) ──
      // Safe debug payload (no raw phone, no sensitive data) — surfaces the
      // exact request shape so production booking failures are diagnosable.
      // eslint-disable-next-line no-console
      console.info("[booking] create-appointment payload", {
        slot_id: selectedSlotId,
        lead_id: localStorage.getItem("lead_id") ?? null,
        email_present: !!savedEmail,
        call_type: selectedOption,
        src: localStorage.getItem("quiz_funnel") ?? null,
        q: localStorage.getItem("qualification_bucket") ?? null,
        quiz_score: localStorage.getItem("qualification_score") ?? null,
      });

      // Forward the free-form attribution source (e.g. masterofsales-faq-3-a)
      // alongside the constrained funnel_source enum, so booking_source preserves
      // the full A/B variant string end-to-end.
      const attributionSource = getAttributionSource();

      const { data, error } = await supabase.functions.invoke("create-appointment", {
        body: {
          email: savedEmail,
          lead_id: latestVerdict.leadId,
          name: name.trim(),
          phone: phone.trim(),
          slot_id: selectedSlotId,
          call_type: selectedOption,
          funnel_source: funnelSource,
          attribution_source: attributionSource,
          reschedule: isReschedule || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      // `supabase.functions.invoke` collapses any non-2xx into a generic
      // "Edge Function returned a non-2xx status code". The real reason
      // (qualification_required, low_quality_lead_blocked, slot taken …)
      // sits in the JSON body on error.context. Extract it so users see
      // the actual German message instead of a confusing generic error.
      let serverMessage: string | undefined;
      let serverCode: string | undefined;
      let serverBody: any = null;
      if (error) {
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.text === "function") {
            const raw = await ctx.clone().text().catch(() => "");
            const parsed = raw ? JSON.parse(raw) : null;
            serverBody = parsed;
            if (parsed && typeof parsed.error === "string") serverMessage = parsed.error;
            if (parsed && typeof parsed.code === "string") serverCode = parsed.code;
            if (parsed && typeof parsed.error_code === "string") serverCode = parsed.error_code;
          }
        } catch { /* swallow — fall back to generic message */ }
        // eslint-disable-next-line no-console
        console.error("[booking] create-appointment failed", { error, serverMessage, serverCode });
      }

      const result = (data ?? {}) as {
        success?: boolean;
        magic_link?: string;
        error?: string;
        provisioning_status?: "ok" | "failed" | "skipped";
        appointment_id?: string;
        lead_id?: string;
        deduplicated?: boolean;
        starts_at?: string;
      };

      // ── Dedupe: parallel booking resolved → treat as success ──
      if (result.deduplicated && result.appointment_id) {
        console.info("[booking] deduplicated — existing appointment returned", result.appointment_id);
        if (result.starts_at) setSelectedSlotTime(result.starts_at);
        setConfirmedAppointmentId(result.appointment_id);
        setStep("confirmed");
        toast({ title: "Termin bereits gebucht ✓", description: "Dein Strategiegespräch ist bestätigt." });
        setBookingInProgress(false);
        return;
      }

      if (error || !result.success) {
        // ── Active appointment conflict → show reschedule UX ──
        if (serverCode === "ACTIVE_APPOINTMENT_EXISTS" && serverBody) {
          setActiveAppointmentConflict({
            existing_appointment_id: serverBody.existing_appointment_id,
            existing_starts_at: serverBody.existing_starts_at,
            existing_ends_at: serverBody.existing_ends_at,
            existing_status: serverBody.existing_status,
          });
          setBookingInProgress(false);
          return;
        }

        // Low-quality block → soft redirect to the dedicated low-lead screen
        if (serverCode === "low_quality_lead_blocked") {
          toast({
            title: "Profil noch nicht freigegeben",
            description: serverMessage ?? "Du wurdest auf die Warteliste gesetzt. Wir melden uns.",
            variant: "destructive",
          });
          setBookingInProgress(false);
          window.location.href = "/quiz/low-result";
          return;
        }
        if (serverCode === "qualification_required") {
          toast({
            title: "Quiz noch nicht abgeschlossen",
            description: serverMessage ?? "Bitte schließe zuerst die Qualifikation ab.",
            variant: "destructive",
          });
          setBookingInProgress(false);
          window.location.href = "/quiz";
          return;
        }
        setBookingError({
          title: "Buchung fehlgeschlagen",
          code: serverCode,
          message:
            serverMessage ||
            result.error ||
            "Die Buchung konnte gerade nicht abgeschlossen werden. Bitte versuche es erneut oder wähle einen anderen Termin.",
        });
        setBookingInProgress(false);
        return;
      }

      const timeToBookMs = new Date().getTime() - new Date(quizCompletedAt).getTime();
      const timeToBookMin = Math.round(timeToBookMs / 60000);
      const provisioningStatus = result.provisioning_status ?? "skipped";
      const baseEventPayload = {
        call_type: selectedOption,
        slot_id: selectedSlotId,
        selected_time: selectedSlotTime,
        source_funnel: funnelSource,
        appointment_id: result.appointment_id ?? null,
        lead_id: result.lead_id ?? localStorage.getItem("lead_id") ?? null,
      };
      trackFunnelEvent("booking_created", {
        ...baseEventPayload,
        time_to_book_minutes: timeToBookMin,
        ...getSocialProofDwellAttribution(),
        // Layer 49 — attach active /apply A/B assignments so the Experimentation
        // OS can attribute booking conversion per variant. Read-only, never blocks.
        ...getAbAttributionPayload(),
      });
      trackFunnelEvent("booking_confirmed", {
        ...baseEventPayload,
        ...getAbAttributionPayload(),
      });
      if (provisioningStatus === "ok") {
        trackFunnelEvent("applicant_access_provisioned", baseEventPayload);
      } else if (provisioningStatus === "failed") {
        trackFunnelEvent("applicant_access_provisioning_failed", baseEventPayload);
        setProvisioningFailed(true);
      }
      if (result.magic_link) {
        setMagicLink(result.magic_link);
      }
      if (result.appointment_id) setConfirmedAppointmentId(result.appointment_id);
      // MBF: tag appointment as booking_source=mbf (additive, no overwrite of ownership).
      if (isMbfSession() && result.appointment_id) {
        void applyMbfToAppointment(result.appointment_id);
        if (result.lead_id) void applyMbfToLead(result.lead_id);
      }
      // Phase 11 — MOS-gated WhatsApp + ICS dispatch (fire-and-forget, never blocks).
      if (result.appointment_id) {
        dispatchMosPostBooking({
          appointment_id: result.appointment_id,
          lead_id: result.lead_id ?? latestVerdict?.leadId ?? null,
          email: savedEmail,
          phone: phone.trim(),
          name: name.trim(),
          starts_at: result.starts_at ?? null,
        });
      }
      setStep("confirmed");
      toast({ title: "Termin gebucht ✓", description: "Dein Strategiegespräch ist bestätigt." });
    } catch (err) {
      console.error("Booking error:", err);
      setBookingError({
        title: "Unerwarteter Fehler",
        code: "client_exception",
        message:
          err instanceof Error
            ? err.message
            : "Bitte versuche es erneut oder wähle einen anderen Termin.",
      });
    } finally {
      setBookingInProgress(false);
    }
  };

  const handleSaveLead = async () => {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      toast({ title: "Bitte alle Felder ausfüllen", variant: "destructive" });
      return;
    }
    if (!isValidEmail(email.trim())) {
      toast({ title: "Bitte eine gültige E-Mail eingeben", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const quizFunnel = localStorage.getItem("quiz_funnel") || "start";
      const quizAnswers = localStorage.getItem("quiz_result")
        ? { quiz_result: localStorage.getItem("quiz_result") }
        : null;

      const qScore = localStorage.getItem("qualification_score");
      const qBucket = localStorage.getItem("qualification_bucket");
      const qPath = localStorage.getItem("qualification_path");

      const { resolveFunnelSource, getCachedTrafficOwner } = await import("@/lib/funnel-source");
      const { data, error } = await supabase.rpc("upsert_funnel_lead", {
        p_name: name.trim(),
        p_email: email.trim(),
        p_phone: phone.trim(),
        p_funnel_source: resolveFunnelSource(),
        p_quiz_answers: {
          ...quizAnswers,
          qualification_score: qScore ? parseInt(qScore) : null,
          qualification_bucket: qBucket,
          qualification_path: qPath,
        },
        p_session_id: getCurrentAttributionSessionId(),
        p_traffic_owner: getCachedTrafficOwner(),
      } as never);

      if (error) {
        console.error("Lead save error:", error);
        toast({ title: "Fehler beim Speichern", description: "Bitte versuche es erneut.", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      const result = data as { success?: boolean; lead_id?: string } | null;

      // Mirror the FRESH server verdict (incl. requalification) into
      // localStorage so subsequent /booking attempts trust the new state.
      const verdict = persistLeadVerdict(data, {
        name: name,
        email: email,
        phone: phone,
      });
      await linkCurrentLeadAttribution(verdict.leadId ?? result?.lead_id, email);
      // MBF: tag lead as Source=MBF when this session came from MBF prefill.
      if (isMbfSession()) {
        void applyMbfToLead(verdict.leadId ?? result?.lead_id ?? null);
      }
      const leadIdForToken = verdict.leadId ?? result?.lead_id;
      if (leadIdForToken) {
        const token = await generateBookingToken(leadIdForToken);
        if (token) localStorage.setItem("booking_token", token);
      }

      if (result?.lead_id && qScore) {
        supabase.from("leads").update({
          qualification_score: parseInt(qScore),
          qualification_bucket: qBucket,
          qualification_path: qPath,
        } as any).eq("id", result.lead_id).then(({ error: e }) => {
          if (e) console.error("Qualification update error:", e);
        });
      }

      const quizSubmissionId = localStorage.getItem("quiz_submission_id");
      if (quizSubmissionId && result?.lead_id) {
        supabase.from("quiz_submissions").update({
          lead_id: result.lead_id,
          email: email.trim().toLowerCase(),
        } as any).eq("id", quizSubmissionId).then(({ error: e }) => {
          if (e) console.error("Quiz link error:", e);
        });
      }

      trackFunnelEvent("lead_saved", { funnel: quizFunnel });
      trackFunnelEvent("booking_started", {
        source_funnel: quizFunnel,
        timestamp: new Date().toISOString(),
      });

      // If the (re-)scored lead is now low, do not let them proceed to slot
      // selection — send them to the low-result page (with retake CTA).
      const lowDest = routeForVerdict(verdict, {
        defaultPath: "",
        lowPath: "/quiz/low-result",
      });
      if (lowDest === "/quiz/low-result") {
        toast({
          title: "Profil noch nicht freigegeben",
          description:
            "Auf Basis deiner aktuellen Antworten passt das Programm gerade nicht. Du kannst das Quiz jederzeit erneut machen.",
          variant: "destructive",
        });
        window.location.href = "/quiz/low-result";
        return;
      }

      // If a slot was already selected (user was sent back to contact step
      // due to missing lead context), skip the slot picker and confirm directly.
      if (selectedSlotId && selectedSlotTime) {
        setStep("slots");
        setBookingError(null);
        // Short delay so the UI transitions, then auto-confirm
        setTimeout(() => { handleConfirmBooking(); }, 300);
      } else {
        setStep("slots");
        toast({ title: "Gespeichert ✓", description: "Wähle jetzt deinen Termin." });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Fehler", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCallTypeSwitch = (type: "standard" | "priority" | "orientation") => {
    setSelectedOption(type);
    setSelectedSlotId(null);
    setSelectedSlotTime(null);
    trackFunnelEvent("booking_step_progress", { step: "call_type_switched", selected_call_type: type });
  };

  const inputClass =
    "w-full rounded-sm border border-[hsl(var(--funnel-sand))] bg-white px-4 py-3.5 font-sans text-sm text-[hsl(var(--funnel-dark,30_10%_12%))] placeholder:text-[hsl(var(--funnel-grey))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--funnel-gold))] transition-all";

  return (
    <div className="min-h-screen bg-[hsl(var(--funnel-warm-bg))] text-[hsl(30,10%,12%)]">
      <div className="mx-auto max-w-2xl px-6 py-16 md:py-24">

        {/* Psychological reframe layer — emotional continuity from /apply.
            Pure presentational, no impact on booking logic. Hidden on
            confirmed step and on reschedule (which need full focus). */}
        {step !== "confirmed" && !isReschedule && (
          <BookingSoftFrame step={step === "slots" ? "slots" : "contact"} />
        )}
        <div id="booking-flow-anchor" />

        <AnimatePresence mode="wait">

          {/* ═══════════════════════════════════════════
              STEP: CONTACT (only if no data)
             ═══════════════════════════════════════════ */}
          {step === "contact" && (
            <motion.div key="contact" {...fade} transition={{ duration: 0.5 }}>
              {/* Slot-preserved banner — shown when user was sent back from slots */}
              {selectedSlotId && selectedSlotTime && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 rounded-md border border-[hsl(var(--funnel-teal))]/30 bg-[hsl(var(--funnel-teal))]/5 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 flex-shrink-0 text-[hsl(var(--funnel-teal))]" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="font-sans text-sm font-medium text-foreground">
                        Dein Termin ist vorgemerkt
                      </p>
                      <p className="font-sans text-xs text-muted-foreground mt-0.5">
                        {(() => {
                          try {
                            return format(parseISO(selectedSlotTime), "EEEE, dd. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de });
                          } catch { return selectedSlotTime; }
                        })()}
                      </p>
                      <p className="font-sans text-xs text-muted-foreground mt-1">
                        Speichere deine Kontaktdaten, um die Buchung abzuschließen.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Error from booking attempt shown on contact step */}
              {bookingError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  aria-live="assertive"
                  className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-sm font-semibold text-destructive">
                        {bookingError.title ?? "Buchung fehlgeschlagen"}
                      </h3>
                      <p className="mt-1 font-sans text-xs text-foreground/90">
                        {bookingError.message}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBookingError(null)}
                      className="rounded-sm p-0.5 text-destructive/70 hover:text-destructive"
                      aria-label="Fehler schließen"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              <section className="mb-14 text-center">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--funnel-teal))]/15">
                  <Check className="h-7 w-7 text-[hsl(var(--funnel-teal))]" />
                </div>
                <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15] mb-4">
                  {selectedSlotId ? "Fast geschafft." : "Stark."}
                </h1>
                <p className="font-sans text-lg leading-relaxed text-[hsl(var(--funnel-grey))]">
                  {selectedSlotId
                    ? "Bitte gib deine Kontaktdaten ein, um den Termin zu sichern."
                    : "Basierend auf deinen Antworten macht ein Gespräch für dich Sinn."}
                </p>
                {!selectedSlotId && (
                  <p className="font-sans text-sm leading-relaxed text-[hsl(var(--funnel-grey))] mt-2">
                    Im nächsten Schritt klären wir gemeinsam, wie dein Weg in Richtung High-Ticket-Closing konkret aussehen kann.
                  </p>
                )}
              </section>

              {/* Micro Trust Block */}
              {!selectedSlotId && (
                <section className="mb-10">
                  <ul className="flex flex-col gap-2.5">
                    {["Keine Vorkenntnisse notwendig", "Klarer, strukturierter Einstieg", "Bewährtes System"].map((item) => (
                      <li key={item} className="flex items-center gap-2.5 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                        <Check className="h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="mb-14">
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-8">
                  <h2 className="font-display text-xl font-semibold mb-2">Deine Kontaktdaten</h2>
                  <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] mb-6">
                    Damit wir dich für das Gespräch kontaktieren können.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block font-sans text-xs font-medium text-[hsl(var(--funnel-grey))]">Vollständiger Name *</label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="Max Mustermann" maxLength={100} className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1.5 block font-sans text-xs font-medium text-[hsl(var(--funnel-grey))]">E-Mail *</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 255))} placeholder="max@beispiel.de" maxLength={255} className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-1.5 block font-sans text-xs font-medium text-[hsl(var(--funnel-grey))]">Telefonnummer *</label>
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 30))} placeholder="+49 170 1234567" maxLength={30} className={inputClass} />
                    </div>
                  </div>
                  <button
                    onClick={handleSaveLead}
                    disabled={submitting || !name.trim() || !email.trim() || !phone.trim()}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-[hsl(var(--funnel-gold))] px-6 py-4 font-sans text-base font-semibold text-[hsl(30,10%,12%)] transition-all hover:opacity-90 disabled:opacity-40"
                  >
                    {submitting ? "Wird gespeichert…" : selectedSlotId ? "Kontaktdaten speichern & Termin buchen" : "Weiter zur Terminbuchung"}
                    {!submitting && <ArrowRight className="h-4 w-4" />}
                  </button>
                </div>
              </section>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════
              STEP: SLOTS (with inline call-type toggle)
             ═══════════════════════════════════════════ */}
          {step === "slots" && (
            <motion.div
              key="slots"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.4 }}
            >
              {/* Header */}
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--funnel-teal))]/15">
                  <Check className="h-6 w-6 text-[hsl(var(--funnel-teal))]" />
                </div>
                <h1 className="font-display text-2xl md:text-3xl font-semibold leading-[1.15] mb-2">
                  {isReschedule ? "Neuen Termin wählen" : "Dein persönliches Strategiegespräch"}
                </h1>
                <p className="font-sans text-sm text-[hsl(var(--funnel-grey))]">
                  {isReschedule
                    ? "Wähle einen neuen Termin, der besser passt."
                    : "Wähle deinen Wunschtermin — exklusiv, persönlich, vertraulich."}
                </p>
              </div>

              {isReschedule && (
                <section className="mb-6">
                  <div className="rounded-sm border border-amber-200 bg-amber-50/60 p-5 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Info className="h-4 w-4 text-amber-600" />
                      <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)]">Termin verschieben</p>
                    </div>
                    <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]">
                      Wähle einen neuen Termin, der besser zu deinem Zeitplan passt.
                    </p>
                  </div>
                </section>
              )}

              {/* Call-type selector — Classic first (default), Priority second (upsell) */}
              {leadQuality.showPriority && (
                <div className="mb-6 space-y-3">
                  {/* CLASSIC CARD — dominant, always first */}
                  <button
                    onClick={() => handleCallTypeSwitch("standard")}
                    className={cn(
                      "w-full rounded-sm border-2 p-5 text-left transition-all relative",
                      selectedOption === "standard"
                        ? "border-[hsl(var(--funnel-teal))] bg-[hsl(var(--funnel-teal))]/5 shadow-md"
                        : "border-[hsl(var(--funnel-sand))] bg-white hover:border-[hsl(var(--funnel-teal))]/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        selectedOption === "standard"
                          ? "border-[hsl(var(--funnel-teal))] bg-[hsl(var(--funnel-teal))]"
                          : "border-[hsl(var(--funnel-sand))]"
                      )}>
                        {selectedOption === "standard" && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-[hsl(var(--funnel-teal))]" />
                           <h3 className="font-display text-base font-semibold">Persönliches Strategiegespräch</h3>
                        </div>
                        <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed mb-2">
                          Vertrauliches 1:1-Gespräch mit einem erfahrenen Strategy Consultant.
                        </p>
                        <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]">
                          ca. 20–30 Min · Online · Vertraulich
                        </p>
                        <p className="font-sans text-xs text-[hsl(var(--funnel-teal))] mt-1.5 font-medium">
                          Keine Verpflichtung. Kein Verkaufsdruck.
                        </p>
                      </div>
                    </div>
                    {/* Info button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStandardInfoOpen(true);
                      }}
                      className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--funnel-sand))] bg-white text-[hsl(var(--funnel-grey))] hover:bg-[hsl(var(--funnel-sand))]/30 transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </button>

                  {/* PRIORITY CARD — secondary upsell */}
                  <button
                    onClick={() => handleCallTypeSwitch("priority")}
                    className={cn(
                      "w-full rounded-sm border p-5 text-left transition-all relative overflow-hidden",
                      selectedOption === "priority"
                        ? "border-[hsl(var(--funnel-gold))] bg-[hsl(var(--funnel-gold))]/5 shadow-md"
                        : "border-[hsl(var(--funnel-sand))] bg-white hover:border-[hsl(var(--funnel-gold))]/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        selectedOption === "priority"
                          ? "border-[hsl(var(--funnel-gold))] bg-[hsl(var(--funnel-gold))]"
                          : "border-[hsl(var(--funnel-sand))]"
                      )}>
                        {selectedOption === "priority" && <Check className="h-3 w-3 text-[hsl(30,10%,12%)]" />}
                      </div>
                      <div className="flex-1 min-w-0 pr-8">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="h-4 w-4 text-[hsl(var(--funnel-gold))]" />
                          <h3 className="font-display text-base font-semibold">Priority Call — Fastlane Zugang</h3>
                        </div>
                        <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed mb-2">
                          Du wirst von Anfang an priorisiert und erhältst eine gezieltere Begleitung auf deinem Weg zum Closer.
                        </p>
                        <ul className="space-y-1.5 mb-3">
                          <li className="flex items-center gap-2 font-sans text-xs text-[hsl(var(--funnel-grey))]">
                            <Zap className="h-3 w-3 shrink-0 text-[hsl(var(--funnel-gold))]" />
                            Schnellere Terminvergabe
                          </li>
                          <li className="flex items-center gap-2 font-sans text-xs text-[hsl(var(--funnel-grey))]">
                            <Check className="h-3 w-3 shrink-0 text-[hsl(var(--funnel-gold))]" />
                            Priorisierte Betreuung
                          </li>
                          <li className="flex items-center gap-2 font-sans text-xs text-[hsl(var(--funnel-grey))]">
                            <Target className="h-3 w-3 shrink-0 text-[hsl(var(--funnel-gold))]" />
                            Klarere Strategie für deinen Einstieg
                          </li>
                          <li className="flex items-center gap-2 font-sans text-xs text-[hsl(var(--funnel-grey))]">
                            <Shield className="h-3 w-3 shrink-0 text-[hsl(var(--funnel-gold))]" />
                            Engere Begleitung in den ersten Schritten
                          </li>
                        </ul>
                        <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]">
                          <span className="font-semibold text-[hsl(var(--funnel-gold))]">Einmalig 27 €</span> — wird voll angerechnet
                        </p>
                        <p className="font-sans text-[11px] text-[hsl(var(--funnel-grey))]/70 mt-1">
                          Du kannst jederzeit das reguläre Strategiegespräch wählen.
                        </p>
                      </div>
                    </div>
                    {/* Info button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPriorityInfoOpen(true);
                      }}
                      className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--funnel-sand))] bg-white text-[hsl(var(--funnel-grey))] hover:bg-[hsl(var(--funnel-sand))]/30 transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </button>
                </div>
              )}

              {/* Info Modals */}
              <AnimatePresence>
                {priorityInfoOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
                    onClick={() => setPriorityInfoOpen(false)}
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="relative w-full max-w-sm rounded-sm bg-white p-6 shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => setPriorityInfoOpen(false)} className="absolute top-3 right-3 text-[hsl(var(--funnel-grey))] hover:text-[hsl(30,10%,12%)]">
                        <X className="h-5 w-5" />
                      </button>
                      <div className="flex items-center gap-2 mb-4">
                        <Zap className="h-5 w-5 text-[hsl(var(--funnel-gold))]" />
                        <h3 className="font-display text-lg font-semibold">Priority Call bedeutet:</h3>
                      </div>
                      <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed mb-4">
                        Du wirst von Anfang an priorisiert und auf eine Fastlane gesetzt.
                      </p>
                      <p className="font-sans text-xs font-semibold text-[hsl(30,10%,12%)] mb-2">Das beinhaltet:</p>
                      <ul className="space-y-2.5 mb-4">
                        {[
                          "Schnellere Terminvergabe (heute/morgen)",
                          "Gezieltere Betreuung im Bewerbungsprozess",
                          "Klarere Strategie für deinen Einstieg als Closer",
                          "Engere Begleitung in den ersten Schritten",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--funnel-gold))]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed border-t border-[hsl(var(--funnel-sand))] pt-3 mb-2">
                        Erfahrungsgemäß kommen Teilnehmer, die diesen Weg wählen, deutlich schneller in die Umsetzung und erzielen früher Ergebnisse.
                      </p>
                      <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]">
                        Die Gebühr von <span className="font-semibold">27 €</span> wird vollständig auf das Programm angerechnet.
                      </p>
                    </motion.div>
                  </motion.div>
                )}
                {standardInfoOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
                    onClick={() => setStandardInfoOpen(false)}
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="relative w-full max-w-sm rounded-sm bg-white p-6 shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button onClick={() => setStandardInfoOpen(false)} className="absolute top-3 right-3 text-[hsl(var(--funnel-grey))] hover:text-[hsl(30,10%,12%)]">
                        <X className="h-5 w-5" />
                      </button>
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="h-5 w-5 text-[hsl(var(--funnel-teal))]" />
                        <h3 className="font-display text-lg font-semibold">Persönliches Strategiegespräch</h3>
                      </div>
                      <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed mb-3">
                        In deinem persönlichen Gespräch klären wir:
                      </p>
                      <ul className="space-y-2 mb-3">
                        {[
                          "Deine aktuelle Situation und dein Potenzial",
                          "Ob unser Modell zu deinen Zielen passt",
                          "Einen konkreten nächsten Schritt für dich",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p className="font-sans text-xs text-[hsl(var(--funnel-grey))] border-t border-[hsl(var(--funnel-sand))] pt-3">
                        Dauer: ca. 20–30 Min · Online via Video-Call · Keine Verpflichtung
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Orientation header (low-tier) — replaces dead-end with bookable Strategy Call */}
              {leadQuality.calendarType === "orientation" && (
                <div className="mb-6 rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-5">
                  <p className="font-display text-base font-semibold mb-1">
                    Dein passender nächster Schritt
                  </p>
                  <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed">
                    Basierend auf deinen Antworten empfehlen wir dir ein kurzes Orientierungsgespräch.
                    Wir klären gemeinsam, ob und wie ein Einstieg für dich Sinn macht.
                  </p>
                  <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]/70 mt-2">
                    Limitierte Verfügbarkeit · ca. 20–30 Min · Vertraulich
                  </p>
                </div>
              )}

              {/* Active Appointment Conflict */}
              {activeAppointmentConflict && (
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6 md:p-8">
                  <ActiveAppointmentConflict
                    existingStartsAt={activeAppointmentConflict.existing_starts_at}
                    existingEndsAt={activeAppointmentConflict.existing_ends_at}
                    existingStatus={activeAppointmentConflict.existing_status}
                    onReschedule={() => {
                      setActiveAppointmentConflict(null);
                      const savedEmail = email || localStorage.getItem("lead_email") || "";
                      navigate(`/booking?reschedule=true&email=${encodeURIComponent(savedEmail)}`);
                    }}
                    onKeepExisting={() => {
                      setActiveAppointmentConflict(null);
                      toast({ title: "Termin bestätigt ✓", description: "Dein bestehender Termin bleibt erhalten." });
                    }}
                  />
                </div>
              )}

              {/* Slot Picker */}
              {!activeAppointmentConflict && (
              <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6 md:p-8">
                <SlotPicker
                  key={slotPickerRefreshKey}
                  callType={selectedOption}
                  fallbackChain={leadQuality.fallbackChain}
                  onCalendarResolved={(resolvedType, usedFallback) => {
                    setResolvedCalendar(resolvedType);
                    if (usedFallback) {
                      trackFunnelEvent("booking_calendar_fallback", {
                        requested: selectedOption,
                        resolved: resolvedType,
                        qualification_tier: leadQuality.tier,
                      });
                    }
                  }}
                  onSlotSelected={(slotId, startsAt) => {
                    setSelectedSlotId(slotId);
                    setSelectedSlotTime(startsAt);
                    setBookingError(null); // Fehler verwerfen, sobald neuer Slot gewählt wird
                    trackFunnelEvent("booking_step_progress", {
                      step: "slot_selected",
                      selected_call_type: selectedOption,
                      resolved_calendar: resolvedCalendar,
                    });
                  }}
                  disabled={bookingInProgress}
                  maxVisibleSlots={leadQuality.maxVisibleSlots}
                />
                {/* Sichtbare Fehler-Box mit serverCode + serverMessage + Retry */}
                {bookingError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    aria-live="assertive"
                    className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-base font-semibold text-destructive">
                            {bookingError.title ?? "Buchung fehlgeschlagen"}
                          </h3>
                          <button
                            type="button"
                            onClick={() => setBookingError(null)}
                            className="rounded-sm p-0.5 text-destructive/70 hover:text-destructive"
                            aria-label="Fehler schließen"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-1 font-sans text-sm text-foreground/90">
                          {bookingError.message}
                        </p>
                        {bookingError.code && (
                          <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                            Fehlercode: <span className="text-destructive">{bookingError.code}</span>
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleConfirmBooking}
                            disabled={bookingInProgress || !selectedSlotId}
                            className="inline-flex items-center gap-2 rounded-sm border border-destructive bg-destructive px-3 py-1.5 font-sans text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {bookingInProgress ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowRight className="h-3.5 w-3.5" />
                            )}
                            Erneut versuchen
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBookingError(null);
                              setSelectedSlotId(null);
                              setSelectedSlotTime(null);
                              setSlotPickerRefreshKey((key) => key + 1);
                            }}
                            className="inline-flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-1.5 font-sans text-sm font-medium text-foreground hover:bg-muted"
                          >
                            Anderen Termin wählen
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Confirm button */}
                {selectedSlotId && selectedSlotTime && (
                  <motion.div
                    ref={confirmRef}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 border-t border-[hsl(var(--funnel-sand))] pt-6"
                  >
                    <div className="mb-4 rounded-xl border border-[hsl(var(--funnel-sand))] bg-[hsl(var(--funnel-cream))]/60 p-4">
                      <p className="mb-2 text-center font-sans text-xs font-medium uppercase tracking-wider text-[hsl(var(--funnel-grey))]">
                        Terminbestätigung
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                          <p className="font-display text-base font-semibold">
                            {format(parseISO(selectedSlotTime), "EEEE, d. MMMM yyyy", { locale: de })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                          <p className="font-display text-base font-semibold">
                            {format(parseISO(selectedSlotTime), "HH:mm", { locale: de })} Uhr
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <p className="font-sans text-xs text-muted-foreground">
                            Zeitzone: {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleConfirmBooking}
                      disabled={bookingInProgress}
                      className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-sm px-6 py-4 font-sans text-base font-semibold transition-all hover:opacity-90 disabled:opacity-40",
                        selectedOption === "priority"
                          ? "bg-[hsl(var(--funnel-gold))] text-[hsl(30,10%,12%)]"
                          : "bg-[hsl(var(--funnel-teal))] text-white"
                      )}
                    >
                      {bookingInProgress ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Wird gebucht…
                        </>
                      ) : (
                        <>
                          Termin jetzt sichern <Check className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </div>
              )}

              {/* Emotional trigger */}
              <div className="mt-6 text-center">
                <p className="font-display text-sm font-medium text-[hsl(var(--funnel-grey))]">
                  Nur ein Gespräch. Kann alles verändern.
                </p>
              </div>

              {/* Hesitation note */}
              <div className="mt-4 text-center">
                <p className="font-sans text-xs text-[hsl(var(--funnel-grey))]/70 italic">
                  Die meisten entscheiden sich jetzt einfach für einen Termin und klären alles Weitere im Gespräch.
                </p>
              </div>

              {/* ── Trust & Commitment Block ── */}
              <div className="mt-8 space-y-4">
                {/* What happens in the call */}
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6">
                  <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
                    <Target className="h-4 w-4 text-[hsl(var(--funnel-teal))]" />
                    Was passiert im Gespräch?
                  </h3>
                  <ul className="space-y-2.5">
                    {[
                      "Kein Verkaufsgespräch – sondern ehrliche Analyse",
                      "Klare Bewertung deiner aktuellen Situation",
                      "Konkrete Strategie, die zu dir passt",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Important rules */}
                <div className="rounded-sm border border-[hsl(var(--funnel-red))]/20 bg-[hsl(var(--funnel-red))]/5 p-6">
                  <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-[hsl(var(--funnel-red))]" />
                    Wichtig
                  </h3>
                  <ul className="space-y-2.5">
                    {[
                      "Bitte erscheine pünktlich – 5 Minuten vorher einloggen",
                      "Dieser Termin wird nicht wiederholt",
                      "Wir arbeiten ausschließlich mit ernsthaften Bewerbern",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                        <Ban className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--funnel-red))]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Trust signals */}
              <div className="mt-8">
                <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
                  {["100% transparent", "Kein Verkaufsdruck", "Nur für ernsthafte Bewerber"].map((item) => (
                    <li key={item} className="flex items-center gap-2 font-sans text-xs text-[hsl(var(--funnel-grey))]">
                      <Shield className="h-3.5 w-3.5 text-[hsl(var(--funnel-teal))]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Community Entry CTA — alternative path for low-tier leads (no dead-end). */}
              {leadQuality.showCommunityCTA && (
                <div className="mt-8 rounded-sm border border-[hsl(var(--funnel-gold))]/30 bg-[hsl(var(--funnel-gold))]/5 p-6">
                  <p className="font-display text-base font-semibold mb-1">
                    Lieber sofort starten – ohne Gespräch?
                  </p>
                  <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed mb-4">
                    Sichere dir direkten Zugang zur Community + den ersten Lernmodulen.
                    Du kannst jederzeit später ein Gespräch buchen.
                  </p>
                  <a
                    href="/community-access?src=booking_low"
                    onClick={() => {
                      trackFunnelEvent("community_cta_click", {
                        from: "booking_low",
                        qualification_tier: leadQuality.tier,
                        qualification_score: leadQuality.score,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-sm bg-[hsl(var(--funnel-gold))] px-5 py-3 font-sans text-sm font-semibold text-[hsl(30,10%,12%)] transition-all hover:opacity-90"
                  >
                    Community-Zugang sichern · 27 €
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════
              STEP: BOOKING CONFIRMED
             ═══════════════════════════════════════════ */}
          {step === "confirmed" && selectedSlotTime && (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              {/* Success card */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-teal))]/30 bg-[hsl(var(--funnel-teal))]/5 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--funnel-teal))]/15">
                    <Check className="h-7 w-7 text-[hsl(var(--funnel-teal))]" />
                  </div>
                  <h3 className="font-display text-2xl font-semibold mb-2">Stark.</h3>
                  <p className="font-sans text-base text-[hsl(var(--funnel-grey))] mb-4">
                    Dein Termin ist bestätigt.
                  </p>
                  <p className="font-sans text-sm text-[hsl(var(--funnel-grey))]">
                    Du hast gerade einen Schritt gemacht, den die meisten nie gehen.
                  </p>
                </div>
              </section>

              {/* Appointment Details */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6">
                  <h2 className="font-display text-lg font-semibold mb-4">Dein Termin</h2>
                  <div className="space-y-3 mb-5">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                      <p className="font-display text-base font-semibold">
                        {format(parseISO(selectedSlotTime), "EEEE, d. MMMM yyyy", { locale: de })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                      <p className="font-display text-base font-semibold">
                        {format(parseISO(selectedSlotTime), "HH:mm", { locale: de })} Uhr
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Target className="h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                      <p className="font-sans text-sm text-[hsl(var(--funnel-grey))]">Online · Video-Call</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="font-sans text-xs text-muted-foreground">
                        Zeitzone: {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  {/* Calendar provider selector */}
                  <div className="space-y-3">
                    <p className="font-sans text-xs font-medium text-[hsl(var(--funnel-grey))]">Zum Kalender hinzufügen:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: "google" as CalendarProvider, label: "Google Calendar", icon: "📅" },
                        { id: "outlook" as CalendarProvider, label: "Outlook", icon: "📧" },
                        { id: "apple" as CalendarProvider, label: "Apple Calendar", icon: "🍎" },
                        { id: "ics" as CalendarProvider, label: ".ics Datei", icon: "📥" },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                            const leadId = localStorage.getItem("lead_id");

                            // Save preference server-side
                            setPreferredCalendar(opt.id);
                            if (leadId) savePreferredCalendar(leadId, opt.id);

                            const eventOpts = {
                              startsAt: selectedSlotTime,
                              timezone: tz,
                              title: "Strategiegespräch – Ethical Closing",
                              description: "Dein persönliches Strategiegespräch. Ruhige Umgebung, stabile Verbindung.",
                              location: "Online · Video-Call",
                              durationMinutes: 30,
                            };

                            if (opt.id === "google") {
                              window.open(getGoogleCalendarUrl(eventOpts), "_blank", "noopener,noreferrer");
                            } else if (opt.id === "outlook") {
                              window.open(getOutlookCalendarUrl(eventOpts), "_blank", "noopener,noreferrer");
                            } else if (opt.id === "apple") {
                              // Apple Calendar uses ICS file
                              downloadIcs(eventOpts);
                            } else {
                              downloadIcs(eventOpts);
                            }

                            trackFunnelEvent("calendar_added", {
                              appointment_id: confirmedAppointmentId,
                              provider: opt.id,
                              timezone: tz,
                            });
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-sm border px-3 py-2.5 font-sans text-xs font-medium transition-all",
                            preferredCalendar === opt.id
                              ? "border-[hsl(var(--funnel-teal))] bg-[hsl(var(--funnel-teal))]/10 text-[hsl(var(--funnel-teal))]"
                              : "border-[hsl(var(--funnel-sand))] bg-white text-[hsl(var(--funnel-grey))] hover:border-[hsl(var(--funnel-teal))]/50 hover:bg-[hsl(var(--funnel-teal))]/5"
                          )}
                        >
                          <span>{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {preferredCalendar !== "ics" && (
                      <p className="text-center font-sans text-[10px] text-muted-foreground">
                        Deine Auswahl wird gespeichert — beim nächsten Mal ist {preferredCalendar === "google" ? "Google Calendar" : preferredCalendar === "outlook" ? "Outlook" : "Apple Calendar"} vorausgewählt.
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-center font-sans text-xs text-[hsl(var(--funnel-grey))] italic">
                    Dieser Termin ist exklusiv für dich reserviert. Bitte halte ihn frei.
                  </p>
                </div>
              </section>

              {/* Fastlane / Routing-Status — wer wurde zugewiesen + warum */}
              {confirmedAppointmentId && (
                <FastlaneAssignmentStatus appointmentId={confirmedAppointmentId} />
              )}

              {/* Verbindlichkeit */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-[hsl(var(--funnel-sand))]/10 p-5 text-center">
                  <p className="font-sans text-sm text-[hsl(var(--funnel-grey))] leading-relaxed">
                    Bitte plane dir diesen Termin fest ein.<br />
                    <span className="font-medium text-[hsl(30,10%,12%)]">Wir reservieren uns bewusst Zeit für dich.</span>
                  </p>
                </div>
              </section>

              {/* Show-Up Boost — Preparation */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6">
                  <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-[hsl(var(--funnel-gold))]" />
                    So holst du das Maximum aus deinem Gespräch
                  </h2>
                  <ul className="space-y-3 mb-5">
                    {[
                      "Sei pünktlich und ungestört",
                      "Notiere dir deine aktuelle Situation",
                      "Überlege dir dein Ziel (z. B. Einkommen / Veränderung)",
                      "Halte dir 20–30 Minuten frei",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="font-sans text-sm text-center font-medium text-[hsl(30,10%,12%)]">
                    Dieses Gespräch kann dein nächster Wendepunkt sein.
                  </p>
                </div>
              </section>

              {/* Pre-Frame */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6">
                  <h2 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
                    <Target className="h-4 w-4 text-[hsl(var(--funnel-teal))]" />
                    Im Gespräch schauen wir gemeinsam:
                  </h2>
                  <ul className="space-y-2.5">
                    {[
                      "Wo du aktuell stehst",
                      "Ob das Modell für dich funktioniert",
                      "Wie dein konkreter Einstieg aussehen kann",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* Next steps + CTA */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-sand))] bg-white p-6">
                  <h2 className="font-display text-lg font-semibold mb-5 flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-[hsl(var(--funnel-gold))]" />
                    Dein nächster Schritt
                  </h2>
                  <div className="space-y-4">
                    {[
                      { num: "1", text: "Logge dich in deinen Bewerberbereich ein", bold: true },
                      { num: "2", text: "Bereite dich kurz auf dein Gespräch vor" },
                      { num: "3", text: "Sei 5 Minuten vorher bereit – prüfe Technik & Verbindung" },
                    ].map((item) => (
                      <div key={item.num} className="flex items-center gap-4">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--funnel-teal))]/15 font-sans text-xs font-bold text-[hsl(var(--funnel-teal))]">
                          {item.num}
                        </span>
                        <p className={cn("font-sans text-sm", item.bold && "font-semibold")}>{item.text}</p>
                      </div>
                    ))}
                  </div>

                  <a
                    href={magicLink || getApplicantPortalUrl()}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-[hsl(var(--funnel-gold))] px-6 py-4 font-sans text-base font-semibold text-[hsl(30,10%,12%)] transition-all hover:opacity-90"
                  >
                    Zum Bewerberbereich
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </section>

              {/* Status-Gefühl */}
              <section className="mb-8">
                <div className="rounded-sm bg-[hsl(var(--funnel-teal))]/5 border border-[hsl(var(--funnel-teal))]/20 p-5 text-center">
                  <p className="font-sans text-sm font-semibold text-[hsl(var(--funnel-teal))]">
                    Du bist jetzt im Bewerbungsprozess.
                  </p>
                </div>
              </section>

              {/* Credentials notice */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-gold))]/30 bg-[hsl(var(--funnel-gold))]/5 p-6">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--funnel-gold))]" />
                    <div>
                      <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)] mb-1">
                        Bestätigung per E-Mail
                      </p>
                      <p className="font-sans text-sm leading-relaxed text-[hsl(var(--funnel-grey))]">
                        Du erhältst eine Bestätigung mit Termindetails und Kalender-Links.
                        Deine Zugangsdaten für den Bewerberbereich sind ebenfalls in deinem Postfach.
                      </p>
                      <p className="font-sans text-xs text-[hsl(var(--funnel-grey))] mt-2 italic">
                        Bitte prüfe auch deinen Spam-Ordner.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* No-show warning */}
              <section className="mb-8">
                <div className="rounded-sm border border-[hsl(var(--funnel-red))]/20 bg-[hsl(var(--funnel-red))]/5 p-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--funnel-red))]" />
                    <div>
                      <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)] mb-1">Wichtiger Hinweis:</p>
                      <p className="font-sans text-sm leading-relaxed text-[hsl(var(--funnel-grey))]">
                        Nicht wahrgenommene Termine werden nicht erneut vergeben.
                        Bitte buche nur, wenn du verbindlich Zeit hast.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Emotional trigger */}
              <section className="mb-8 text-center">
                <p className="font-display text-base font-semibold text-[hsl(30,10%,12%)]">
                  Nur ein Gespräch.<br />Kann alles verändern.
                </p>
              </section>

              {/* Trust signals */}
              <section>
                <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
                  {["100% transparent", "Kein Verkaufsdruck", "Nur für ernsthafte Bewerber"].map((item) => (
                    <li key={item} className="flex items-center gap-2 font-sans text-xs text-[hsl(var(--funnel-grey))]">
                      <Shield className="h-3.5 w-3.5 text-[hsl(var(--funnel-teal))]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </motion.div>
          )}

        </AnimatePresence>

      </div>
      <FunnelFooter />
    </div>
  );
};

export default Booking;
