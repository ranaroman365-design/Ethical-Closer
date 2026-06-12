import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Target, Zap, ExternalLink, Mail, AlertTriangle, Shield, Calendar, Download } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { formatAppointmentTimeForDisplay, formatAppointmentTimeForICS, BUSINESS_TIMEZONE } from "@/lib/appointment-time-contract";
import { getSocialProofDwellAttribution } from "@/lib/social-proof-dwell";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import CommitmentStack from "@/components/funnel/CommitmentStack";
import ProvisioningRetryStatus from "@/components/provisioning/ProvisioningRetryStatus";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getApplicantPortalUrl } from "@/lib/lead-storage";

/**
 * Sprint 4 — Standalone confirmation / thank-you page.
 * Accessible at /booking/confirmed
 */
export default function BookingConfirmed() {
  const [appointmentTime] = useState(() => localStorage.getItem("last_booked_slot_time"));
  const [leadName] = useState(() => localStorage.getItem("lead_name") || "");
  const [appointmentId] = useState(() => localStorage.getItem("last_appointment_id"));
  const [leadId] = useState(() => localStorage.getItem("last_lead_id"));
  const [provisioned, setProvisioned] = useState<boolean | null>(null);

  const checkProvisioning = useCallback(async () => {
    if (!appointmentId) {
      setProvisioned(true);
      return;
    }
    const { data } = await supabase
      .from("appointments")
      .select("setter_id, video_call_link, appointment_status")
      .eq("id", appointmentId)
      .maybeSingle();
    const ready = Boolean(
      data &&
        (data as { setter_id?: string | null; video_call_link?: string | null }).setter_id &&
        (data as { setter_id?: string | null; video_call_link?: string | null }).video_call_link
    );
    setProvisioned(ready);
  }, [appointmentId]);

  useEffect(() => {
    void checkProvisioning();
  }, [checkProvisioning]);

  useEffect(() => {
    // Attach social-proof dwell attribution so we can correlate the mobile
    // social-proof exposure on /apply with eventual booking conversion.
    const dwell = getSocialProofDwellAttribution();
    trackFunnelEvent("BOOKING_SUCCESS", { funnel: "high-income-skill", ...dwell });
    trackFunnelEvent("CONFIRMATION_VIEW", { funnel: "high-income-skill", ...dwell });
  }, []);

  const formattedDate = appointmentTime
    ? (() => {
        const display = formatAppointmentTimeForDisplay({ starts_at: appointmentTime, booking_timezone: BUSINESS_TIMEZONE }, { locale: "de-DE" });
        return `${display.date} um ${display.startTime} Uhr`;
      })()
    : null;

  const generateICS = () => {
    if (!appointmentTime) return;
    const icsData = formatAppointmentTimeForICS({ starts_at: appointmentTime, booking_timezone: BUSINESS_TIMEZONE });
    if (!icsData) return;
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "BEGIN:VTIMEZONE",
      `TZID:${icsData.timezone}`,
      "BEGIN:DAYLIGHT", "TZNAME:CEST", "DTSTART:19700329T020000",
      "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
      "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZNAME:CET", "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
      "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      icsData.dtstart, icsData.dtend,
      "SUMMARY:Strategiegespräch – Ethical Closing",
      "DESCRIPTION:Dein persönliches Strategiegespräch. Ruhige Umgebung\\, stabile Verbindung.",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bewerbungsgespraech.ics"; a.click();
    URL.revokeObjectURL(url);
  };

  const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-5 py-14 md:py-24">

        {/* ── Success Hero ── */}
        <motion.section {...fade} className="mb-8">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-semibold mb-2">
              {leadName ? `Stark, ${leadName}.` : "Stark."}
            </h1>
            <p className="font-sans text-base text-muted-foreground mb-2">
              Dein Termin ist bestätigt.
            </p>
            <p className="font-sans text-sm text-muted-foreground">
              Du hast gerade einen Schritt gemacht, den die meisten nie gehen.
            </p>
          </div>
        </motion.section>

        {/* ── Appointment Details ── */}
        {formattedDate && (
          <motion.section {...fade} transition={{ delay: 0.1 }} className="mb-8">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="font-display text-lg font-semibold mb-4">Dein Termin</h2>
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 shrink-0 text-primary" />
                  <p className="font-display text-base font-semibold">{formattedDate}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Target className="h-4 w-4 shrink-0 text-primary" />
                  <p className="font-sans text-sm text-muted-foreground">Online · Video-Call</p>
                </div>
              </div>

              {/* Calendar Download */}
              <button
                onClick={generateICS}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 font-sans text-sm font-medium text-foreground transition-all hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                In Kalender eintragen (.ics)
              </button>
            </div>
          </motion.section>
        )}

        {/* ── Provisioning retry status (only while setter/video link still propagating) ── */}
        {appointmentId && provisioned === false && (
          <motion.section {...fade} transition={{ delay: 0.15 }} className="mb-8">
            <ProvisioningRetryStatus
              onRefresh={checkProvisioning}
              intervalSeconds={10}
              title="Wir bereiten dein Gespräch vor…"
              description="Setter-Zuweisung und Video-Link werden gerade erstellt. Du kannst jederzeit manuell prüfen."
            />
          </motion.section>
        )}

        {/* ── 3-Punkt Commitment Stack (show-up lever) ── */}
        <CommitmentStack appointmentId={appointmentId} leadId={leadId} />

        {/* ── Preparation ── */}
        <motion.section {...fade} transition={{ delay: 0.2 }} className="mb-8">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              So holst du das Maximum heraus
            </h2>
            <ul className="space-y-3">
              {[
                "Sei pünktlich und ungestört",
                "Notiere dir deine aktuelle Situation",
                "Überlege dir dein Ziel (z. B. Einkommen / Veränderung)",
                "Halte dir 20–30 Minuten frei",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 font-sans text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>

        {/* ── Next Steps ── */}
        <motion.section {...fade} transition={{ delay: 0.3 }} className="mb-8">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="font-display text-lg font-semibold mb-5 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Dein nächster Schritt
            </h2>
            <div className="space-y-4 mb-6">
              {[
                { num: "1", text: "Check dein Postfach für die Bestätigung" },
                { num: "2", text: "Trag den Termin in deinen Kalender ein" },
                { num: "3", text: "Sei 5 Minuten vorher bereit" },
              ].map((item) => (
                <div key={item.num} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-sans text-xs font-bold text-primary">
                    {item.num}
                  </span>
                  <p className="font-sans text-sm text-foreground">{item.text}</p>
                </div>
              ))}
            </div>

            <a
              href={getApplicantPortalUrl()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 font-sans text-base font-semibold text-primary-foreground transition-all hover:opacity-90"
            >
              Zum Bewerberbereich
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </motion.section>

        {/* ── Email Notice ── */}
        <motion.section {...fade} transition={{ delay: 0.4 }} className="mb-8">
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-6">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent-foreground" />
              <div>
                <p className="font-sans text-sm font-semibold text-foreground mb-1">Bestätigung per E-Mail</p>
                <p className="font-sans text-sm leading-relaxed text-muted-foreground">
                  Du erhältst eine Bestätigung mit Termindetails und Kalender-Links. Bitte prüfe auch deinen Spam-Ordner.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── No-show Warning ── */}
        <motion.section {...fade} transition={{ delay: 0.5 }} className="mb-8">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-sans text-sm font-semibold text-foreground mb-1">Wichtiger Hinweis</p>
                <p className="font-sans text-sm leading-relaxed text-muted-foreground">
                  Nicht wahrgenommene Termine werden nicht erneut vergeben. Bitte buche nur, wenn du verbindlich Zeit hast.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── Trust ── */}
        <motion.section {...fade} transition={{ delay: 0.6 }} className="text-center">
          <p className="font-display text-base font-semibold text-foreground mb-4">
            Nur ein Gespräch. Kann alles verändern.
          </p>
          <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            {["100% transparent", "Kein Verkaufsdruck", "Nur für ernsthafte Bewerber"].map((item) => (
              <li key={item} className="flex items-center gap-2 font-sans text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </motion.section>

      </div>
      <FunnelFooter />
    </div>
  );
}
