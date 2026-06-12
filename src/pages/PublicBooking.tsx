/**
 * /book — Public Booking Page
 *
 * Allows visitors WITHOUT a quiz / qualification to book a standard call.
 * Identity resolution is strictly separated:
 *   • Booking Identity  → who is the lead for this appointment?
 *   • Platform Identity  → what access rights does this user have?
 *
 * Flow:
 *   1. Visitor sees slot picker (standard slots only)
 *   2. After selecting a slot → LeadCaptureModal opens
 *   3. On submit → edge function creates/reuses lead + creates appointment
 *   4. Confirmation screen with calendar add + reschedule/cancel
 *
 * CRITICAL: Lead creation NEVER overwrites an existing platform role.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Calendar, Download, ExternalLink, RefreshCw, X, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackFunnelEvent } from "@/lib/track-event";
import { dispatchMosPostBooking } from "@/lib/mos-post-booking-dispatch";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import CuratedSlotPicker from "@/components/booking/CuratedSlotPicker";
import LeadCaptureModal, { type LeadCaptureData } from "@/components/booking/LeadCaptureModal";
import ActiveAppointmentConflict from "@/components/booking/ActiveAppointmentConflict";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { downloadIcs } from "@/lib/generate-ics";
import {
  type CalendarProvider,
  getGoogleCalendarUrl,
  getOutlookCalendarUrl,
  savePreferredCalendar,
} from "@/lib/calendar-links";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

export default function PublicBooking() {
  const { toast } = useToast();
  const confirmRef = useRef<HTMLDivElement>(null);

  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);
  const [showLeadCapture, setShowLeadCapture] = useState(false);
  const [confirmedAppointmentId, setConfirmedAppointmentId] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [step, setStep] = useState<"slots" | "confirmed" | "reschedule" | "cancelled">("slots");
  const [preferredCalendar, setPreferredCalendar] = useState<CalendarProvider>("ics");
  const [activeConflict, setActiveConflict] = useState<{
    existing_starts_at: string;
    existing_ends_at: string;
    existing_status: string;
  } | null>(null);

  // Cancel/reschedule state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    trackFunnelEvent("public_booking_view", { route: window.location.pathname });
  }, []);

  const handleSlotSelected = (slotId: string, startsAt: string) => {
    setSelectedSlotId(slotId);
    setSelectedSlotTime(startsAt);
    setShowLeadCapture(true);
    trackFunnelEvent("public_booking_slot_selected", { slot_id: slotId });
  };

  const handleLeadCaptureSubmit = async (data: LeadCaptureData) => {
    if (!selectedSlotId) throw new Error("Kein Termin ausgewählt.");

    const { data: result, error } = await supabase.functions.invoke("create-appointment", {
      body: {
        email: data.email,
        name: data.name,
        phone: data.phone,
        slot_id: selectedSlotId,
        call_type: "standard",
        funnel_source: "public_booking_page",
        public_booking: true,
        timezone: "Europe/Berlin",
      },
    });

    if (error) {
      let serverMessage: string | undefined;
      let serverErrorCode: string | undefined;
      let serverBody: any = null;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.text === "function") {
          const raw = await ctx.clone().text().catch(() => "");
          const parsed = raw ? JSON.parse(raw) : null;
          serverBody = parsed;
          if (parsed?.error) serverMessage = parsed.error;
          if (parsed?.error_code) serverErrorCode = parsed.error_code;
        }
      } catch { /* swallow */ }
      console.error("[public-booking] create-appointment failed", { error, serverMessage, serverErrorCode });

      // Active appointment conflict → show conflict UI
      if (serverErrorCode === "ACTIVE_APPOINTMENT_EXISTS" && serverBody) {
        setActiveConflict({
          existing_starts_at: serverBody.existing_starts_at,
          existing_ends_at: serverBody.existing_ends_at,
          existing_status: serverBody.existing_status,
        });
        setShowLeadCapture(false);
        return; // Don't throw — handled by conflict UI
      }

      throw new Error(serverMessage ?? "Buchung fehlgeschlagen. Bitte versuche es erneut.");
    }

    const res = result as {
      success?: boolean;
      appointment_id?: string;
      lead_id?: string;
      magic_link?: string;
      starts_at?: string;
      error?: string;
    };

    if (!res?.success) throw new Error(res?.error ?? "Buchung fehlgeschlagen.");

    if (res.magic_link) setMagicLink(res.magic_link);
    if (res.appointment_id) setConfirmedAppointmentId(res.appointment_id);
    if (res.lead_id) localStorage.setItem("lead_id", res.lead_id);
    setConfirmedEmail(data.email);
    localStorage.setItem("lead_email", data.email);
    localStorage.setItem("lead_name", data.name);
    localStorage.setItem("lead_phone", data.phone);

    if (res.lead_id) void savePreferredCalendar(res.lead_id, preferredCalendar);

    setShowLeadCapture(false);
    setStep("confirmed");

    trackFunnelEvent("public_booking_created", {
      appointment_id: res.appointment_id,
      lead_id: res.lead_id,
      slot_id: selectedSlotId,
    });

    // Phase 11 — MOS-gated WhatsApp + ICS dispatch (fire-and-forget, never blocks).
    if (res.appointment_id) {
      dispatchMosPostBooking({
        appointment_id: res.appointment_id,
        lead_id: res.lead_id ?? null,
        email: data.email,
        phone: data.phone,
        name: data.name,
        starts_at: res.starts_at ?? null,
      });
    }

    toast({ title: "Termin gebucht ✓", description: "Dein Strategiegespräch ist bestätigt." });
  };

  // ── Cancel handler ────────────────────────────────────
  const handleCancel = async () => {
    if (!confirmedAppointmentId || !confirmedEmail) return;
    setCancelling(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("manage-public-booking", {
        body: {
          action: "cancel",
          appointment_id: confirmedAppointmentId,
          email: confirmedEmail,
        },
      });
      if (error) throw error;
      const res = result as { success?: boolean; error?: string };
      if (!res?.success) throw new Error(res?.error ?? "Stornierung fehlgeschlagen.");

      setCancelDialogOpen(false);
      setStep("cancelled");
      trackFunnelEvent("public_booking_cancelled", { appointment_id: confirmedAppointmentId });
      toast({ title: "Termin storniert", description: "Dein Termin wurde erfolgreich storniert." });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Stornierung fehlgeschlagen.", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  // ── Reschedule: enter slot picker ─────────────────────
  const startReschedule = () => {
    setStep("reschedule");
    trackFunnelEvent("public_booking_reschedule_started", { appointment_id: confirmedAppointmentId });
  };

  const handleRescheduleSlotSelected = async (slotId: string, startsAt: string) => {
    if (!confirmedAppointmentId || !confirmedEmail) return;
    setRescheduling(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("manage-public-booking", {
        body: {
          action: "reschedule",
          appointment_id: confirmedAppointmentId,
          email: confirmedEmail,
          new_slot_id: slotId,
        },
      });
      if (error) throw error;
      const res = result as {
        success?: boolean;
        error?: string;
        new_appointment_id?: string;
        new_starts_at?: string;
      };
      if (!res?.success) throw new Error(res?.error ?? "Umbuchung fehlgeschlagen.");

      // Update state with new appointment
      setConfirmedAppointmentId(res.new_appointment_id ?? null);
      setSelectedSlotId(slotId);
      setSelectedSlotTime(res.new_starts_at ?? startsAt);
      setStep("confirmed");

      trackFunnelEvent("public_booking_rescheduled", {
        old_appointment_id: confirmedAppointmentId,
        new_appointment_id: res.new_appointment_id,
      });

      toast({ title: "Termin umgebucht ✓", description: "Dein neuer Termin ist bestätigt." });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Umbuchung fehlgeschlagen.", variant: "destructive" });
    } finally {
      setRescheduling(false);
    }
  };

  const calendarTitle = "Strategiegespräch – Ethical Closing";
  const calendarDescription = "Dein persönliches Strategiegespräch.";
  const CANONICAL_TZ = "Europe/Berlin";
  const calendarOpts = selectedSlotTime
    ? { title: calendarTitle, startsAt: selectedSlotTime, durationMinutes: 30, description: calendarDescription, timezone: CANONICAL_TZ }
    : null;

  const formattedTime = selectedSlotTime
    ? (() => {
        try {
          const d = new Date(selectedSlotTime);
          const datePart = d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: CANONICAL_TZ });
          const timePart = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: CANONICAL_TZ });
          return `${datePart} um ${timePart} Uhr`;
        } catch { return selectedSlotTime; }
      })()
    : null;

  return (
    <div className="min-h-screen bg-[hsl(var(--funnel-warm-bg))] text-[hsl(30,10%,12%)]">
      <div className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <AnimatePresence mode="wait">
          {/* ═══ STEP: SLOT SELECTION ═══ */}
          {step === "slots" && (
            <motion.div key="slots" {...fade} transition={{ duration: 0.5 }}>
              <div className="mb-8 text-center">
                <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  Termin buchen
                </h1>
                <p className="mt-2 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                  Wähle einen passenden Termin für dein persönliches Strategiegespräch.
                </p>
              </div>
              {activeConflict ? (
                <ActiveAppointmentConflict
                  existingStartsAt={activeConflict.existing_starts_at}
                  existingEndsAt={activeConflict.existing_ends_at}
                  existingStatus={activeConflict.existing_status}
                  onReschedule={() => {
                    setActiveConflict(null);
                    const savedEmail = localStorage.getItem("lead_email") || "";
                    window.location.href = `/booking?reschedule=true&email=${encodeURIComponent(savedEmail)}`;
                  }}
                  onKeepExisting={() => {
                    setActiveConflict(null);
                    toast({ title: "Termin bestätigt ✓", description: "Dein bestehender Termin bleibt erhalten." });
                  }}
                />
              ) : (
                <CuratedSlotPicker
                  onSlotSelected={handleSlotSelected}
                />
              )}
            </motion.div>
          )}

          {/* ═══ STEP: CONFIRMED ═══ */}
          {step === "confirmed" && (
            <motion.div key="confirmed" {...fade} transition={{ duration: 0.5 }} ref={confirmRef}>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="font-display text-2xl font-semibold">Termin bestätigt</h2>
                {formattedTime && (
                  <p className="mt-2 font-sans text-base text-[hsl(var(--funnel-grey))]">
                    {formattedTime}
                  </p>
                )}

                {/* Calendar buttons */}
                {selectedSlotTime && calendarOpts && (
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button
                      onClick={() => { setPreferredCalendar("google"); window.open(getGoogleCalendarUrl(calendarOpts), "_blank", "noopener,noreferrer"); }}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--funnel-sand))] bg-white px-4 py-2.5 font-sans text-sm hover:bg-gray-50 transition-colors"
                    >
                      <Calendar className="h-4 w-4" /> Google Kalender
                    </button>
                    <button
                      onClick={() => { setPreferredCalendar("outlook"); window.open(getOutlookCalendarUrl(calendarOpts), "_blank", "noopener,noreferrer"); }}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--funnel-sand))] bg-white px-4 py-2.5 font-sans text-sm hover:bg-gray-50 transition-colors"
                    >
                      <Calendar className="h-4 w-4" /> Outlook
                    </button>
                    <button
                      onClick={() => { setPreferredCalendar("ics"); downloadIcs(calendarOpts); }}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--funnel-sand))] bg-white px-4 py-2.5 font-sans text-sm hover:bg-gray-50 transition-colors"
                    >
                      <Download className="h-4 w-4" /> .ics
                    </button>
                  </div>
                )}

                {/* ── Reschedule & Cancel ── */}
                <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    onClick={startReschedule}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--funnel-sand))] bg-white px-5 py-2.5 font-sans text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" /> Termin verschieben
                  </button>
                  <button
                    onClick={() => setCancelDialogOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 font-sans text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <X className="h-4 w-4" /> Termin absagen
                  </button>
                </div>

                {/* Applicant portal CTA */}
                {magicLink && (
                  <a
                    href={magicLink}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--funnel-gold))] px-6 py-3 font-sans text-sm font-semibold text-white transition-all hover:brightness-110"
                  >
                    <ExternalLink className="h-4 w-4" /> Zum Bewerberbereich
                  </a>
                )}
              </div>
            </motion.div>
          )}

          {/* ═══ STEP: RESCHEDULE (slot picker) ═══ */}
          {step === "reschedule" && (
            <motion.div key="reschedule" {...fade} transition={{ duration: 0.5 }}>
              <div className="mb-8">
                <button
                  onClick={() => setStep("confirmed")}
                  className="mb-4 flex items-center gap-1.5 font-sans text-sm text-[hsl(var(--funnel-grey))] hover:text-[hsl(30,10%,12%)] transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Zurück
                </button>
                <div className="text-center">
                  <h2 className="font-display text-2xl font-semibold tracking-tight">
                    Neuen Termin wählen
                  </h2>
                  <p className="mt-2 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                    Wähle einen neuen Termin. Dein bisheriger Termin wird automatisch storniert.
                  </p>
                </div>
              </div>

              {rescheduling ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--funnel-grey))]" />
                  <p className="font-sans text-sm text-[hsl(var(--funnel-grey))]">Termin wird umgebucht…</p>
                </div>
              ) : (
                <CuratedSlotPicker
                  onSlotSelected={handleRescheduleSlotSelected}
                />
              )}
            </motion.div>
          )}

          {/* ═══ STEP: CANCELLED ═══ */}
          {step === "cancelled" && (
            <motion.div key="cancelled" {...fade} transition={{ duration: 0.5 }}>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <X className="h-8 w-8 text-red-500" />
                </div>
                <h2 className="font-display text-2xl font-semibold">Termin storniert</h2>
                <p className="mt-2 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                  Dein Termin wurde erfolgreich storniert.
                </p>
                <button
                  onClick={() => {
                    setStep("slots");
                    setConfirmedAppointmentId(null);
                    setSelectedSlotId(null);
                    setSelectedSlotTime(null);
                  }}
                  className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--funnel-gold))] px-6 py-3 font-sans text-sm font-semibold text-white transition-all hover:brightness-110"
                >
                  <Calendar className="h-4 w-4" /> Neuen Termin buchen
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lead Capture Modal */}
        <LeadCaptureModal
          open={showLeadCapture}
          onClose={() => setShowLeadCapture(false)}
          onSubmit={handleLeadCaptureSubmit}
          selectedSlotTime={selectedSlotTime}
        />

        {/* Cancel Confirmation Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Termin absagen?</DialogTitle>
              <DialogDescription>
                Möchtest du deinen Termin{formattedTime ? ` am ${formattedTime}` : ""} wirklich absagen? Diese Aktion kann nicht rückgängig gemacht werden.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>
                Behalten
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Ja, absagen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <FunnelFooter />
    </div>
  );
}
