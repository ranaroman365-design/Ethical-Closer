import { useEffect, useMemo, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * 3-Punkt Commitment Stack — Booking Confirmation.
 * Increases show-up rate by forcing explicit identity-aligned commitment.
 * Persists to `appointment_commitments` (RLS-gated to existing booked appts).
 */
type Key = "show_on_time" | "quiet_environment" | "open_to_change";

const ITEMS: { key: Key; label: string }[] = [
  { key: "show_on_time",       label: "Ich erscheine pünktlich." },
  { key: "quiet_environment",  label: "Ich bin in einer ruhigen Umgebung." },
  { key: "open_to_change",     label: "Ich bin offen für Veränderung." },
];

export default function CommitmentStack({
  appointmentId,
  leadId,
}: {
  appointmentId?: string | null;
  leadId?: string | null;
}) {
  const storageKey = useMemo(
    () => (appointmentId ? `commitment_confirmed_${appointmentId}` : null),
    [appointmentId],
  );
  const [checks, setChecks] = useState<Record<Key, boolean>>({
    show_on_time: false, quiet_environment: false, open_to_change: false,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (storageKey && localStorage.getItem(storageKey) === "1") setConfirmed(true);
  }, [storageKey]);

  const allChecked = ITEMS.every((i) => checks[i.key]);

  const handleConfirm = async () => {
    if (!appointmentId || !leadId || !allChecked) return;
    setSubmitting(true);
    try {
      await supabase.from("appointment_commitments").insert({
        appointment_id: appointmentId,
        lead_id: leadId,
        commit_show_on_time: checks.show_on_time,
        commit_quiet_environment: checks.quiet_environment,
        commit_open_to_change: checks.open_to_change,
        user_agent: navigator.userAgent,
      });
      if (storageKey) localStorage.setItem(storageKey, "1");
      setConfirmed(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!appointmentId || !leadId) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Dein Commitment
        </h2>
        <p className="font-sans text-sm text-muted-foreground mb-5">
          Dieser Termin ist verbindlich. Bestätige drei Dinge — dann ist dein Slot final gesichert.
        </p>

        <ul className="space-y-3 mb-6">
          {ITEMS.map((i) => {
            const checked = checks[i.key];
            return (
              <li key={i.key}>
                <button
                  type="button"
                  disabled={confirmed}
                  onClick={() => setChecks((s) => ({ ...s, [i.key]: !s[i.key] }))}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-all",
                    checked
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-background hover:border-primary/30",
                    confirmed && "opacity-80 cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    )}
                  >
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="font-sans text-sm text-foreground">{i.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {confirmed ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 font-sans text-sm font-medium text-primary">
            <Check className="h-4 w-4" />
            Commitment bestätigt — wir sehen uns im Call.
          </div>
        ) : (
          <button
            type="button"
            disabled={!allChecked || submitting}
            onClick={handleConfirm}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 font-sans text-base font-semibold transition-all",
              allChecked
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {submitting ? "Wird bestätigt…" : "Ich bestätige"}
          </button>
        )}
      </div>
    </motion.section>
  );
}
