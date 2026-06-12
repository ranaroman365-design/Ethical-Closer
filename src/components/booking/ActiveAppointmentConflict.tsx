/**
 * ActiveAppointmentConflict — Shown when a lead already has an active appointment.
 * Offers: view existing appointment details, reschedule, or keep current.
 */
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { formatAppointmentTimeRangeForDisplay, formatAppointmentTimeForEmail } from "@/lib/appointment-time-contract";

interface ActiveAppointmentConflictProps {
  existingStartsAt: string;
  existingEndsAt: string;
  existingStatus: string;
  onReschedule: () => void;
  onKeepExisting: () => void;
}

export default function ActiveAppointmentConflict({
  existingStartsAt,
  existingEndsAt,
  existingStatus,
  onReschedule,
  onKeepExisting,
}: ActiveAppointmentConflictProps) {
  const emailFmt = formatAppointmentTimeForEmail({
    starts_at: existingStartsAt,
    ends_at: existingEndsAt,
  });

  const displayRange = formatAppointmentTimeRangeForDisplay({
    starts_at: existingStartsAt,
    ends_at: existingEndsAt,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 space-y-5"
    >
      <div className="flex items-start gap-3">
        <Calendar className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-[hsl(30,10%,12%)]">
            Du hast bereits einen reservierten Termin
          </h3>
          <p className="font-sans text-sm text-[hsl(30,10%,40%)]">
            Du kannst den Termin verschieben oder deinen bestehenden Termin behalten.
          </p>
        </div>
      </div>

      {/* Existing appointment card */}
      <div className="rounded-xl border border-amber-100 bg-white p-4 flex items-center gap-3">
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        <div>
          <p className="font-sans text-sm font-semibold text-[hsl(30,10%,12%)]">
            {emailFmt.date}
          </p>
          <p className="font-sans text-xs text-[hsl(30,10%,40%)]">
            {displayRange} · Europe/Berlin
          </p>
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onReschedule}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--funnel-gold))] px-5 py-3 font-sans text-sm font-semibold text-white hover:brightness-110 transition-all"
        >
          Termin verschieben
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={onKeepExisting}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--funnel-sand))] bg-white px-5 py-3 font-sans text-sm font-semibold text-[hsl(30,10%,12%)] hover:bg-[hsl(var(--funnel-sand))]/20 transition-all"
        >
          Bestehenden Termin behalten
        </button>
      </div>
    </motion.div>
  );
}
