import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import PublicMemberNavLink from "@/components/landing/PublicMemberNavLink";
import {
  ArrowRight,
  Check,
  X,
  ShieldCheck,
  Sparkles,
  Users,
  Lock,
  TrendingUp,
  Star,
  FileDown,
} from "lucide-react";
import FooterSection from "@/components/landing/FooterSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackFunnelEvent } from "@/lib/track-event";
import { getOrCreateAttributionSessionId } from "@/lib/attribution-session";
import { captureCurrentPageAttribution } from "@/lib/lead-attribution";
import { cn } from "@/lib/utils";

/**
 * /qualify — High-Conversion A/B variant of /apply.
 *
 * Strict spec compliance:
 *  - Selection-gate hero ("Du wirst geprüft")
 *  - Inline micro-commitments BEFORE primary CTA
 *  - 4-step bar
 *  - Selection block (left disqualify / right qualify)
 *  - Mechanism clarity (Earn-While-Learn / echtes Closing / Partnernetzwerk)
 *  - Trust stack (Proof / Process / Authority / Transparency)
 *  - Quiz entry → /apply/quiz (SAME backend RPC, SAME scoring, SAME hard-block)
 *  - Tracking: APPLY_VIEW, SCROLL_25/50/75/90, CTA_CLICK (apply_cta_click),
 *    QUIZ_START fires on quiz mount (not here). LEAD_CAPTURED fires from the
 *    LeadCaptureGate inside the quiz. NO parallel scoring.
 *  - Attribution: capture_lead_attribution RPC with UTM/fbclid/gclid/session_id.
 *  - All canonical events tagged `funnel: "qualify"` so dashboards split cleanly.
 */
const FUNNEL_ID = "qualify";
const QUIZ_PATH = "/apply/quiz";

type IncomeChoice = "<2k" | "2-5k" | "5-10k" | "10k+";
type TimeChoice = "<5h" | "5-10h" | "10-20h" | "20h+";
type ExperienceChoice = "none" | "some" | "advanced";

const INCOME_OPTIONS: { value: IncomeChoice; label: string }[] = [
  { value: "<2k", label: "Unter 2.000 €" },
  { value: "2-5k", label: "2.000 – 5.000 €" },
  { value: "5-10k", label: "5.000 – 10.000 €" },
  { value: "10k+", label: "Mehr als 10.000 €" },
];

const TIME_OPTIONS: { value: TimeChoice; label: string }[] = [
  { value: "<5h", label: "< 5 Std." },
  { value: "5-10h", label: "5 – 10 Std." },
  { value: "10-20h", label: "10 – 20 Std." },
  { value: "20h+", label: "> 20 Std." },
];

const EXPERIENCE_OPTIONS: { value: ExperienceChoice; label: string }[] = [
  { value: "none", label: "Keine" },
  { value: "some", label: "Etwas" },
  { value: "advanced", label: "Fortgeschritten" },
];

const DISQUALIFIERS = [
  "Du suchst eine Abkürzung ohne echte Arbeit.",
  "Du erwartest Provisionen, ohne wirklich zu verkaufen.",
  "Du willst keine echten Verkaufsgespräche führen.",
  "Du erwartest Ergebnisse, ohne dich coachen zu lassen.",
];

const QUALIFIERS = [
  "Du willst eine echte Fähigkeit lernen, kein passives Einkommen.",
  "Du bist bereit, ab Woche 2 echte Calls zu führen.",
  "Du arbeitest lieber mit System als mit Bauchgefühl.",
  "Du willst an Ergebnissen gemessen werden, nicht an Ausreden.",
];

const STEPS = [
  { n: 1, t: "Check", d: "90 Sek. Qualifikations-Quiz." },
  { n: 2, t: "Auswertung", d: "Sofortiges Ergebnis & Score." },
  { n: 3, t: "ggf. Einladung", d: "Slot zum Strategie-Call." },
  { n: 4, t: "ggf. Start", d: "Onboarding & echte Leads." },
];

interface FaqItem {
  id: string;
  tagShort: string;
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  // ─── Ethics ───
  {
    id: "ethics_pressure",
    tagShort: "ETH",
    q: "Ist Closing nicht einfach Druck-Verkauf mit besserem Namen?",
    a: "Nein. Wir trainieren das Ethische Entscheidungs-Gespräch™ — du führst den Interessenten zu einer klaren Ja/Nein-Entscheidung, ohne Manipulation, ohne Verknappungs-Tricks, ohne 'Sie müssen jetzt'. Wer nicht passt, bekommt ein Nein — und das ist Teil der Qualität, nicht ein Verlust.",
  },
  {
    id: "ethics_who",
    tagShort: "ETH",
    q: "Für welche Anbieter darf ich am Ende closen?",
    a: "Nur geprüfte Coaches, Agenturen und Bildungsanbieter aus unserem Partnernetzwerk. Wir nehmen keine Crypto-Pump-Programme, keine 'Reich-in-30-Tagen'-Angebote, keine MLM-Strukturen. Wenn ein Angebot ethisch fragwürdig ist, ist es draußen — auch wenn die Provision attraktiv wäre.",
  },

  // ─── Time / Expectations ───
  {
    id: "time_weekly",
    tagShort: "ZEIT",
    q: "Wie viel Zeit muss ich realistisch investieren?",
    a: "10–15 Stunden pro Woche in den ersten 4 Wochen — Theorie, Aufnahmen-Reviews und Live-Trainings. Ab Woche 5, wenn du auf echten Leads arbeitest, kommen Calls dazu (du bestimmst die Anzahl selbst). Wer weniger als 8 Std./Woche investieren kann, sollte nicht starten — das System funktioniert dann nicht.",
  },
  {
    id: "time_speed",
    tagShort: "ZEIT",
    q: "Wann sehe ich realistisch Ergebnisse?",
    a: "Erste echte Calls ab Woche 2–3. Erste Provisionen typischerweise zwischen Woche 4 und 8 — abhängig von deiner Show-Up-Rate, Trainings-Disziplin und welche Leads du übernimmst. Wir zeigen offen die Verteilung über alle bisherigen Absolventen, keine geschönten Einzelfälle.",
  },
  {
    id: "time_job",
    tagShort: "ZEIT",
    q: "Funktioniert das neben einem 9–17-Job?",
    a: "Ja, wenn du abends oder am Wochenende 2–3 feste Slots blockst. Calls finden meist nachmittags und abends statt, das passt für die meisten. Was nicht funktioniert: 'mal schauen, wann Zeit ist'. Wir planen mit dir feste Trainings- und Call-Slots im Kalender.",
  },

  // ─── Rejection / What if ───
  {
    id: "reject_what_happens",
    tagShort: "PASS",
    q: "Was passiert, wenn ich nicht qualifiziert werde?",
    a: "Du bekommst sofort eine ehrliche Auswertung mit konkretem Grund — z.B. 'noch zu wenig Zeit', 'Ziel passt nicht zum Modell' oder 'erst Erfahrung im Vertrieb sammeln'. Kein Strategie-Call, keine Mail-Sequenz, keine Verkaufs-Funnels. Wir verschwenden weder deine Zeit noch unsere.",
  },
  {
    id: "reject_retry",
    tagShort: "PASS",
    q: "Kann ich es später nochmal versuchen?",
    a: "Ja. Wenn sich deine Situation verändert (mehr Zeit, klareres Ziel, erste Vertriebs-Erfahrung), kannst du dich nach 60 Tagen erneut prüfen lassen. Manche Bewerber starten beim zweiten Versuch — das ist normal und kein Makel.",
  },
  {
    id: "reject_data",
    tagShort: "PASS",
    q: "Was passiert mit meinen Daten, wenn ich nicht passe?",
    a: "Deine Quiz-Antworten werden anonymisiert für die Modell-Verbesserung gespeichert, persönliche Daten (Name, E-Mail, Telefon) löschen wir auf Wunsch sofort über privacy@ethicalcloser.de. Standard-Aufbewahrung: 6 Monate, falls du dich später erneut prüfen lässt.",
  },
];

const QualifyLanding = () => {
  const [income, setIncome] = useState<IncomeChoice | null>(null);
  const [timeAvail, setTimeAvail] = useState<TimeChoice | null>(null);
  const [experience, setExperience] = useState<ExperienceChoice | null>(null);

  const microReady = income !== null && timeAvail !== null;

  // ─── Disqualified-recap: shown only if user previously hit hard-block or
  // soft low-bucket on /apply/quiz. Source = lead-storage localStorage keys.
  // Renders an honest, non-shaming explanation of WHY they were filtered,
  // tied 1:1 to the canonical scoring rules in src/lib/apply-qualification.ts.
  type DqReason = "hard_block_real_calls" | "low_score";
  const [dq, setDq] = useState<{ reason: DqReason; score: number | null } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const hardBlocked = localStorage.getItem("qualification_hard_blocked") === "1";
      const bucket = localStorage.getItem("qualification_bucket");
      const rawScore = localStorage.getItem("quiz_score");
      const score = rawScore ? Number(rawScore) : null;
      const next = hardBlocked
        ? { reason: "hard_block_real_calls" as const, score }
        : bucket === "low"
        ? { reason: "low_score" as const, score }
        : null;
      if (next) {
        setDq(next);
        trackFunnelEvent("apply_dq_recap_view", {
          funnel: FUNNEL_ID,
          reason: next.reason,
          quiz_score: score,
        });
      }
    } catch { /* private mode — non-fatal */ }
  }, []);

  const ctaHref = useMemo(() => {
    const params = new URLSearchParams({ src: FUNNEL_ID });
    if (income) params.set("income", income);
    if (timeAvail) params.set("time", timeAvail);
    if (experience) params.set("experience", experience);
    return `${QUIZ_PATH}?${params.toString()}`;
  }, [income, timeAvail, experience]);

  // ─── APPLY_VIEW (once per pageview) ───
  // NOTE: micro-commitment funnel-tags (income/time/experience) are NOT yet
  // selected on first paint. We re-fire once they become "ready" so downstream
  // joins on apply_view ↔ quiz_started ↔ lead_captured share identical tags.
  const viewFiredRef = useRef(false);
  useEffect(() => {
    if (viewFiredRef.current) return;
    viewFiredRef.current = true;
    const sessionId = getOrCreateAttributionSessionId();
    trackFunnelEvent("apply_view", {
      funnel: FUNNEL_ID,
      page_path: "/qualify",
      session_id: sessionId,
      micro_income: null,
      micro_time: null,
      micro_experience: null,
      micro_locked: true,
    });
  }, []);

  // ─── APPLY_VIEW enrichment — fires once when the gate unlocks ───
  const viewReadyFiredRef = useRef(false);
  useEffect(() => {
    if (viewReadyFiredRef.current) return;
    if (!microReady) return;
    viewReadyFiredRef.current = true;
    const sessionId = getOrCreateAttributionSessionId();
    trackFunnelEvent("apply_view", {
      funnel: FUNNEL_ID,
      page_path: "/qualify",
      session_id: sessionId,
      micro_income: income,
      micro_time: timeAvail,
      micro_experience: experience,
      micro_locked: false,
      enrichment: "micro_ready",
    });
  }, [microReady, income, timeAvail, experience]);

  // ─── First-touch attribution (once per session) ───
  useEffect(() => {
    if (typeof window === "undefined") return;
    captureCurrentPageAttribution("QualifyLanding");
  }, []);

  // ─── SCROLL_25/50/75/90 (rAF-throttled) + sticky CTA visibility ───
  const scrollFiredRef = useRef({ s25: false, s50: false, s75: false, s90: false });
  const [stickyVisible, setStickyVisible] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafQueued = false;
    const onScroll = () => {
      if (rafQueued) return;
      rafQueued = true;
      requestAnimationFrame(() => {
        rafQueued = false;
        const doc = document.documentElement;
        const max = (doc.scrollHeight - window.innerHeight) || 1;
        const pct = (window.scrollY / max) * 100;
        setStickyVisible(window.scrollY > 600);
        const flags = scrollFiredRef.current;
        const fire = (key: keyof typeof flags, depth: number) => {
          if (flags[key]) return;
          flags[key] = true;
          trackFunnelEvent(`scroll_${depth}`, {
            funnel: FUNNEL_ID,
            page_path: "/qualify",
            depth,
          });
        };
        if (pct >= 25) fire("s25", 25);
        if (pct >= 50) fire("s50", 50);
        if (pct >= 75) fire("s75", 75);
        if (pct >= 90) fire("s90", 90);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const trackCta = (location: string, locked = false) => {
    trackFunnelEvent("apply_cta_click", {
      funnel: FUNNEL_ID,
      location,
      section: location,
      variant: "qualify_default",
      cta_type: "primary",
      micro_locked: locked,
      micro_income: income,
      micro_time: timeAvail,
      micro_experience: experience,
    });
  };

  const onPrimaryClick = (location: string) => (e: React.MouseEvent) => {
    if (!microReady) {
      e.preventDefault();
      trackCta(location, true);
      const el = document.getElementById("micro");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    trackCta(location, false);
    // Let Link handle navigation.
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicMemberNavLink page="qualify" tone="dark" />
      {/* ─── 1. HERO — Decision Gate ─── */}
      <section className="relative overflow-hidden border-b border-border/40 px-4 py-20 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Qualifikations-Check
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Werde zum Closer.
            <br />
            <span className="text-accent">Wenn du geprüft wirst.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            90 Sekunden. 6 Fragen. Sofortige Auswertung — du erfährst direkt,
            ob du in unser Programm passt.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-3 max-w-md text-xs uppercase tracking-[0.16em] text-accent"
          >
            Du wirst geprüft — nicht jeder wird genommen.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8"
          >
            <Link
              to={ctaHref}
              onClick={onPrimaryClick("hero")}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-md px-7 py-3.5 text-sm font-semibold transition-all",
                microReady
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {microReady ? "Qualifikations-Check starten" : "Erst 2 Angaben → unten"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Kein Verkauf. Keine E-Mail nötig, um zu starten.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="h-px w-8 bg-border/60" aria-hidden />
              <span className="uppercase tracking-[0.16em]">oder</span>
              <span className="h-px w-8 bg-border/60" aria-hidden />
            </div>
            <a
              href="/sales-system.pdf"
              target="_blank"
              rel="noopener"
              onClick={() =>
                trackFunnelEvent("apply_cta_click", {
                  funnel: FUNNEL_ID,
                  location: "hero_soft_yes",
                  section: "hero_soft_yes",
                  variant: "qualify_default",
                  cta_type: "soft_yes",
                  asset: "sales_system_pdf",
                })
              }
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <FileDown className="h-4 w-4" />
              Erst lesen: „THE SALES SYSTEM" (PDF, gratis)
            </a>
          </motion.div>
        </div>
      </section>

      {/* ─── 1c. PROOF ROW — above-the-fold credibility ─── */}
      <section
        aria-label="Proof"
        className="border-b border-border/40 bg-card/40 px-4 py-8"
      >
        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
          <ProofStat value="580+" label="zertifizierte Closer" />
          <ProofStat value="42%" label="ø Show-to-Close-Rate" />
          <ProofStat value="9 Wo." label="von L0 → erste Provision" />
        </div>
        <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
            <span className="ml-1">4.8 / 5 (217 Reviews)</span>
          </span>
          <span aria-hidden className="hidden h-3 w-px bg-border/60 sm:block" />
          <span>Aufnahmen anonymisiert prüfbar</span>
          <span aria-hidden className="hidden h-3 w-px bg-border/60 sm:block" />
          <span>Keine Erfolgsgarantie — nur dokumentierte Resultate</span>
        </div>
      </section>

      {/* ─── 1b. DISQUALIFIED RECAP — only if user previously hit hard-block / low ─── */}
      {dq && (
        <section
          aria-label="Warum du beim letzten Check nicht weitergekommen bist"
          className="border-b border-border/40 bg-destructive/5 px-4 py-10"
        >
          <div className="mx-auto max-w-2xl">
            <div className="rounded-lg border border-destructive/30 bg-card p-6 sm:p-7">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-destructive">
                <Lock className="h-3.5 w-3.5" />
                Warum du beim letzten Check rausgefallen bist
              </div>
              <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {dq.reason === "hard_block_real_calls"
                  ? 'Du hast „Nein" bei echten Verkaufsgesprächen gewählt.'
                  : `Dein Quiz-Score lag unter der Schwelle${
                      dq.score !== null ? ` (${dq.score} / 70 für High-Tier)` : ""
                    }.`}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {dq.reason === "hard_block_real_calls" ? (
                  <>
                    Unser Programm basiert ab Woche 2 auf <strong>echten</strong> Calls
                    mit zahlenden Kunden — keine Simulationen, keine Rollenspiele.
                    Wer das nicht mitmacht, verbrennt nur Lead-Slots und blockiert
                    Plätze für Bewerber, die liefern. Das ist kein Urteil über dich,
                    sondern Schutz für beide Seiten.
                  </>
                ) : (
                  <>
                    Wir buchen nur Leads ein, die in mindestens 4 von 6 Dimensionen
                    klar genug sind: <strong>Motivation</strong>, <strong>Ernsthaftigkeit</strong>,{" "}
                    <strong>Bereitschaft für echte Calls</strong>, <strong>Zeit</strong>,{" "}
                    <strong>Erfahrung</strong>, <strong>Einkommens-Ziel</strong>.
                    Das schützt unsere Closer-Kapazität und deine Zeit.
                  </>
                )}
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-2 text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  Du kannst nach 60 Tagen erneut antreten — neue Antworten zählen.
                </li>
                <li className="flex gap-2 text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  In der Zwischenzeit: Buch „THE SALES SYSTEM" (PDF) gibt dir die
                  Grundlage, um beim nächsten Versuch zu bestehen.
                </li>
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Hard-Block-Regel:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">real_calls = "Nein"</code>{" "}
                → automatischer Low-Bucket. Soft-Block:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">score &lt; 40</code>.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ─── 2. MICRO-COMMITMENTS (must come before primary CTA) ─── */}
      <section id="micro" className="border-b border-border/40 bg-muted/20 px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Bevor du startest — 2 Angaben.
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            So sehen wir, ob ein Strategie-Call überhaupt Sinn ergibt.
          </p>

          <div className="mt-8 space-y-6">
            <ChoiceRow
              label="Ziel-Einkommen pro Monat"
              options={INCOME_OPTIONS}
              value={income}
              onChange={(v) => {
                setIncome(v);
                trackFunnelEvent("apply_micro_select", {
                  funnel: FUNNEL_ID,
                  field: "income",
                  value: v,
                });
              }}
            />
            <ChoiceRow
              label="Zeit pro Woche"
              options={TIME_OPTIONS}
              value={timeAvail}
              onChange={(v) => {
                setTimeAvail(v);
                trackFunnelEvent("apply_micro_select", {
                  funnel: FUNNEL_ID,
                  field: "time",
                  value: v,
                });
              }}
            />
            <ChoiceRow
              label="Verkaufs-Erfahrung (optional)"
              options={EXPERIENCE_OPTIONS}
              value={experience}
              onChange={(v) => {
                setExperience(v);
                trackFunnelEvent("apply_micro_select", {
                  funnel: FUNNEL_ID,
                  field: "experience",
                  value: v,
                });
              }}
              optional
            />
          </div>

          <div className="mt-10 text-center">
            <Link
              to={ctaHref}
              onClick={onPrimaryClick("micro")}
              aria-disabled={!microReady}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-md px-7 py-3.5 text-sm font-semibold transition-all",
                microReady
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground/60"
              )}
            >
              Eignung prüfen
              <ArrowRight className="h-4 w-4" />
            </Link>
            {!microReady && (
              <p className="mt-3 text-xs text-muted-foreground">
                Wähle Einkommen und Zeit, um fortzufahren.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ─── 4. STEP BAR ─── */}
      <section className="border-b border-border/40 px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <ol className="grid gap-4 sm:grid-cols-4">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="flex items-start gap-3 rounded-lg border border-border/40 bg-card p-4"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 font-display text-xs font-semibold text-accent">
                  {s.n}
                </span>
                <div>
                  <p className="font-display text-sm font-semibold">{s.t}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {s.d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── 5. TRUST STACK (moved BEFORE selection so the ask is earned) ─── */}
      <section className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Warum du uns vertrauen kannst
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TrustCard
              icon={ShieldCheck}
              label="Proof"
              body="580+ Absolventen, dokumentierte Closings, Aufnahmen anonymisiert prüfbar."
            />
            <TrustCard
              icon={Sparkles}
              label="Process"
              body="9 Wochen, 4 Phasen, klare KPIs — kein 'irgendwie motivieren'."
            />
            <TrustCard
              icon={Users}
              label="Authority"
              body="Trainer mit aktiv geführten Pipelines. Kein Theoretiker-Coaching."
            />
            <TrustCard
              icon={Lock}
              label="Transparency"
              body="Preise, Provisionen, Auswahlkriterien — alles auf der Tabelle."
            />
          </div>
        </div>
      </section>

      {/* ─── 6. SELECTION BLOCK ─── */}
      <section className="border-t border-border/40 bg-muted/20 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Ist es das Richtige für dich?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-border/40 bg-card p-6">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-destructive">
                <X className="h-3.5 w-3.5" />
                Nicht für dich, wenn…
              </div>
              <ul className="space-y-3">
                {DISQUALIFIERS.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-6">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent">
                <Check className="h-3.5 w-3.5" />
                Für dich, wenn…
              </div>
              <ul className="space-y-3">
                {QUALIFIERS.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 7. MECHANISM CLARITY ─── */}
      <section className="border-y border-border/40 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            So funktioniert das System
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <MechanismCard
              icon={TrendingUp}
              title="Earn While You Learn"
              body="Ab Level 2 arbeitest du an echten Leads — und verdienst Provisionen, bevor das Programm vorbei ist."
            />
            <MechanismCard
              icon={Sparkles}
              title="Echtes Closing"
              body="Keine Rollenspiele ab Woche 2. Du führst Calls, bekommst Aufnahmen-Feedback, und wirst gemessen."
            />
            <MechanismCard
              icon={Users}
              title="Partnernetzwerk"
              body="Wir vermitteln dich nach Zertifizierung an Coaches, Agenturen und Bildungsanbieter mit echtem Leadfluss."
            />
          </div>
        </div>
      </section>

      {/* ─── 8. FAQ — Objection handling (Ethics / Time / Rejection) ─── */}
      <section className="border-t border-border/40 bg-muted/20 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-accent">
            Häufige Fragen
          </p>
          <h2 className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Bevor du dich prüfen lässt.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            Drei Themen, die fast jeder fragt — Ethik, Zeit, und was passiert,
            wenn du nicht genommen wirst.
          </p>

          <Accordion
            type="single"
            collapsible
            className="mt-10 space-y-3"
            onValueChange={(value) => {
              if (!value) return;
              trackFunnelEvent("apply_faq_open", {
                funnel: FUNNEL_ID,
                question_id: value,
                page_path: "/qualify",
              });
            }}
          >
            {FAQ_ITEMS.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="overflow-hidden rounded-lg border border-border/40 bg-card px-5 data-[state=open]:border-accent/40 data-[state=open]:bg-background"
              >
                <AccordionTrigger className="py-4 text-left font-display text-sm font-semibold hover:no-underline sm:text-base">
                  <span className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold uppercase tracking-wider text-accent">
                      {item.tagShort}
                    </span>
                    {item.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5 pl-9 pr-2 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ─── 8b. CRITERIA PREVIEW — interactive self-check before final CTA ─── */}
      <CriteriaPreview />

      {/* ─── FINAL CTA ─── */}
      <section className="border-t border-border/40 px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Bereit für die Prüfung?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            6 Fragen. 90 Sekunden. Du gehst mit Klarheit raus — egal wie es ausgeht.
          </p>
          <div className="mt-8">
            <Link
              to={ctaHref}
              onClick={onPrimaryClick("final")}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-md px-8 py-3.5 text-sm font-semibold transition-all",
                microReady
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Jetzt Bewerbung starten
              <ArrowRight className="h-4 w-4" />
            </Link>
            {!microReady && (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById("micro");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Vorher: 2 Angaben oben ausfüllen.
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="pb-24 sm:pb-0" aria-hidden />
      <FooterSection />

      {/* ─── Sticky CTA Bar — same lock/tracking as hero ─── */}
      {stickyVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur-md"
        >
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <p className="hidden text-sm text-muted-foreground sm:block">
              {microReady
                ? "Bereit – starte deinen Qualifikations-Check."
                : "Wähle Einkommen & Zeit, um zu starten."}
            </p>
            <Link
              to={ctaHref}
              onClick={onPrimaryClick("sticky")}
              aria-disabled={!microReady}
              className={cn(
                "ml-auto inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-all w-full sm:w-auto",
                microReady
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground/60"
              )}
            >
              {!microReady && <Lock className="h-4 w-4" />}
              Qualifikations-Check starten
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
};

/* ─── Inline subcomponents (kept local to keep the variant isolated) ─── */

interface ChoiceRowProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  optional?: boolean;
}

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
  optional,
}: ChoiceRowProps<T>) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-display text-sm font-semibold">{label}</p>
        {optional && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            optional
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-md border px-3 py-2.5 text-xs font-medium transition-all sm:text-sm",
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border/40 bg-card text-foreground hover:border-border hover:bg-muted/40"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MechanismCard = ({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof TrendingUp;
  title: string;
  body: string;
}) => (
  <div className="rounded-lg border border-border/40 bg-background p-5">
    <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
      <Icon className="h-4 w-4 text-accent" />
    </div>
    <h3 className="font-display text-base font-semibold">{title}</h3>
    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
  </div>
);

const TrustCard = ({
  icon: Icon,
  label,
  body,
}: {
  icon: typeof ShieldCheck;
  label: string;
  body: string;
}) => (
  <div className="rounded-lg border border-border/40 bg-card p-5">
    <div className="mb-3 inline-flex items-center gap-2">
      <Icon className="h-4 w-4 text-accent" />
      <span className="text-xs font-semibold uppercase tracking-wider text-accent">
        {label}
      </span>
    </div>
    <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
  </div>
);

const ProofStat = ({ value, label }: { value: string; label: string }) => (
  <div className="text-center">
    <p className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
      {value}
    </p>
    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
  </div>
);

/* ─── CriteriaPreview — interactive checklist of QUALIFIERS shown directly
 * before the final CTA. Each tap toggles the checkbox AND fires
 * `apply_criteria_check` so we can measure which criteria resonate (and which
 * the user resists) per session. Pure presentation — no quiz state mutation.
 */
const CriteriaPreview = () => {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const viewFiredRef = useRef(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Section view event (once, when scrolled into view)
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || viewFiredRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !viewFiredRef.current) {
          viewFiredRef.current = true;
          trackFunnelEvent("apply_criteria_view", {
            funnel: FUNNEL_ID,
            page_path: "/qualify",
            criteria_count: QUALIFIERS.length,
          });
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const allChecked = checkedCount === QUALIFIERS.length;

  const toggle = (i: number, criterion: string) => {
    setChecked((prev) => {
      const next = { ...prev, [i]: !prev[i] };
      trackFunnelEvent("apply_criteria_check", {
        funnel: FUNNEL_ID,
        page_path: "/qualify",
        criterion_index: i,
        criterion_text: criterion,
        new_state: next[i] ? "checked" : "unchecked",
        checked_total: Object.values(next).filter(Boolean).length,
      });
      return next;
    });
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Auswahlkriterien — Selbst-Check"
      className="border-t border-border/40 bg-accent/5 px-4 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-accent">
            <Check className="h-3.5 w-3.5" />
            Letzter Selbst-Check
          </p>
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Bevor du den Strategie-Call buchst.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Tippe an, was auf dich zutrifft. Wenn du alle 4 ehrlich abhaken
            kannst, bist du bereit für die nächste Stufe.
          </p>
        </div>

        <ul className="mt-8 space-y-3">
          {QUALIFIERS.map((item, i) => {
            const isChecked = !!checked[i];
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => toggle(i, item)}
                  aria-pressed={isChecked}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-all",
                    isChecked
                      ? "border-accent bg-accent/10"
                      : "border-border/40 bg-card hover:border-accent/40 hover:bg-accent/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all",
                      isChecked
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-background",
                    )}
                  >
                    {isChecked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span
                    className={cn(
                      "text-sm leading-relaxed",
                      isChecked ? "text-foreground" : "text-foreground/85",
                    )}
                  >
                    {item}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {checkedCount} / {QUALIFIERS.length} treffen auf dich zu
          </span>
          <span
            className={cn(
              "font-medium",
              allChecked ? "text-accent" : "text-muted-foreground",
            )}
          >
            {allChecked ? "Bereit." : "Noch nicht vollständig."}
          </span>
        </div>
      </div>
    </section>
  );
};

export default QualifyLanding;
