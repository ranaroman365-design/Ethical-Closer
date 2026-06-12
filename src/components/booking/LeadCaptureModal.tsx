import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, User, Phone, Loader2 } from "lucide-react";

export interface LeadCaptureData {
  name: string;
  email: string;
  phone: string;
}

interface LeadCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: LeadCaptureData) => Promise<void>;
  selectedSlotTime?: string | null;
}

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default function LeadCaptureModal({
  open,
  onClose,
  onSubmit,
  selectedSlotTime,
}: LeadCaptureModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-sm border border-[hsl(var(--funnel-sand))] bg-white px-4 py-3.5 font-sans text-sm text-[hsl(var(--funnel-dark,30_10%_12%))] placeholder:text-[hsl(var(--funnel-grey))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--funnel-gold))] transition-all";

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) { setError("Bitte gib deinen Namen ein."); return; }
    if (!email.trim() || !isValidEmail(email.trim())) { setError("Bitte gib eine gültige E-Mail ein."); return; }
    if (!phone.trim()) { setError("Bitte gib deine Telefonnummer ein."); return; }

    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern. Bitte versuche es erneut.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md rounded-2xl bg-[hsl(var(--funnel-warm-bg))] p-6 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-[hsl(var(--funnel-dark,30_10%_12%))]">
                Kontaktdaten eingeben
              </h2>
              <p className="mt-1 font-sans text-sm text-[hsl(var(--funnel-grey))]">
                Damit wir deinen Termin bestätigen können.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-[hsl(var(--funnel-grey))] hover:text-[hsl(var(--funnel-dark,30_10%_12%))] transition-colors"
              aria-label="Schließen"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--funnel-grey))]" />
              <input
                type="text"
                placeholder="Vollständiger Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${inputClass} pl-10`}
                autoFocus
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--funnel-grey))]" />
              <input
                type="email"
                placeholder="E-Mail *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--funnel-grey))]" />
              <input
                type="tel"
                placeholder="Telefon *"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 font-sans text-sm text-destructive">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-5 w-full rounded-xl bg-[hsl(var(--funnel-gold))] py-3.5 font-sans text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gebucht…
              </span>
            ) : (
              "Termin verbindlich buchen"
            )}
          </button>

          <p className="mt-3 text-center font-sans text-xs text-[hsl(var(--funnel-grey))]">
            Deine Daten werden vertraulich behandelt und nur für die Terminvereinbarung verwendet.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
