import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/track-event";
import { toast } from "@/hooks/use-toast";
import { persistLeadVerdict, routeForVerdict, generateBookingToken } from "@/lib/lead-storage";
import { captureCurrentPageAttribution, getCurrentAttributionSessionId, linkCurrentLeadAttribution } from "@/lib/lead-attribution";
import { captureAttributionSource } from "@/lib/attribution-source";
import { validatePhone, getPhoneError } from "@/lib/phone-validation";
import { Checkbox } from "@/components/ui/checkbox";

const situationOptions = [
  "9–5 Job ohne Perspektive",
  "Selbstständig, aber instabil",
  "Auf der Suche nach einem neuen Weg",
  "Bereits im Sales/Closing tätig",
];

const goalOptions = [
  "Ortsunabhängig arbeiten",
  "Stabiles Einkommen aufbauen",
  "Karriere im Ethical Closing",
  "Skalierung & Team aufbauen",
];

const timeOptions = [
  "Vollzeit verfügbar",
  "10–20 Stunden/Woche",
  "5–10 Stunden/Woche",
  "Weniger als 5 Stunden/Woche",
];

type FunnelType = "lifestyle" | "income" | "freiheit";

const ctaStyles: Record<FunnelType, string> = {
  lifestyle: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
  income: "bg-funnel-red text-white hover:bg-funnel-red/90",
  freiheit: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
};

const Apply = () => {
  const [params] = useSearchParams();
  const funnel = (params.get("f") || "lifestyle") as FunnelType;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    vorname: "",
    email: "",
    phone: "",
    situation: "",
    goal: "",
    time: "",
    challenge: "",
  });
  const [microCommitment, setMicroCommitment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    captureCurrentPageAttribution("ApplyLegacy");
    captureAttributionSource(); // first-touch capture of ?source= for downstream booking_source
    trackFunnelEvent("apply_view", { funnel });
  }, [funnel]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.vorname.trim()) newErrors.vorname = "Bitte gib deinen Vornamen ein.";
    if (!form.email.trim()) {
      newErrors.email = "Bitte gib deine E-Mail ein.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = "Bitte gib eine gültige E-Mail ein.";
    }
    const phoneErr = getPhoneError(form.phone);
    if (phoneErr) newErrors.phone = phoneErr;
    if (!form.situation) newErrors.situation = "Bitte wähle eine Option.";
    if (!form.goal) newErrors.goal = "Bitte wähle eine Option.";
    if (!form.time) newErrors.time = "Bitte wähle eine Option.";
    if (!microCommitment) newErrors.commitment = "Bitte bestätige, dass du es ernst meinst.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || submitting) return;
    setSubmitting(true);

    try {
      const phoneResult = validatePhone(form.phone);
      const quizAnswers = {
        situation: form.situation,
        goal: form.goal,
        time: form.time,
        challenge: form.challenge || null,
      };

      trackFunnelEvent("MICRO_COMMITMENT_ACCEPTED", { funnel });
      trackFunnelEvent(phoneResult.phone_valid ? "PHONE_VALIDATED" : "PHONE_REJECTED", {
        funnel,
        phone_valid: phoneResult.phone_valid,
        phone_quality_status: phoneResult.phone_quality_status,
      });

      const { resolveFunnelSource, getCachedTrafficOwner } = await import("@/lib/funnel-source");
      const { data, error } = await supabase.rpc("upsert_funnel_lead", {
        p_name: form.vorname.trim(),
        p_email: form.email.trim(),
        p_phone: phoneResult.phone_normalized || form.phone.trim(),
        p_funnel_source: resolveFunnelSource("apply_direct"),
        p_quiz_answers: quizAnswers,
        p_session_id: getCurrentAttributionSessionId(),
        p_traffic_owner: getCachedTrafficOwner(),
      } as never);

      if (error) {
        console.error("Lead submission error:", error);
        toast({
          title: "Fehler",
          description: "Deine Angaben konnten gerade nicht gespeichert werden. Bitte prüfe deine Eingaben oder versuche es erneut.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      const result = data as { success?: boolean; error?: string } | null;
      if (result?.error) {
        console.error("Lead upsert error:", result.error);
        toast({
          title: "Fehler",
          description: result.error,
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // Mirror the server verdict into localStorage so a re-qualifying user
      // immediately escapes the previous "low" state, and route based on the
      // FRESH server verdict (not stale localStorage / URL).
      const verdict = persistLeadVerdict(data, {
        name: form.vorname,
        email: form.email,
        phone: form.phone,
      });
      await linkCurrentLeadAttribution(verdict.leadId ?? (typeof data === "string" ? data : null), form.email);

      // Generate booking continuation token for the lead
      let tokenParam = "";
      if (verdict.leadId && verdict.qualificationBucket !== "low" && verdict.leadQuality !== "C") {
        const token = await generateBookingToken(verdict.leadId);
        if (token) tokenParam = `?token=${encodeURIComponent(token)}`;
      }

      trackFunnelEvent("application_submit", { funnel, ...form, ...verdict });
      navigate(
        routeForVerdict(verdict, {
          defaultPath: `/terminbuchung${tokenParam ? tokenParam : ""}${tokenParam ? "&" : "?"}f=${funnel}`,
          lowPath: "/quiz/low-result",
        }),
      );
    } catch (err) {
      console.error("Unexpected submission error:", err);
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  const selectClass = "w-full rounded-lg border border-border bg-card px-4 py-3.5 font-sans text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30";
  const inputClass = "w-full rounded-lg border border-border bg-card px-4 py-3.5 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
  const errorClass = "border-destructive focus:ring-destructive/30";

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="font-sans text-xs text-destructive mt-1">{errors[field]}</p> : null;

  return (
    <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark">
      <div className="mx-auto max-w-lg px-6 py-16 md:py-24">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h1 className="font-display text-[28px] md:text-3xl font-semibold leading-[1.15] mb-3">
            Kurze Bewerbung
          </h1>
          <p className="font-sans text-sm text-muted-foreground">
            Damit wir dein Gespräch optimal vorbereiten können.
          </p>
        </motion.div>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="space-y-5"
        >
          <div>
            <label className="block font-sans text-xs font-medium text-muted-foreground mb-1.5">Vorname *</label>
            <input
              type="text"
              required
              maxLength={100}
              className={cn(inputClass, errors.vorname && errorClass)}
              placeholder="Dein Vorname"
              value={form.vorname}
              onChange={(e) => { setForm({ ...form, vorname: e.target.value }); setErrors(prev => ({ ...prev, vorname: "" })); }}
            />
            <FieldError field="vorname" />
          </div>

          <div>
            <label className="block font-sans text-xs font-medium text-muted-foreground mb-1.5">E-Mail *</label>
            <input
              type="email"
              required
              maxLength={255}
              className={cn(inputClass, errors.email && errorClass)}
              placeholder="deine@email.de"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors(prev => ({ ...prev, email: "" })); }}
            />
            <FieldError field="email" />
          </div>

          <div>
            <label className="block font-sans text-xs font-medium text-muted-foreground mb-1.5">
              Telefon *
            </label>
            <input
              type="tel"
              required
              maxLength={30}
              className={cn(inputClass, errors.phone && errorClass)}
              placeholder="+49 170 1234567"
              value={form.phone}
              onChange={(e) => { setForm({ ...form, phone: e.target.value }); setErrors(prev => ({ ...prev, phone: "" })); }}
            />
            <FieldError field="phone" />
          </div>

          {/* Micro-commitment gate */}
          <div className="rounded-sm border border-border/60 bg-card/50 p-4">
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
            <FieldError field="commitment" />
          </div>

          <div>
            <label className="block font-sans text-xs font-medium text-muted-foreground mb-1.5">Aktuelle Situation *</label>
            <select
              required
              className={cn(selectClass, errors.situation && errorClass)}
              value={form.situation}
              onChange={(e) => { setForm({ ...form, situation: e.target.value }); setErrors(prev => ({ ...prev, situation: "" })); }}
            >
              <option value="" disabled>Bitte wählen</option>
              {situationOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <FieldError field="situation" />
          </div>

          <div>
            <label className="block font-sans text-xs font-medium text-muted-foreground mb-1.5">Ziel *</label>
            <select
              required
              className={cn(selectClass, errors.goal && errorClass)}
              value={form.goal}
              onChange={(e) => { setForm({ ...form, goal: e.target.value }); setErrors(prev => ({ ...prev, goal: "" })); }}
            >
              <option value="" disabled>Bitte wählen</option>
              {goalOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <FieldError field="goal" />
          </div>

          <div>
            <label className="block font-sans text-xs font-medium text-muted-foreground mb-1.5">Zeit pro Woche *</label>
            <select
              required
              className={cn(selectClass, errors.time && errorClass)}
              value={form.time}
              onChange={(e) => { setForm({ ...form, time: e.target.value }); setErrors(prev => ({ ...prev, time: "" })); }}
            >
              <option value="" disabled>Bitte wählen</option>
              {timeOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <FieldError field="time" />
          </div>

          <div>
            <label className="block font-sans text-xs font-medium text-muted-foreground mb-1.5">
              Größte Herausforderung <span className="opacity-50">(optional)</span>
            </label>
            <textarea
              maxLength={500}
              rows={3}
              className={cn(inputClass, "resize-none")}
              placeholder="Was ist aktuell deine größte Herausforderung?"
              value={form.challenge}
              onChange={(e) => setForm({ ...form, challenge: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-lg px-8 py-4 font-sans font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
              ctaStyles[funnel]
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gesendet…
              </>
            ) : (
              <>
                Termin sichern
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </motion.form>

        <div className="flex items-center justify-center gap-2 opacity-50 mt-6">
          <Shield className="h-3.5 w-3.5" />
          <span className="font-sans text-xs tracking-wide">
            Keine Verpflichtung • Kein Druck • 100% vertraulich
          </span>
        </div>

      </div>
      <FunnelFooter />
    </div>
  );
};

export default Apply;
