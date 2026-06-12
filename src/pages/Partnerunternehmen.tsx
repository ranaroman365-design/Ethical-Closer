import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, AlertTriangle, Target, Users, BarChart3, Shield } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/track-event";
import { PRODUCT } from "@/config/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import PartnerFooter from "@/components/partners/PartnerFooter";

const fade = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

const partnerLeadSchema = z.object({
  full_name: z.string().trim().min(2, "Name erforderlich").max(120),
  company_name: z.string().trim().min(2, "Firmenname erforderlich").max(160),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  email: z.string().trim().email("Gültige E-Mail erforderlich").max(255),
  phone: z.string().trim().min(4, "Telefon erforderlich").max(40),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  monthly_leads: z.string().trim().max(20).optional().or(z.literal("")),
  monthly_booked_calls: z.string().trim().max(20).optional().or(z.literal("")),
  avg_offer_price: z.string().trim().max(20).optional().or(z.literal("")),
  current_close_rate: z.string().trim().max(20).optional().or(z.literal("")),
  need: z.enum(["setter", "closer", "both"]).optional(),
  preferred_model: z.enum(["revenue_share", "commission", "hybrid", "open"]).optional(),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormState = {
  full_name: string;
  company_name: string;
  website: string;
  email: string;
  phone: string;
  industry: string;
  monthly_leads: string;
  monthly_booked_calls: string;
  avg_offer_price: string;
  current_close_rate: string;
  need: "setter" | "closer" | "both" | "";
  preferred_model: "revenue_share" | "commission" | "hybrid" | "open" | "";
  message: string;
};

const INITIAL: FormState = {
  full_name: "",
  company_name: "",
  website: "",
  email: "",
  phone: "",
  industry: "",
  monthly_leads: "",
  monthly_booked_calls: "",
  avg_offer_price: "",
  current_close_rate: "",
  need: "",
  preferred_model: "",
  message: "",
};

const toIntOrNull = (v: string): number | null => {
  if (!v) return null;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

const toNumberOrNull = (v: string): number | null => {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^\d.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const Partnerunternehmen = () => {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = `Partnerunternehmen — ${PRODUCT.nameTM}`;
    const desc = "Geprüfte Setter und Closer aus einem strukturierten Ausbildungssystem – für Anbieter, die mehr aus bestehenden Calls machen wollen.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const scrollToForm = () => {
    document.getElementById("partner-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = partnerLeadSchema.safeParse({
      ...form,
      need: form.need || undefined,
      preferred_model: form.preferred_model || undefined,
    });

    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
      toast.error(first ?? "Bitte überprüfe deine Eingaben.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        full_name: parsed.data.full_name,
        company_name: parsed.data.company_name,
        website: parsed.data.website || null,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone,
        industry: parsed.data.industry || null,
        monthly_leads: toIntOrNull(form.monthly_leads),
        monthly_booked_calls: toIntOrNull(form.monthly_booked_calls),
        avg_offer_price: toNumberOrNull(form.avg_offer_price),
        current_close_rate: toNumberOrNull(form.current_close_rate),
        need: parsed.data.need ?? null,
        preferred_model: parsed.data.preferred_model ?? null,
        message: parsed.data.message || null,
        source: "partnerunternehmen_landingpage",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      };

      const { data: inserted, error } = await supabase
        .from("partner_leads")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      // Fire canonical event
      await trackEvent({
        eventName: "PARTNER_LEAD_CAPTURED",
        category: "lead_ops",
        pagePath: "/partnerunternehmen",
        leadId: inserted?.id,
        metadata: {
          source: "partnerunternehmen_landingpage",
          company: payload.company_name,
          industry: payload.industry,
          need: payload.need,
          preferred_model: payload.preferred_model,
          monthly_leads: payload.monthly_leads,
          monthly_booked_calls: payload.monthly_booked_calls,
          avg_offer_price: payload.avg_offer_price,
        },
      });

      // Admin notification: the PARTNER_LEAD_CAPTURED event in event_logs
      // is the canonical signal — admin dashboards subscribe to it.
      // The row in partner_leads is the source of truth.

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("[partner-lead] submit failed:", err);
      toast.error("Übermittlung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 h-14">
            <span className="font-display text-base tracking-tight text-foreground font-semibold">{PRODUCT.nameTM}</span>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Startseite
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 pt-28 pb-20">
          <motion.div {...fade} className="max-w-xl text-center space-y-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-foreground text-background">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Anfrage erhalten</h1>
            <p className="text-base text-muted-foreground leading-relaxed">
              Danke. Wir prüfen, ob ein Pilot für dein Angebot sinnvoll ist und melden uns mit den nächsten Schritten.
            </p>
            <p className="text-sm text-muted-foreground/70">
              Antwort in der Regel innerhalb von 2 Werktagen.
            </p>
          </motion.div>
        </main>

        <PartnerFooter lang="de" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 h-14">
          <span className="font-display text-base tracking-tight text-foreground font-semibold">{PRODUCT.nameTM}</span>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Startseite
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="pt-28 pb-20 md:pt-40 md:pb-28 px-6">
        <motion.div {...fade} className="max-w-3xl mx-auto text-center space-y-6">
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60">
            Für Anbieter mit bestehenden Leads
          </p>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1]">
            Mehr Umsatz aus bestehenden Calls — ohne neue Fixkosten.
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            {PRODUCT.nameTM} stellt geprüfte Setter und Closer aus einem strukturierten Ausbildungssystem bereit — für Anbieter, die mehr aus ihren bestehenden Leads machen wollen.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button size="lg" onClick={scrollToForm} className="font-medium">
              Partnergespräch anfragen
            </Button>
            <Button size="lg" variant="outline" onClick={scrollToForm} className="font-medium">
              Pilot prüfen lassen
            </Button>
          </div>
        </motion.div>
      </section>

      {/* PROBLEM */}
      <section className="py-16 md:py-20 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fade} className="text-center mb-12 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60">Problem</p>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
              Leads sind da. Umsatz nicht.
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              "Leads existieren, aber Vertriebskapazität fehlt.",
              "Follow-up läuft inkonsistent oder gar nicht.",
              "Calls werden vergeudet, weil Setter und Closer überlastet sind.",
              "Closer sind schwer zu finden, schwer zu trainieren, schwer zu halten.",
              "Umsatz geht verloren, bevor er überhaupt messbar wird.",
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 + i * 0.06 }}
                className="flex items-start gap-3 border border-border rounded-md p-4 bg-card"
              >
                <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground leading-relaxed">{item}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SOLUTION */}
      <section className="py-16 md:py-20 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fade} className="text-center mb-12 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60">Lösung</p>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
              Vertriebskapazität, die innerhalb des Systems geprüft wurde.
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: Users, title: "Trainierte Setter & Closer", desc: "Kandidaten durchlaufen ein strukturiertes Ausbildungs- und Bewertungssystem." },
              { icon: BarChart3, title: "KPI-basierte Einsatzbereitschaft", desc: "Show-Rate, Close-Rate und Konsistenz werden vor jedem Einsatz gemessen." },
              { icon: Target, title: "Strukturierter Vertriebsprozess", desc: "Klare Phasen — von Erstkontakt bis Abschluss — mit dokumentierten Skripten." },
              { icon: Shield, title: "Ethischer Vertriebsstandard", desc: "Kein Druckverkauf. Keine falschen Versprechen. Keine Reputationsrisiken." },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 + i * 0.06 }}
                className="border border-border rounded-md p-5 bg-card space-y-2"
              >
                <Icon className="w-5 h-5 text-foreground" />
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW THE PILOT WORKS */}
      <section className="py-16 md:py-20 px-6 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <motion.div {...fade} className="text-center mb-12 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60">Ablauf</p>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
              So läuft der Pilot.
            </h2>
            <p className="text-sm text-muted-foreground">Performance-orientiert. Ohne lange Vertragsbindung.</p>
          </motion.div>
          <ol className="space-y-4">
            {[
              "Wir prüfen dein Angebot, deine Leads und deinen Vertriebsprozess.",
              "Wir matchen einen passenden Setter oder Closer aus dem System.",
              "Wir starten einen kontrollierten Pilot über 7–14 Tage.",
              "Wir messen Show-Rate, Close-Rate, Umsatz und Fit.",
              "Skalierung erfolgt nur, wenn die Ökonomie für beide Seiten funktioniert.",
            ].map((step, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.05 + i * 0.06 }}
                className="flex items-start gap-4 border border-border rounded-md p-5 bg-card"
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background text-xs font-semibold shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm text-foreground leading-relaxed pt-1">{step}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* WHO IT IS FOR */}
      <section className="py-16 md:py-20 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fade} className="text-center mb-12 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60">Zielgruppe</p>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
              Für wen das relevant ist.
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              "High-Ticket-Coaches",
              "Agenturen mit Inbound-Calls",
              "Bildungsanbieter & Akademien",
              "Beratungsunternehmen",
              "Service-Anbieter mit gebuchten Calls",
              "Geprüfte Real-Estate- und Finanz-Angebote (compliance-konform)",
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.04 + i * 0.05 }}
                className="border border-border rounded-md p-4 bg-card"
              >
                <p className="text-sm text-foreground">{item}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFFERENTIATION */}
      <section className="py-16 md:py-20 px-6 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <motion.div {...fade} className="text-center mb-12 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60">Unterschied</p>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
              Was {PRODUCT.nameTM} anders macht.
            </h2>
          </motion.div>
          <div className="space-y-3">
            {[
              { no: "Keine zufälligen Freelancer", yes: "Kandidaten werden im System trainiert und gemessen." },
              { no: "Keine Recruiting-Agentur", yes: "Wir liefern aktive Vertriebsleistung, kein Lebenslauf-Match." },
              { no: "Kein reines Sales-Training", yes: "Performance ist messbar — pro Call, pro Woche, pro Kandidat." },
              { no: "Keine Black-Box", yes: "Call-Qualität, Konsistenz und Fortschritt sind nachvollziehbar." },
              { no: "Kein Druckverkauf", yes: "Strukturierter, ethischer Vertriebsstandard ist Voraussetzung, nicht Option." },
            ].map((row, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.04 + i * 0.05 }}
                className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-3 border border-border rounded-md p-4 bg-card"
              >
                <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/40">{row.no}</p>
                <span className="text-muted-foreground/40 text-xs hidden sm:block">→</span>
                <p className="text-sm text-foreground">{row.yes}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FORM */}
      <section id="partner-form" className="py-20 md:py-28 px-6 border-t border-border/40 bg-muted/20">
        <div className="max-w-2xl mx-auto">
          <motion.div {...fade} className="text-center mb-10 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60">Anfrage</p>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
              Partnergespräch anfragen
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Wir prüfen jede Anfrage manuell. Nur passende Anbieter werden zum Pilot eingeladen.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-5 border border-border rounded-md p-6 md:p-8 bg-card">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name" className="text-xs">Name *</Label>
                <Input id="full_name" required value={form.full_name} onChange={(e) => update("full_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company_name" className="text-xs">Firma *</Label>
                <Input id="company_name" required value={form.company_name} onChange={(e) => update("company_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">E-Mail *</Label>
                <Input id="email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">Telefon *</Label>
                <Input id="phone" type="tel" required value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="website" className="text-xs">Website</Label>
                <Input id="website" placeholder="https://" value={form.website} onChange={(e) => update("website", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="industry" className="text-xs">Branche</Label>
                <Input id="industry" placeholder="z.B. Coaching, Agentur, Bildung" value={form.industry} onChange={(e) => update("industry", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monthly_leads" className="text-xs">Leads / Monat</Label>
                <Input id="monthly_leads" inputMode="numeric" placeholder="z.B. 300" value={form.monthly_leads} onChange={(e) => update("monthly_leads", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monthly_booked_calls" className="text-xs">Gebuchte Calls / Monat</Label>
                <Input id="monthly_booked_calls" inputMode="numeric" placeholder="z.B. 80" value={form.monthly_booked_calls} onChange={(e) => update("monthly_booked_calls", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avg_offer_price" className="text-xs">Ø Angebotspreis (€)</Label>
                <Input id="avg_offer_price" inputMode="decimal" placeholder="z.B. 5000" value={form.avg_offer_price} onChange={(e) => update("avg_offer_price", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current_close_rate" className="text-xs">Aktuelle Close-Rate (%)</Label>
                <Input id="current_close_rate" inputMode="decimal" placeholder="optional" value={form.current_close_rate} onChange={(e) => update("current_close_rate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="need" className="text-xs">Bedarf</Label>
                <select
                  id="need"
                  value={form.need}
                  onChange={(e) => update("need", e.target.value as FormState["need"])}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Bitte wählen</option>
                  <option value="setter">Setter</option>
                  <option value="closer">Closer</option>
                  <option value="both">Beides</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preferred_model" className="text-xs">Bevorzugtes Modell</Label>
                <select
                  id="preferred_model"
                  value={form.preferred_model}
                  onChange={(e) => update("preferred_model", e.target.value as FormState["preferred_model"])}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Bitte wählen</option>
                  <option value="revenue_share">Revenue-Share</option>
                  <option value="commission">Provision</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="open">Offen</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message" className="text-xs">Nachricht</Label>
              <Textarea
                id="message"
                rows={4}
                placeholder="Kurzer Kontext zu deinem Angebot, deinen Leads und was du dir vom Pilot erhoffst."
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
              />
            </div>

            <Button type="submit" size="lg" disabled={submitting} className="w-full font-medium">
              {submitting ? "Wird gesendet…" : "Anfrage senden"}
            </Button>

            <p className="text-[11px] text-muted-foreground/60 text-center">
              Mit dem Absenden stimmst du der Verarbeitung deiner Daten gemäß unserer{" "}
              <Link to="/privacy" className="underline hover:text-foreground">Datenschutzerklärung</Link> zu.
            </p>
          </form>
        </div>
      </section>

      <PartnerFooter lang="de" />
    </div>
  );
};

export default Partnerunternehmen;
