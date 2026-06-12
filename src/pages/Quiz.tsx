import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFunnel } from "@/hooks/useFunnel";
import { cn } from "@/lib/utils";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import PublicMemberNavLink from "@/components/landing/PublicMemberNavLink";
import LeadCaptureGate from "@/components/funnel/LeadCaptureGate";
import MasterclassTeaser from "@/components/funnel/MasterclassTeaser";
import { trackFunnelEvent } from "@/lib/track-event";
import { trackCloserPath } from "@/lib/track-closerpath";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateQualification,
  getQuestionsForIntent,
} from "@/lib/qualification-engine";
import { resolveVariant, EXPERIMENTS } from "@/lib/experiments";

type FunnelEntry = "lifestyle" | "income" | "identity";

const introTexts: Record<FunnelEntry, { headline: string; sub: string }> = {
  lifestyle: {
    headline: "Finde heraus, ob dieser Weg zu dir passt",
    sub: "Ein kurzer Test – keine Theorie, nur Klarheit über deine Ausgangslage.",
  },
  income: {
    headline: "Finde heraus, ob du geeignet bist",
    sub: "Dieser Test zeigt, ob du die Voraussetzungen mitbringst – und was der nächste Schritt wäre.",
  },
  identity: {
    headline: "Teste dein Entscheidungslevel",
    sub: "Dieser Test zeigt, wie du entscheidest – und warum du aktuell stehst, wo du stehst.",
  },
};

const accentColors: Record<FunnelEntry, { bg: string; text: string; progress: string; btn: string; selected: string }> = {
  lifestyle: {
    bg: "bg-funnel-teal/15",
    text: "text-funnel-teal",
    progress: "bg-funnel-teal",
    btn: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
    selected: "border-funnel-teal bg-funnel-teal/5",
  },
  income: {
    bg: "bg-funnel-red/15",
    text: "text-funnel-red",
    progress: "bg-funnel-red",
    btn: "bg-funnel-red text-white hover:bg-funnel-red/90",
    selected: "border-funnel-red bg-funnel-red/5",
  },
  identity: {
    bg: "bg-funnel-purple/15",
    text: "text-funnel-purple",
    progress: "bg-funnel-gold",
    btn: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
    selected: "border-funnel-gold bg-funnel-gold/5",
  },
};

const Quiz = () => {
  // -1 = intro, 0..N-1 = questions, N = lead capture, N+1 = processing, N+2 = masterclass teaser
  const [step, setStep] = useState(-1);
  const [answerValues, setAnswerValues] = useState<number[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [qualificationBucket, setQualificationBucket] = useState<string>("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { funnel: funnelId } = useFunnel();
  const funnel = (
    ["lifestyle", "income", "identity"].includes(funnelId)
      ? funnelId
      : funnelId === "freiheit"
        ? "lifestyle"
        : "lifestyle"
  ) as FunnelEntry;
  const colors = useMemo(() => accentColors[funnel] || accentColors.lifestyle, [funnel]);
  const baseIntro = useMemo(() => introTexts[funnel] || introTexts.lifestyle, [funnel]);

  // Soft-yes pathway flag — set when the user arrived via the masterclass
  // ladder step (?intent=masterclass). Persisted so it survives the
  // lead-capture roundtrip even if React Router strips the search later.
  const isMasterclassIntent = useMemo(() => {
    const fromUrl = searchParams.get("intent") === "masterclass";
    if (fromUrl && typeof window !== "undefined") {
      sessionStorage.setItem("quiz_intent", "masterclass");
      return true;
    }
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("quiz_intent") === "masterclass";
    }
    return false;
  }, [searchParams]);

  // Pick the question set + intro based on intent. Masterclass intent uses a
  // reordered/reframed flow (intent + commitment first) tuned for soft-yes
  // viewers who already opted into the masterclass on the landing page.
  const activeQuestions = useMemo(
    () => getQuestionsForIntent(isMasterclassIntent ? "masterclass" : "default"),
    [isMasterclassIntent],
  );
  const intro = useMemo(
    () =>
      isMasterclassIntent
        ? {
            headline: "Kurzer Check vor deinem Masterclass-Zugang",
            sub: "5 Fragen – damit wir dir die Masterclass im richtigen Kontext zeigen.",
          }
        : baseIntro,
    [isMasterclassIntent, baseIntro],
  );

  const totalQuestions = activeQuestions.length;
  const STEP_LEAD_CAPTURE = totalQuestions;
  const STEP_PROCESSING = totalQuestions + 1;
  const STEP_MASTERCLASS_TEASER = totalQuestions + 2;

  // Read sticky variant for the masterclass-route experiment so all
  // downstream funnel events can be sliced per variant.
  const ladderVariant = useMemo(
    () => resolveVariant(EXPERIMENTS.LADDER_VS_ROUTE),
    [],
  );
  const experimentMeta = {
    experiment_id: EXPERIMENTS.LADDER_VS_ROUTE.id,
    variant: ladderVariant,
  };

  useEffect(() => {
    trackFunnelEvent("quiz_view", {
      funnel,
      intent: isMasterclassIntent ? "masterclass" : null,
      ...experimentMeta,
    });
  }, [funnel, isMasterclassIntent]);

  const handleAnswer = (value: number, optionIndex: number) => {
    setSelectedIdx(optionIndex);

    setTimeout(() => {
      const next = [...answerValues, value];
      setAnswerValues(next);
      setSelectedIdx(null);

      if (step + 1 < totalQuestions) {
        setStep(step + 1);
      } else {
        // All questions answered → go to lead capture (NOT evaluation)
        setStep(STEP_LEAD_CAPTURE);
      }
    }, 350);
  };

  const handleLeadCaptured = () => {
    // Lead captured → now evaluate and route
    setStep(STEP_PROCESSING);

    const qualification = calculateQualification(answerValues, activeQuestions);
    const sessionId = localStorage.getItem("quiz_session_id") || crypto.randomUUID();
    localStorage.setItem("quiz_session_id", sessionId);

    // Store results
    localStorage.setItem("quiz_result", funnel);
    localStorage.setItem("quiz_funnel", funnelId);
    localStorage.setItem("quiz_completed_at", new Date().toISOString());
    localStorage.setItem("qualification_score", String(qualification.score));
    localStorage.setItem("qualification_bucket", qualification.bucket);
    localStorage.setItem("qualification_path", qualification.path);

    trackFunnelEvent("quiz_completed", {
      funnel: funnelId,
      qualification_score: qualification.score,
      qualification_bucket: qualification.bucket,
      qualification_path: qualification.path,
      intent: isMasterclassIntent ? "masterclass" : null,
      ...experimentMeta,
    });

    const isCloserPath = window.location.pathname.startsWith("/closerpath");
    if (isCloserPath) {
      trackCloserPath("quiz_completed", {
        metadata: {
          qualification_score: qualification.score,
          qualification_bucket: qualification.bucket,
        },
      });
      trackCloserPath("lead_submitted", {
        metadata: { qualification_bucket: qualification.bucket },
      });
    }

    // Persist to quiz_submissions
    const submissionId = crypto.randomUUID();
    localStorage.setItem("quiz_submission_id", submissionId);

    // Link to lead if available
    const leadId = localStorage.getItem("lead_id");

    supabase
      .from("quiz_submissions")
      .insert({
        id: submissionId,
        session_id: sessionId,
        funnel_source: funnel,
        answers_json: activeQuestions.map((q, i) => ({
          question_id: q.id,
          answer_index: answerValues[i] ?? 0,
          answer_label: q.options.find((o) => o.value === answerValues[i])?.label ?? "",
        })),
        scores_json: qualification.answers,
        final_segment: funnel,
        quiz_score: qualification.score,
        ...(leadId ? { lead_id: leadId } : {}),
      } as any)
      .then(({ error }) => {
        if (error) console.error("Quiz save error:", error);
      });

    // Persist bucket so the inline teaser step can read it.
    setQualificationBucket(qualification.bucket);

    // Route based on intent + bucket
    setTimeout(() => {
      const isCloserPath = window.location.pathname.startsWith("/closerpath");
      if (isCloserPath) {
        navigate(`/closerpath/result?q=${qualification.bucket}`);
      } else if (isMasterclassIntent) {
        // Soft-yes ladder: stay in-flow, render the masterclass teaser
        // step inline. NO redirect to /start/masterclass — the access
        // trigger is shown right here.
        setStep(STEP_MASTERCLASS_TEASER);
      } else {
        // V2: NO dead-end. All buckets route to /booking — the page selects the
        // right calendar (priority/standard/orientation) based on qualification.
        navigate(`/booking?q=${qualification.bucket}`);
      }
    }, 2200);
  };

  const progress = step >= 0 && step <= totalQuestions ? ((Math.min(step + 1, totalQuestions)) / totalQuestions) * 100 : 0;
  const currentQ = step >= 0 && step < totalQuestions ? activeQuestions[step] : null;

  return (
    <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark flex flex-col">
      <PublicMemberNavLink page="start_quiz" tone="dark" />
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait">
            {step === -1 ? (
              /* INTRO */
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.5 }}
                className="text-center space-y-8"
              >
                <p className={cn("font-sans text-xs font-semibold uppercase tracking-[0.2em]", colors.text)}>
                  Selbstselektion
                </p>
                <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15]">
                  {intro.headline}
                </h1>
                <p className="font-sans text-lg leading-relaxed opacity-70 max-w-md mx-auto">
                  {intro.sub}
                </p>
                <button
                  onClick={() => {
                    setStep(0);
                    trackFunnelEvent("quiz_started", {
                      funnel,
                      intent: isMasterclassIntent ? "masterclass" : null,
                      ...experimentMeta,
                    });
                    if (window.location.pathname.startsWith("/closerpath")) {
                      trackCloserPath("quiz_started");
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 px-10 py-4 rounded-sm font-sans font-semibold text-base transition-all",
                    colors.btn,
                  )}
                >
                  Test starten
                  <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>
            ) : step === STEP_LEAD_CAPTURE ? (
              /* LEAD CAPTURE GATE — mandatory before evaluation */
              <LeadCaptureGate
                key="lead-capture"
                funnelName={funnelId}
                buttonClass={colors.btn}
                onLeadCaptured={handleLeadCaptured}
              />
            ) : step === STEP_PROCESSING ? (
              /* PROCESSING */
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center space-y-6"
              >
                <div className={cn("mx-auto h-12 w-12 rounded-full animate-pulse", colors.bg)} />
                <h2 className="font-display text-2xl font-semibold">
                  {isMasterclassIntent
                    ? "Wir prüfen deinen Zugang."
                    : "Deine Bewerbung wird ausgewertet."}
                </h2>
                <p className="font-sans text-base opacity-60">Einen Moment…</p>
              </motion.div>
            ) : step === STEP_MASTERCLASS_TEASER ? (
              /* SOFT-YES TEASER — inline access trigger, no detour */
              <MasterclassTeaser
                funnelId={funnelId}
                qualificationBucket={qualificationBucket}
                buttonClass={colors.btn}
              />
            ) : currentQ ? (
              /* QUESTION */
              <motion.div
                key={`q-${step}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                {/* Progress bar */}
                <div className="w-full h-1 bg-funnel-sand/50 rounded-full overflow-hidden">
                  <motion.div
                    className={cn("h-full rounded-full", colors.progress)}
                    initial={{ width: `${((step) / totalQuestions) * 100}%` }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>

                <p className="font-sans text-xs text-funnel-grey uppercase tracking-wider">
                  Frage {step + 1} von {totalQuestions}
                </p>

                <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight">
                  {currentQ.question}
                </h2>

                <div className="space-y-3">
                  {currentQ.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(opt.value, idx)}
                      className={cn(
                        "flex w-full items-center gap-3 text-left rounded-sm border p-5 font-sans text-base md:text-lg transition-all active:scale-[0.98]",
                        selectedIdx === idx
                          ? colors.selected
                          : "border-funnel-sand/60 bg-white hover:border-funnel-teal hover:bg-funnel-teal/5",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all",
                          selectedIdx === idx ? "border-current bg-current/20" : "border-funnel-sand",
                        )}
                      >
                        {selectedIdx === idx ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          String.fromCharCode(65 + idx)
                        )}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <FunnelFooter />
    </div>
  );
};

export default Quiz;
