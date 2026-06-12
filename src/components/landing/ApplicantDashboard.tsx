import { useState, useEffect, useRef } from "react";
import { PRODUCT } from '@/config/product';
import { motion, useInView } from "framer-motion";
import {
  Check, Clock, ArrowRight, AlertTriangle, Lock, MessageCircle,
  Calendar, RefreshCw, DollarSign, ChevronRight, Info, User, Briefcase,
  Shield, Sparkles, Target, Loader2,
} from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import SlotPicker from "@/components/booking/SlotPicker";
import AiSetterChat from "@/components/landing/AiSetterChat";

interface ApplicantStatus {
  stage: string;
  name: string;
  email: string;
  score?: { total_score: number; player_type: string } | null;
  leadId?: string;
}

interface QuizData {
  final_segment: string;
  commitment_level: string | null;
  primary_pain: string | null;
  desired_outcome: string | null;
  quiz_score: number | null;
  funnel_source: string;
}

// Scroll-triggered fade-in wrapper
const ScrollReveal = ({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Segment-specific content
const SEGMENT_CONTENT: Record<string, {
  tag: string;
  color: string;
  heroQuote: string;
  caseStudy: { quote: string; result: string };
  prepQuestions: string[];
}> = {
  lifestyle: {
    tag: "Lifestyle",
    color: "text-funnel-teal",
    heroQuote: "Du willst nicht reich werden. Du willst frei sein.",
    caseStudy: { quote: "Ich arbeite jetzt aus Portugal", result: "3 Monate nach Start: ortsunabhängig, €4.200/Monat" },
    prepQuestions: [
      "Warum bist du hier?",
      "Was willst du wirklich?",
      "Was hält dich zurück?",
    ],
  },
  income: {
    tag: "Income",
    color: "text-funnel-red",
    heroQuote: "Dir fehlt kein Einsatz. Dir fehlt ein System, das Einkommen erzeugt.",
    caseStudy: { quote: "In 9 Wochen erstes Einkommen", result: "Strukturiertes Training, echte Deals ab Woche 9" },
    prepQuestions: [
      "Warum bist du hier?",
      "Was willst du wirklich?",
      "Was bist du bereit zu tun?",
    ],
  },
  identity: {
    tag: "Identity",
    color: "text-funnel-purple",
    heroQuote: "Du denkst bereits anders. Jetzt zeigt sich, ob du handelst.",
    caseStudy: { quote: "Mein Leben hat sich komplett verändert", result: "Vom Skill zum System — Entscheidungsfähigkeit als Hebel" },
    prepQuestions: [
      "Warum bist du hier?",
      "Was unterscheidet dich?",
      "Bist du bereit, Verantwortung zu übernehmen?",
    ],
  },
};

/* ─── Career Path Levels with Earnings ─── */
const CAREER_LEVELS = [
  { level: 0, label: "Bewerber", sublabel: "Applicant", earnings: null, active: false, current: true, micro: null },
  { level: 1, label: "Trainee (Opener)", sublabel: "L1", earnings: "€0 – €500", active: false, current: false, micro: "Einstieg + erste Einnahmen möglich" },
  { level: 2, label: "Associate Setter", sublabel: "L2", earnings: "€500 – €1.500", active: false, current: false, micro: "Planbare Einnahmen durch Terminsetzung" },
  { level: 3, label: "Senior Setter", sublabel: "L3", earnings: "€1.500 – €3.000", active: false, current: false, micro: "Höheres Volumen + zusätzliche Einnahmemöglichkeiten" },
  { level: 4, label: "Closer", sublabel: "L4", earnings: "€3.000 – €10.000", active: false, current: false, highlight: true, micro: "Abschlussstufe – bereit für erste High-Ticket-Provisionen", description: "Nach deiner Ausbildung übernimmst du Sales-Gespräche für hochpreisige Angebote.\n\nAls Placed Closer: €5.000 – €20.000+ / Monat" },
];

const ApplicantDashboard = ({ status }: { status: ApplicantStatus }) => {
  const { tx } = useLanguage();
  const { toast } = useToast();
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [setterProfile, setSetterProfile] = useState<{ full_name: string; avatar_url?: string } | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [appointmentData, setAppointmentData] = useState<{ id: string; call_type: string; starts_at: string } | null>(null);
  const [rescheduleSlotId, setRescheduleSlotId] = useState<string | null>(null);
  const [rescheduleSlotTime, setRescheduleSlotTime] = useState<string | null>(null);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleComplete, setRescheduleComplete] = useState(false);
  const [resolvedLeadId, setResolvedLeadId] = useState<string | null>(status.leadId || null);

  // Resolve leadId from email if not provided
  useEffect(() => {
    if (resolvedLeadId || !status.email) return;
    supabase
      .from("leads")
      .select("id")
      .eq("email", status.email.toLowerCase().trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setResolvedLeadId(data.id);
      });
  }, [status.email, resolvedLeadId]);

  useEffect(() => {
    if (!resolvedLeadId) return;
    supabase
      .from("quiz_submissions")
      .select("final_segment, commitment_level, primary_pain, desired_outcome, quiz_score, funnel_source")
      .eq("lead_id", resolvedLeadId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setQuizData(data as any);
      });
  }, [resolvedLeadId]);

  // Try to load assigned setter
  useEffect(() => {
    if (!resolvedLeadId) return;
    supabase
      .from("leads")
      .select("setter_id")
      .eq("id", resolvedLeadId)
      .maybeSingle()
      .then(({ data }) => {
        const setterId = (data as any)?.setter_id;
        if (setterId) {
          supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", setterId)
            .maybeSingle()
            .then(({ data: p }) => {
              if (p) setSetterProfile(p as any);
            });
        }
      });
  }, [resolvedLeadId]);

  // Load current appointment for reschedule.
  // Show only real bookings — never pending_payment or expired.
  useEffect(() => {
    if (!resolvedLeadId) return;
    supabase
      .from("appointments")
      .select("id, call_type, starts_at, appointment_status, payment_status")
      .eq("lead_id", resolvedLeadId)
      .in("appointment_status", ["booked", "confirmed"])
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAppointmentData(data as any);
      });
  }, [resolvedLeadId]);

  const handleRescheduleConfirm = async () => {
    if (!rescheduleSlotId || !status.email || rescheduleSubmitting) return;
    setRescheduleSubmitting(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const callType = (appointmentData?.call_type as "standard" | "priority") || "standard";
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/create-appointment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: status.email.trim().toLowerCase(),
            slot_id: rescheduleSlotId,
            call_type: callType,
            funnel_source: "member_reschedule",
            reschedule: true,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast({
          title: "Verschiebung fehlgeschlagen",
          description: result.error || "Bitte versuche es erneut.",
          variant: "destructive",
        });
      } else {
        setRescheduleComplete(true);
        setAppointmentData({ id: result.appointment_id, call_type: callType, starts_at: result.starts_at });
        toast({
          title: "Termin verschoben",
          description: "Dein neuer Termin wurde gespeichert. Du erhältst eine Bestätigung per E-Mail.",
        });
      }
    } catch {
      toast({ title: "Fehler", description: "Bitte versuche es erneut.", variant: "destructive" });
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  const segment = quizData?.final_segment || "lifestyle";
  const segmentContent = SEGMENT_CONTENT[segment] || SEGMENT_CONTENT.lifestyle;

  const stages = [
    { key: "started", label: "Bewerbung gestartet", done: true },
    { key: "booked", label: "Termin gebucht", done: true },
    { key: "pending", label: "Strategiegespräch ausstehend", done: false },
  ];

  const firstName = status.name?.split(" ")[0] || "";

  return (
    <div className="mx-auto max-w-2xl space-y-0">

      {/* ─── HEADER ─── */}
      <ScrollReveal>
        <div className="pb-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/8 px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-accent">
                Bewerbung aktiv
              </span>
            </span>
            <span className="font-sans text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              L0
            </span>
          </div>
        </div>
      </ScrollReveal>

      {/* ─── HERO ─── */}
      <ScrollReveal delay={0.05}>
        <div className="pb-10">
          <h1 className="font-serif text-[28px] md:text-[36px] font-semibold leading-[1.15] text-foreground mb-3">
            Bereite dich auf dein Strategiegespräch vor.
          </h1>
          <p className="font-sans text-base text-muted-foreground leading-relaxed">
            Die meisten kommen nicht hierher.
            <br />
            <span className="text-foreground font-medium">Du schon.</span>
          </p>
        </div>
      </ScrollReveal>

      {/* ─── SECTION 1 — STATUS ─── */}
      <ScrollReveal delay={0.1}>
        <div className="rounded-xl border border-border/40 bg-card p-6 mb-8">
          <div className="space-y-4">
            {stages.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  s.done
                    ? "bg-primary text-primary-foreground"
                    : "border-2 border-accent/40 bg-accent/5"
                }`}>
                  {s.done ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3 w-3 text-accent" />}
                </div>
                <span className={`font-sans text-sm ${s.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* ─── SETTER PROFILE (if assigned) ─── */}
      {setterProfile && (
        <ScrollReveal delay={0.11}>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 mb-8">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-primary mb-3">
              Dein Ansprechpartner
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-sans text-sm font-semibold text-foreground">{setterProfile.full_name}</p>
                <p className="font-sans text-xs text-muted-foreground">Wird dein Gespräch führen</p>
              </div>
              <a
                href="/members/community"
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Nachricht
              </a>
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ─── AI SETTER CHAT (Pre-Call Qualification) ─── */}
      <ScrollReveal delay={0.13}>
        <div className="mb-8">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">
            Vorbereitung (empfohlen)
          </p>
          <AiSetterChat leadId={resolvedLeadId || undefined} />
        </div>
      </ScrollReveal>

      {/* ─── CAREER PATH WITH EARNINGS ─── */}
      <ScrollReveal delay={0.12}>
        <div className="pb-8">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="font-serif text-xl font-semibold text-foreground">
              Dein Karriereweg
            </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-xs">
                Einkommensangaben sind realistische Monatsbereiche basierend auf aktiven Mitgliedern. Individuelle Ergebnisse variieren je nach Einsatz und Markt.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="font-sans text-[13px] text-muted-foreground leading-relaxed mb-2">
            Du siehst immer: woher du kommst, wo du stehst und was für den nächsten Schritt erforderlich ist.
          </p>
          <div className="flex items-start gap-2.5 rounded-lg bg-accent/[0.06] border border-accent/15 px-4 py-3 mb-5">
            <Sparkles className="h-4 w-4 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="font-sans text-[13px] font-semibold text-foreground">💡 Einkommen ab Tag 1 möglich</p>
              <p className="font-sans text-[12px] text-muted-foreground leading-relaxed mt-1">
                In jeder Stufe dieses Karrierepfads kannst du bereits Geld verdienen — parallel zu deinem Fortschritt.
                <br />
                Dein Einkommen wächst mit deinen Fähigkeiten — nicht erst am Ende.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            {CAREER_LEVELS.map((lvl) => {
              const isCurrent = lvl.level === 0;
              const isNext = lvl.level === 1;
              const isHighlight = (lvl as any).highlight;
              const isFuture = !isCurrent && !isNext;

              return (
                <div key={lvl.level}>
                  <div
                    className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all ${
                      isCurrent
                        ? 'border border-accent/30 bg-accent/8'
                        : isNext
                        ? 'border border-primary/20 bg-primary/5'
                        : isHighlight
                        ? 'border border-primary/30 bg-primary/5'
                        : 'border border-transparent opacity-60'
                    }`}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      isCurrent ? 'bg-accent/15 text-accent' :
                      isNext ? 'bg-primary/10 text-primary' :
                      isHighlight ? 'bg-primary/15 text-primary' :
                      'bg-muted/50 text-muted-foreground'
                    }`}>
                      {isHighlight ? <Briefcase className="h-3.5 w-3.5" /> : `L${lvl.level}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-sans text-[13px] font-medium ${
                          isCurrent || isNext || isHighlight ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {lvl.label}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-accent">
                            Du bist hier
                          </span>
                        )}
                        {isNext && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary">
                            Nächster Schritt
                          </span>
                        )}
                        {isHighlight && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary">
                            Dein Ziel
                          </span>
                        )}
                      </div>
                      {/* Micro-copy under title */}
                      {lvl.micro && (
                        <p className="font-sans text-[11px] text-muted-foreground/70 mt-0.5 leading-snug">
                          {lvl.micro}
                        </p>
                      )}
                    </div>
                    {lvl.earnings && (
                      <span className={`font-mono text-[11px] font-medium shrink-0 ${
                        isCurrent ? 'text-accent' :
                        isNext || isHighlight ? 'text-primary' :
                        'text-muted-foreground/60'
                      }`}>
                        {lvl.earnings}
                      </span>
                    )}
                  </div>
                  {isHighlight && (lvl as any).description && (
                    <div className="ml-10 mt-1.5 mb-1 rounded-lg border border-primary/10 bg-primary/[0.03] px-4 py-3">
                      <p className="font-sans text-[12px] text-muted-foreground leading-relaxed whitespace-pre-line">
                        {(lvl as any).description}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollReveal>

      {/* ─── INTERVIEW CTA after career path ─── */}
      <ScrollReveal delay={0.13}>
        <div className="rounded-xl border border-accent/20 bg-accent/[0.04] p-5 mb-8">
          <p className="font-sans text-sm font-medium text-foreground mb-1">
            Dein nächster Schritt:
          </p>
          <p className="font-sans text-[13px] text-muted-foreground mb-4">
            Prüfe jetzt Datum, Uhrzeit und den Zugangslink deines Strategiegesprächs.
          </p>
          <a
            href="/members/interview"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-sans text-sm font-semibold text-primary-foreground transition-all hover:shadow-md hover:shadow-primary/20 hover:scale-[1.02]"
          >
            Strategiegespräch ansehen
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </ScrollReveal>

      {/* ─── PHILOSOPHY / CONVERSION SECTION ─── */}
      <ScrollReveal delay={0.135}>
        <div className="pb-8">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-5">
            Warum Ethical Top Closer anders ist
          </h2>
          <div className="space-y-5">
            <div className="rounded-xl border border-border/30 bg-card p-5">
              <p className="font-sans text-[15px] text-foreground/85 leading-relaxed mb-3">
                Die meisten lernen Sales-Techniken.
              </p>
              <p className="font-sans text-[15px] font-medium text-foreground leading-relaxed">
                Wir trainieren Entscheidungen.
              </p>
            </div>
            <div className="space-y-3 px-1">
              <div className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="font-sans text-[14px] text-foreground/80">
                  Du wirst nicht für Zeit bezahlt — du wirst für <span className="font-medium text-foreground">Klarheit</span> bezahlt.
                </p>
              </div>
            </div>
            <div className="space-y-3 px-1">
              {[
                { icon: Shield, text: 'Struktur — Frameworks & KPIs' },
                { icon: Target, text: 'Praxis — echte Calls & Training' },
                { icon: Sparkles, text: 'Platzierung — echte Partner' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/8">
                    <item.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="font-sans text-[13px] text-foreground/80">{item.text}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-3">
              <p className="font-sans text-[13px] font-medium text-foreground">
                Das Ziel: Ein stabiler, performancebasierter Einkommensstrom — ohne Druckverkauf.
              </p>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* ─── TRUST / PROOF SIGNALS ─── */}
      <ScrollReveal delay={0.137}>
        <div className="pb-8 space-y-3">
          {[
            { icon: Shield, title: 'Zertifiziertes System', text: 'Jeder Closer wird durch Theorie, Praxis und reale KPIs geprüft.' },
            { icon: Target, title: 'Echte Platzierungen', text: 'Absolventen werden aktiv bei Partnern platziert.' },
            { icon: Sparkles, title: 'Ethisch & transparent', text: 'Kein Druckverkauf. Echte Ergebnisse durch echte Fähigkeiten.' },
          ].map((proof, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/80 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 mt-0.5">
                <proof.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-sans text-[13px] font-semibold text-foreground">{proof.title}</p>
                <p className="font-sans text-[11px] text-muted-foreground leading-relaxed mt-0.5">{proof.text}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>

      {/* ─── SECTION 2 — VORBEREITUNG ─── */}
      <ScrollReveal delay={0.14}>
        <div className="pb-8">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-5">
            So bereitest du dich optimal vor
          </h2>
          <div className="space-y-3">
            {["Sei klar über dein Ziel.", "Sei ehrlich über deine Situation.", "Sei entscheidungsbereit."].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 font-sans text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <span className="font-sans text-[15px] text-foreground/85">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* ─── SECTION 3 — FRAME ─── */}
      <ScrollReveal delay={0.16}>
        <div className="rounded-xl border border-border/40 bg-card p-6 mb-8">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">1</span>
              <p className="font-sans text-sm text-muted-foreground">
                <span className="font-medium text-foreground/60">Normale Closer</span> → versuchen zu überzeugen
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">2</span>
              <p className="font-sans text-sm text-muted-foreground">
                <span className="font-medium text-foreground/60">Top Closer</span> → strukturieren Gespräche
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">✦</span>
              <p className="font-sans text-sm text-foreground font-medium">
                {PRODUCT.name} → schaffen Klarheit
              </p>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* ─── SECTION 4 — VORBEREITUNG FRAGEN ─── */}
      <ScrollReveal delay={0.18}>
        <div className="pb-8">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-5">
            Bereite dich auf diese Fragen vor
          </h2>
          <div className="space-y-4">
            {segmentContent.prepQuestions.map((q, i) => (
              <div key={i} className="rounded-lg border border-border/30 bg-card/60 p-4">
                <p className="font-sans text-[15px] text-foreground/80 italic">
                  „{q}"
                </p>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* ─── SECTION 5 — CASE STUDY ─── */}
      <ScrollReveal delay={0.2}>
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-6 mb-8">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-accent mb-4">
            Echtes Ergebnis
          </p>
          <p className="font-serif text-xl font-semibold text-foreground mb-2">
            „{segmentContent.caseStudy.quote}"
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            {segmentContent.caseStudy.result}
          </p>
        </div>
      </ScrollReveal>

      {/* ─── SECTION 6 — WAS DICH ERWARTET ─── */}
      <ScrollReveal delay={0.22}>
        <div className="pb-8">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-5">
            Was dich erwartet
          </h2>
          <div className="space-y-3">
            {[
              "Ein Skill, der dich unabhängig macht",
              "Echte Gespräche, echtes Einkommen",
              "Professionelle Entwicklung mit System",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="font-sans text-[15px] text-foreground/80">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* ─── SECTION 7 — REMINDER ─── */}
      <ScrollReveal delay={0.24}>
        <div className="rounded-xl border border-border/40 bg-card p-5 mb-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">
              Wenn du nicht erscheinst, endet deine Bewerbung.
              <br />
              <span className="text-foreground/60">Keine zweite Chance.</span>
            </p>
          </div>
        </div>
      </ScrollReveal>

      {/* ─── CTA — Reschedule ─── */}
      <ScrollReveal delay={0.26}>
        <div className="pt-2 pb-8 space-y-3">
          {!showReschedule && !rescheduleComplete && (
            <button
              onClick={() => { setShowReschedule(true); setRescheduleSlotId(null); setRescheduleSlotTime(null); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/40 bg-card px-6 py-3 font-sans text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:border-border/60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Termin verschieben
            </button>
          )}

          {showReschedule && !rescheduleComplete && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border/40 bg-card p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-sans text-sm font-semibold text-foreground">Neuen Termin wählen</h3>
                <button
                  onClick={() => setShowReschedule(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Abbrechen
                </button>
              </div>

              <p className="font-sans text-xs text-muted-foreground">
                Dein bestehender Termin wird automatisch ersetzt. Dein Ansprechpartner bleibt derselbe.
              </p>

              <SlotPicker
                callType={(appointmentData?.call_type as "standard" | "priority") || "standard"}
                onSlotSelected={(slotId, startsAt) => {
                  setRescheduleSlotId(slotId);
                  setRescheduleSlotTime(startsAt);
                }}
                disabled={rescheduleSubmitting}
              />

              {rescheduleSlotId && (
                <button
                  onClick={handleRescheduleConfirm}
                  disabled={rescheduleSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-sans text-sm font-semibold text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50"
                >
                  {rescheduleSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Calendar className="h-4 w-4" />
                      Termin verschieben
                    </>
                  )}
                </button>
              )}
            </motion.div>
          )}

          {rescheduleComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center"
            >
              <Check className="mx-auto h-8 w-8 text-primary mb-2" />
              <p className="font-sans text-sm font-semibold text-foreground">Termin erfolgreich verschoben</p>
              <p className="font-sans text-xs text-muted-foreground mt-1">Du erhältst eine Bestätigung per E-Mail.</p>
            </motion.div>
          )}

          <p className="text-center font-sans text-xs text-muted-foreground">
            Kein Verkaufsgespräch. Ein Klarheitsgespräch.
          </p>
        </div>
      </ScrollReveal>
    </div>
  );
};

export default ApplicantDashboard;
