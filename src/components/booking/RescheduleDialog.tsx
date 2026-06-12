/**
 * RescheduleDialog — 3-step reschedule flow
 * Step 1: Show current appointment details
 * Step 2: Pick new slot
 * Step 3: Confirm
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ArrowRight, Check, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { de as deLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  appointment_status: string;
  lead_id?: string;
  lead_name?: string;
  setter_name?: string;
  closer_name?: string;
}

interface Props {
  appointment: Appointment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled?: (newId: string) => void;
}

const T = {
  card: "#FFFFFF", border: "#E8E2D9", ink: "#1A1A1A",
  secondary: "#6A6A6A", muted: "#9A9590", gold: "#C6A96B", goldLight: "#F5F0E6",
  danger: "#B04A3A", success: "#7A9E7E", bg: "#F8F5F0",
} as const;

type Step = "review" | "pick" | "confirm";

export default function RescheduleDialog({ appointment, open, onOpenChange, onRescheduled }: Props) {
  const { lang } = useLanguage();
  const { profile } = useAuth();
  const { toast } = useToast();
  const t = (de: string, en: string) => lang === "de" ? de : en;

  const [step, setStep] = useState<Step>("review");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("review");
    setNewDate("");
    setNewTime("");
    setError(null);
  }, []);

  const handleClose = useCallback((v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  }, [onOpenChange, reset]);

  const newStartIso = newDate && newTime ? `${newDate}T${newTime}:00+02:00` : null;

  const handleConfirm = useCallback(async () => {
    if (!newStartIso || !profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc("reschedule_appointment" as any, {
        p_appointment_id: appointment.id,
        p_new_start: newStartIso,
        p_user_id: profile.id,
      });
      if (err) throw err;
      const result = data as any;
      if (!result?.success) {
        const errMap: Record<string, string> = {
          appointment_not_found: t("Termin nicht gefunden", "Appointment not found"),
          new_time_in_past: t("Zeitpunkt liegt in der Vergangenheit", "Time is in the past"),
          double_booking: t("Doppelbuchung erkannt", "Double booking detected"),
          operator_conflict: t("Operator hat bereits einen Termin", "Operator already has an appointment"),
        };
        setError(errMap[result?.error] || result?.error || "Unknown error");
        return;
      }
      toast({
        title: t("Termin verschoben", "Appointment rescheduled"),
        description: t("Der neue Termin wurde erstellt.", "The new appointment has been created."),
      });
      onRescheduled?.(result.new_appointment_id);
      handleClose(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [newStartIso, appointment.id, profile?.id, toast, t, onRescheduled, handleClose]);

  const oldStart = new Date(appointment.starts_at);
  const oldEnd = new Date(appointment.ends_at);
  const fmtDate = (d: Date) => format(d, "EEEE, d. MMMM yyyy", { locale: lang === "de" ? deLocale : undefined });
  const fmtTime = (d: Date) => format(d, "HH:mm");

  // Min date = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" style={{ background: T.card }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base" style={{ color: T.ink }}>
            <Calendar className="h-4 w-4" style={{ color: T.gold }} />
            {t("Termin verschieben", "Reschedule Appointment")}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-[11px] mb-4" style={{ color: T.muted }}>
          {(["review", "pick", "confirm"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <span
                className="h-5 w-5 rounded-full grid place-items-center text-[10px] font-semibold"
                style={{
                  background: step === s ? T.gold : s === "confirm" && step === "pick" ? T.bg : T.bg,
                  color: step === s ? "white" : T.muted,
                  border: `1px solid ${step === s ? T.gold : T.border}`,
                }}
              >
                {i + 1}
              </span>
              <span style={{ color: step === s ? T.ink : T.muted }}>
                {s === "review" ? t("Aktuell", "Current") : s === "pick" ? t("Neuer Termin", "New Slot") : t("Bestätigen", "Confirm")}
              </span>
              {i < 2 && <ArrowRight className="h-3 w-3 mx-1" style={{ color: T.border }} />}
            </div>
          ))}
        </div>

        {/* Step 1: Review */}
        {step === "review" && (
          <div className="space-y-3">
            <div className="rounded-xl border p-4" style={{ borderColor: T.border, background: T.bg }}>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: T.muted }}>{t("Aktueller Termin", "Current Appointment")}</p>
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: T.ink }}>
                <Calendar className="h-3.5 w-3.5" style={{ color: T.gold }} />
                {fmtDate(oldStart)}
              </div>
              <div className="flex items-center gap-2 text-sm mt-1" style={{ color: T.secondary }}>
                <Clock className="h-3.5 w-3.5" />
                {fmtTime(oldStart)} – {fmtTime(oldEnd)}
              </div>
              {appointment.lead_name && (
                <p className="text-xs mt-2" style={{ color: T.secondary }}>Lead: <span style={{ color: T.ink }}>{appointment.lead_name}</span></p>
              )}
              {appointment.setter_name && (
                <p className="text-xs" style={{ color: T.secondary }}>Setter: <span style={{ color: T.ink }}>{appointment.setter_name}</span></p>
              )}
              {appointment.closer_name && (
                <p className="text-xs" style={{ color: T.secondary }}>Closer: <span style={{ color: T.ink }}>{appointment.closer_name}</span></p>
              )}
            </div>
            <p className="text-xs" style={{ color: T.muted }}>
              {t(
                "Der aktuelle Termin wird auf 'verschoben' gesetzt. Ein neuer Termin wird erstellt.",
                "The current appointment will be set to 'rescheduled'. A new appointment will be created."
              )}
            </p>
          </div>
        )}

        {/* Step 2: Pick new date/time */}
        {step === "pick" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.secondary }}>{t("Neues Datum", "New Date")}</label>
              <input
                type="date"
                min={minDate}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: T.border, color: T.ink }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: T.secondary }}>{t("Neue Uhrzeit", "New Time")}</label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: T.border, color: T.ink }}
                step="900"
              />
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && newStartIso && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3" style={{ borderColor: T.border, background: T.bg, opacity: 0.6 }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: T.muted }}>{t("Alt", "Old")}</p>
                <p className="text-xs font-medium line-through" style={{ color: T.secondary }}>{fmtDate(oldStart)}</p>
                <p className="text-xs line-through" style={{ color: T.muted }}>{fmtTime(oldStart)}</p>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: T.gold, background: T.goldLight }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: T.gold }}>{t("Neu", "New")}</p>
                <p className="text-xs font-medium" style={{ color: T.ink }}>{fmtDate(new Date(newStartIso))}</p>
                <p className="text-xs" style={{ color: T.secondary }}>{fmtTime(new Date(newStartIso))}</p>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-xl border p-3 text-xs" style={{ borderColor: T.danger, color: T.danger }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          {step === "review" && (
            <Button onClick={() => setStep("pick")} className="w-full rounded-xl" style={{ background: T.gold, color: "white" }}>
              {t("Neuen Termin wählen", "Choose new slot")} <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {step === "pick" && (
            <>
              <Button variant="outline" onClick={() => setStep("review")} className="rounded-xl">{t("Zurück", "Back")}</Button>
              <Button
                onClick={() => { setError(null); setStep("confirm"); }}
                disabled={!newDate || !newTime}
                className="flex-1 rounded-xl"
                style={{ background: T.gold, color: "white" }}
              >
                {t("Vorschau", "Preview")} <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("pick")} className="rounded-xl">{t("Zurück", "Back")}</Button>
              <Button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 rounded-xl"
                style={{ background: T.gold, color: "white" }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                {t("Verschieben bestätigen", "Confirm Reschedule")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
