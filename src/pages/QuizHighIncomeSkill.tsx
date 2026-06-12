import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, ArrowRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/track-event";
import { supabase } from "@/integrations/supabase/client";
import { persistLeadVerdict, routeForVerdict } from "@/lib/lead-storage";
import { captureCurrentPageAttribution, getCurrentAttributionSessionId, linkCurrentLeadAttribution } from "@/lib/lead-attribution";

/* ─── QUIZ QUESTIONS (6 steps) ─── */
const QUESTIONS = [
  {
    question: "Was beschreibt deine aktuelle Situation am besten?",
    options: [
      "Angestellt und unzufrieden",
      "Selbstständig, aber Umsatz stagniert",
      "Student / in Ausbildung",
      "Aktuell ohne Beschäftigung",
    ],
    key: "current_status",
  },
  {
    question: "Wie hoch ist dein aktuelles monatliches Einkommen?",
    options: [
      "Unter 2.000 €",
      "2.000 – 4.000 €",
      "4.000 – 7.000 €",
      "Über 7.000 €",
    ],
    key: "income_range",
  },
  {
    question: "Was ist dein wichtigstes Ziel in den nächsten 12 Monaten?",
    options: [
      "Mehr Einkommen generieren",
      "Ortsunabhängig arbeiten",
      "Einen echten Skill aufbauen",
      "Beruflich komplett neu starten",
    ],
    key: "goal",
  },
  {
    question: "Wie hoch ist dein Commitment, eine neue Fähigkeit zu lernen?",
    options: [
      "Sehr hoch – ich bin bereit, alles zu geben",
      "Hoch – wenn der Weg klar ist",
      "Mittel – ich brauche noch Überzeugung",
      "Niedrig – ich schaue nur mal",
    ],
    key: "commitment_level",
  },
  {
    question: "Wie viel Zeit kannst du pro Woche investieren?",
    options: [
      "20+ Stunden",
      "10–20 Stunden",
      "5–10 Stunden",
      "Unter 5 Stunden",
    ],
    key: "time_available",
  },
  {
    question: "Bist du bereit, in dich selbst zu investieren?",
    options: [
      "Ja, sofort – wenn das Angebot stimmt",
      "Ja, aber ich brauche mehr Infos",
      "Vielleicht, nach dem Gespräch",
      "Nein, nur kostenlose Optionen",
    ],
    key: "investment_readiness",
  },
];

/* ─── SCORING (deterministic) ─── */
const SCORE_MAP: Record<string, number[]> = {
  current_status: [8, 10, 6, 7],
  income_range: [5, 7, 9, 10],
  goal: [10, 8, 7, 6],
  commitment_level: [10, 8, 5, 2],
  time_available: [10, 8, 5, 2],
  investment_readiness: [10, 8, 5, 1],
};

function calcScore(answers: number[]): { score: number; isHigh: boolean } {
  let total = 0;
  QUESTIONS.forEach((q, i) => {
    total += SCORE_MAP[q.key]?.[answers[i]] ?? 0;
  });
  // Max possible = 60, normalize to 0-100
  const score = Math.round((total / 60) * 100);
  return { score, isHigh: score >= 60 };
}

/* ─── STYLES ─── */
const styles = {
  selected: "border-primary bg-primary/10 text-foreground",
  unselected: "border-border bg-card text-foreground/80 hover:border-primary/40 active:scale-[0.98]",
  progress: "bg-primary",
  button: "bg-primary text-primary-foreground hover:bg-primary/90",
};

/* ─── MAIN COMPONENT ─── */
export default function QuizHighIncomeSkill() {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [phase, setPhase] = useState<"quiz" | "capture" | "processing">("quiz");
  const [started, setStarted] = useState(false);

  // Lead capture fields
  const [name, setName] = useState(() => localStorage.getItem("lead_name") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("lead_email") || "");
  const [phone, setPhone] = useState(() => localStorage.getItem("lead_phone") || "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    captureCurrentPageAttribution("QuizHighIncomeSkill");
  }, []);

  const q = QUESTIONS[currentQ];
  const progressPercent =
    phase === "quiz"
      ? ((currentQ + 1) / QUESTIONS.length) * 100
      : 100;

  // Track first interaction
  if (!started && phase === "quiz") {
    setStarted(true);
    trackFunnelEvent("QUIZ_STARTED", { funnel: "high-income-skill" });
  }

  const handleSelect = useCallback(
    (optionIndex: number) => {
      setSelectedOption(optionIndex);
      setTimeout(() => {
        const newAnswers = [...answers, optionIndex];
        setAnswers(newAnswers);
        setSelectedOption(null);

        if (currentQ < QUESTIONS.length - 1) {
          setCurrentQ(currentQ + 1);
        } else {
          // Quiz done → email capture
          setPhase("capture");
          trackFunnelEvent("QUIZ_COMPLETED", {
            funnel: "high-income-skill",
            answers: newAnswers,
          });
        }
      }, 350);
    },
    [answers, currentQ]
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name ist erforderlich";
    if (!email.trim()) e.email = "E-Mail ist erforderlich";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Ungültige E-Mail";
    if (!phone.trim()) e.phone = "Telefonnummer ist erforderlich";
    else if (!/^[\d\s+\-().]{6,20}$/.test(phone.trim())) e.phone = "Ungültige Nummer";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLeadSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    localStorage.setItem("lead_name", trimmedName);
    localStorage.setItem("lead_email", trimmedEmail);
    localStorage.setItem("lead_phone", trimmedPhone);

    trackFunnelEvent("EMAIL_CAPTURED", { funnel: "high-income-skill" });

    const { score, isHigh } = calcScore(answers);

    // Build quiz_answers payload
    const quizAnswersPayload: Record<string, string> = {};
    QUESTIONS.forEach((q, i) => {
      quizAnswersPayload[q.key] = q.options[answers[i]];
    });

    try {
      const { getCachedTrafficOwner } = await import("@/lib/funnel-source");
      // Upsert lead
      const { data, error } = await supabase.rpc("upsert_funnel_lead", {
        p_name: trimmedName,
        p_email: trimmedEmail,
        p_phone: trimmedPhone,
        p_funnel_source: "high_income_angle",
        p_quiz_answers: quizAnswersPayload,
        p_session_id: getCurrentAttributionSessionId(),
        p_traffic_owner: getCachedTrafficOwner(),
      } as never);

      // RPC returns jsonb; persist server verdict (overwrites any prior low
      // qualification on retake).
      const verdict = persistLeadVerdict(data, {
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
      });
      const leadId = verdict.leadId;
      if (leadId) {
        // Update lead with funnel-specific local quiz score (separate scale).
        await supabase
          .from("leads")
          .update({
            quiz_score: score,
            quiz_result: isHigh ? "high" : "low",
            quiz_funnel_source: "high-income-skill",
            stage: "quiz_completed",
            source: "quiz",
            source_funnel: "high-income-skill",
          })
          .eq("id", leadId);

        await linkCurrentLeadAttribution(leadId, trimmedEmail);

        supabase.functions.invoke("score-lead", {
          body: { lead_id: leadId },
        }).catch(() => {});
      }

      if (error) console.error("Lead upsert error:", error);

      trackFunnelEvent(isHigh ? "QUIZ_HIGH_SCORE" : "QUIZ_LOW_SCORE", {
        funnel: "high-income-skill",
        score,
        ...verdict,
      });

      // Route based on FRESH server verdict (not stale localStorage).
      // Server "low" overrides funnel-local high decision; otherwise honour
      // the funnel-local high/low split.
      setPhase("processing");
      setTimeout(() => {
        const lowPath = "/quiz/low-result";
        const defaultPath = isHigh
          ? "/high-income-skill/booking"
          : "/high-income-skill/booking";
        navigate(routeForVerdict(verdict, { defaultPath, lowPath }));
      }, 1500);
    } catch (err) {
      console.error("Quiz lead error:", err);
      navigate("/high-income-skill/booking");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && /^[\d\s+\-().]{6,20}$/.test(phone.trim());

  return (
    <section className="min-h-screen bg-background py-14 md:py-24">
      <div className="container mx-auto max-w-lg px-5">
        {/* ── Progress bar ── */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-4 pt-2 -mx-5 px-5">
          <div className="flex items-center justify-between font-sans text-xs text-muted-foreground mb-2">
            <span>
              {phase === "quiz"
                ? `Frage ${currentQ + 1} von ${QUESTIONS.length} • dauert nur 60 Sekunden`
                : phase === "capture"
                ? "Fast geschafft!"
                : "Ergebnis wird berechnet..."}
            </span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn("absolute inset-y-0 left-0 rounded-full", styles.progress)}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ── QUIZ PHASE ── */}
          {phase === "quiz" && (
            <motion.div
              key={`q-${currentQ}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="space-y-5 pt-2"
            >
              <h3 className="font-display text-xl md:text-2xl font-semibold text-foreground leading-tight">
                {q.question}
              </h3>
              <div className="space-y-2.5">
                {q.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-lg border p-4 min-h-[52px] text-left font-sans text-sm leading-relaxed transition-all duration-200",
                      selectedOption === i ? styles.selected : styles.unselected
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all",
                        selectedOption === i ? "border-current bg-current/20" : "border-border"
                      )}
                    >
                      {selectedOption === i ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span>{option}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── EMAIL CAPTURE PHASE ── */}
          {phase === "capture" && (
            <motion.div
              key="capture"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-6 text-center pt-8"
            >
              <div className="space-y-2">
                <h3 className="font-display text-xl md:text-2xl font-semibold text-foreground">
                  Dein Ergebnis ist bereit.
                </h3>
                <p className="font-sans text-sm text-muted-foreground max-w-sm mx-auto">
                  Trag deine Daten ein, damit wir dein persönliches Ergebnis auswerten und dir den nächsten Schritt zeigen können.
                </p>
              </div>

              <div className="space-y-3 max-w-sm mx-auto text-left">
                {/* Name */}
                <div>
                  <input
                    type="text"
                    placeholder="Vorname *"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
                    className={cn(
                      "w-full rounded-lg border px-4 py-3 font-sans text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
                      errors.name ? "border-destructive" : "border-border"
                    )}
                    autoFocus
                  />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>
                {/* Email */}
                <div>
                  <input
                    type="email"
                    placeholder="E-Mail-Adresse *"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); }}
                    className={cn(
                      "w-full rounded-lg border px-4 py-3 font-sans text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
                      errors.email ? "border-destructive" : "border-border"
                    )}
                  />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>
                {/* Phone */}
                <div>
                  <input
                    type="tel"
                    placeholder="Telefonnummer *"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: "" })); }}
                    className={cn(
                      "w-full rounded-lg border px-4 py-3 font-sans text-sm bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
                      errors.phone ? "border-destructive" : "border-border"
                    )}
                  />
                  {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                </div>
              </div>

              <button
                onClick={handleLeadSubmit}
                disabled={submitting || !isFormValid}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-lg px-8 py-4 font-sans font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none w-full max-w-sm mx-auto",
                  styles.button
                )}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Ergebnis anzeigen
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground/50 max-w-xs mx-auto">
                Deine Daten werden vertraulich behandelt und nicht an Dritte weitergegeben.
              </p>
            </motion.div>
          )}

          {/* ── PROCESSING PHASE ── */}
          {phase === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center gap-4 pt-20"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-sans text-sm text-muted-foreground">
                Dein Ergebnis wird berechnet…
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
