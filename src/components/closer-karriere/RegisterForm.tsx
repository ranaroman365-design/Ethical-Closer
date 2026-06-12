/**
 * Phase 10.1 — Closer-Karriere Lead Capture Form
 *
 * Reuses the existing `upsert_funnel_lead` RPC (same pattern as
 * /high-income-skill quiz) so this hooks straight into the existing
 * lead pool, scoring, attribution and CRM sync. No new tables.
 *
 * Sticky AB slot: mos_register_form_cta (Thompson Sampling).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, User, Mail, Phone, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAbSlot } from "@/hooks/useAbSlot";
import { trackFunnelEvent } from "@/lib/track-event";
import { persistLeadVerdict } from "@/lib/lead-storage";
import {
  getCurrentAttributionSessionId,
  linkCurrentLeadAttribution,
} from "@/lib/lead-attribution";
import { getCachedTrafficOwner } from "@/lib/funnel-source";

const FORM_CTA_SLOT = {
  slot: "mos_register_form_cta",
  variants: [
    { id: "control" },
    { id: "A_zugang" },
    { id: "B_pruefen" },
    { id: "C_platz" },
  ],
} as const;

const FORM_CTA_COPY: Record<string, string> = {
  control: "Kostenlos registrieren",
  A_zugang: "Zugang sichern",
  B_pruefen: "Karriereweg prüfen",
  C_platz: "Kostenlosen Platz sichern",
};

const FUNNEL = "closer_karriere_register";
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v: string) => /^[\d\s+\-().]{6,20}$/.test(v);

interface Props {
  id: string;
  variant?: "light" | "dark";
  position: "inline" | "final";
  eyebrow?: string;
  headline?: string;
  subline?: string;
}

const SESSION_DEDUP_KEY = "closer_karriere_lead_submitted";

export default function RegisterForm({
  id,
  variant = "light",
  position,
  eyebrow = "Registrierung",
  headline = "Sichere dir deinen kostenlosen Zugang.",
  subline = "Name, E-Mail, WhatsApp — und du erhältst den nächsten Schritt sofort.",
}: Props) {
  const navigate = useNavigate();
  const ctaSlot = useAbSlot(FORM_CTA_SLOT);
  const ctaLabel = FORM_CTA_COPY[ctaSlot.variant] ?? FORM_CTA_COPY.control;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const viewFiredRef = useRef(false);
  useEffect(() => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    trackFunnelEvent("closer_karriere_form_view", {
      funnel: FUNNEL,
      position,
      ab_form_cta: ctaSlot.variant,
    });
  }, [position, ctaSlot.variant]);

  const isDark = variant === "dark";
  const inputClass = useMemo(
    () =>
      `w-full rounded-xl border px-4 py-3.5 pl-10 text-[15px] outline-none transition-colors ${
        isDark
          ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-accent focus:bg-white/15"
          : "border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-accent"
      }`,
    [isDark],
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name ist erforderlich.";
    if (!email.trim()) e.email = "E-Mail ist erforderlich.";
    else if (!isEmail(email.trim())) e.email = "Bitte gib eine gültige E-Mail ein.";
    if (!phone.trim()) e.phone = "WhatsApp-Nummer ist erforderlich.";
    else if (!isPhone(phone.trim())) e.phone = "Bitte gib eine gültige Nummer ein.";
    if (!consent) e.consent = "Bitte bestätige den Hinweis.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    // Session-level dedup: same browser session → same email/phone shouldn't
    // create a duplicate lead. The RPC is idempotent on email anyway, but we
    // also avoid double-firing the analytics event.
    const dedupKey = `${email.trim().toLowerCase()}|${phone.trim()}`;
    const lastDedup = sessionStorage.getItem(SESSION_DEDUP_KEY);
    const alreadySubmitted = lastDedup === dedupKey;

    setSubmitting(true);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    try {
      const { data, error } = await supabase.rpc("upsert_funnel_lead", {
        p_name: trimmedName,
        p_email: trimmedEmail,
        p_phone: trimmedPhone,
        p_funnel_source: "closer_karriere",
        p_quiz_answers: {},
        p_session_id: getCurrentAttributionSessionId(),
        p_traffic_owner: getCachedTrafficOwner(),
      } as never);

      if (error) console.warn("[closer-karriere] lead upsert error:", error);

      const verdict = persistLeadVerdict(data, {
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
      });
      const leadId = verdict.leadId;

      if (leadId) {
        await supabase
          .from("leads")
          .update({
            source: "closer_karriere",
            source_funnel: "closer_karriere",
            stage: "registered",
          })
          .eq("id", leadId);

        await linkCurrentLeadAttribution(leadId, trimmedEmail);

        supabase.functions
          .invoke("score-lead", { body: { lead_id: leadId } })
          .catch(() => {});

        try {
          sessionStorage.setItem("closer_karriere_lead_id", leadId);
        } catch {
          /* ignore */
        }
      }

      sessionStorage.setItem(SESSION_DEDUP_KEY, dedupKey);

      if (!alreadySubmitted) {
        trackFunnelEvent("closer_karriere_form_submit", {
          funnel: FUNNEL,
          position,
          ab_form_cta: ctaSlot.variant,
          has_name: true,
          has_email: true,
          has_phone: true,
          // GDPR: do NOT send raw email/phone into analytics payload
        });
      }

      navigate("/closer-karriere/salesbook-offer");
    } catch (err) {
      console.error("[closer-karriere] submit failed:", err);
      setErrors({ form: "Etwas ist schiefgelaufen. Bitte versuche es erneut." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id={id}
      className={`border-t py-20 md:py-28 ${
        isDark ? "border-white/10 bg-foreground text-background" : "border-border bg-muted/30"
      }`}
    >
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <span
            className={`text-[11px] uppercase tracking-[0.25em] ${
              isDark ? "text-accent" : "text-accent"
            }`}
          >
            {eyebrow}
          </span>
          <h2
            className={`mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl ${
              isDark ? "text-white" : ""
            }`}
          >
            {headline}
          </h2>
          <p
            className={`mt-4 text-base leading-relaxed md:text-lg ${
              isDark ? "text-white/70" : "text-muted-foreground"
            }`}
          >
            {subline}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className={`mx-auto mt-10 max-w-xl rounded-2xl border p-6 md:p-8 ${
            isDark ? "border-white/15 bg-white/5 backdrop-blur" : "border-border bg-card"
          }`}
        >
          <div className="space-y-4">
            <Field
              icon={User}
              isDark={isDark}
              error={errors.name}
              htmlFor="ck-name"
              label="Name"
            >
              <input
                id="ck-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dein Name"
                className={inputClass}
                required
              />
            </Field>

            <Field
              icon={Mail}
              isDark={isDark}
              error={errors.email}
              htmlFor="ck-email"
              label="E-Mail"
            >
              <input
                id="ck-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                className={inputClass}
                required
              />
            </Field>

            <Field
              icon={Phone}
              isDark={isDark}
              error={errors.phone}
              htmlFor="ck-phone"
              label="WhatsApp Nummer"
            >
              <input
                id="ck-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+49 …"
                className={inputClass}
                required
              />
            </Field>
          </div>

          <label
            className={`mt-5 flex cursor-pointer items-start gap-3 text-[12px] leading-relaxed ${
              isDark ? "text-white/65" : "text-muted-foreground"
            }`}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
            />
            <span>
              Mit dem Absenden stimmst du zu, dass wir dich per E-Mail und WhatsApp
              zum nächsten Schritt kontaktieren dürfen. Du kannst dich jederzeit abmelden.
            </span>
          </label>
          {errors.consent && (
            <p className="mt-2 text-[12px] text-destructive">{errors.consent}</p>
          )}
          {errors.form && (
            <p className="mt-2 text-[12px] text-destructive">{errors.form}</p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            className="mt-6 h-14 w-full rounded-xl bg-accent text-base font-medium text-accent-foreground shadow-[0_10px_40px_-10px_hsl(var(--accent)/0.6)] hover:bg-accent/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wird gesendet…
              </>
            ) : (
              <>
                {ctaLabel}
                <ArrowRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </section>
  );
}

function Field({
  icon: Icon,
  isDark,
  error,
  htmlFor,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  isDark: boolean;
  error?: string;
  htmlFor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className={`mb-1.5 block text-[12px] font-medium uppercase tracking-[0.18em] ${
          isDark ? "text-white/70" : "text-muted-foreground"
        }`}
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
            isDark ? "text-white/50" : "text-muted-foreground"
          }`}
        />
        {children}
      </div>
      {error && <p className="mt-1.5 text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
