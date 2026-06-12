import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/track-event";
import LeadCaptureGate from "@/components/funnel/LeadCaptureGate";
import QuizResultGate from "@/components/funnel/QuizResultGate";
import Q1MomentumBanner from "@/components/funnel/Q1MomentumBanner";

export interface QuizQuestion {
  question: string;
  options: string[];
}

interface FunnelQuizProps {
  questions: QuizQuestion[];
  variant: "sand" | "red" | "gold";
  funnelName: string;
  onComplete?: (answers: number[]) => void;
}

const accentStyles = {
  sand: {
    selected: "border-funnel-teal bg-funnel-teal/10 text-funnel-dark",
    unselected: "border-border bg-card text-foreground/80 hover:border-funnel-teal/40 active:scale-[0.98]",
    progress: "bg-funnel-teal",
    button: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
  },
  red: {
    selected: "border-funnel-red bg-funnel-red/10 text-foreground",
    unselected: "border-border bg-card text-foreground/80 hover:border-funnel-red/40 active:scale-[0.98]",
    progress: "bg-funnel-red",
    button: "bg-funnel-red text-white hover:bg-funnel-red/90",
  },
  gold: {
    selected: "border-funnel-gold bg-funnel-gold/10 text-foreground",
    unselected: "border-border bg-card text-foreground/80 hover:border-funnel-gold/40 active:scale-[0.98]",
    progress: "bg-funnel-gold",
    button: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
  },
};

const FunnelQuiz = ({ questions, variant, funnelName, onComplete }: FunnelQuizProps) => {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizDone, setQuizDone] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const navigate = useNavigate();

  const styles = accentStyles[variant];
  const q = questions[currentQ];
  const progressPercent = quizDone ? 100 : ((currentQ + 1) / questions.length) * 100;

  const handleSelect = (optionIndex: number) => {
    setSelectedOption(optionIndex);

    setTimeout(() => {
      const newAnswers = [...answers, optionIndex];
      setAnswers(newAnswers);
      setSelectedOption(null);

      trackFunnelEvent("quiz_answer", { funnel: funnelName, question: currentQ, answer: optionIndex });

      if (currentQ < questions.length - 1) {
        setCurrentQ(currentQ + 1);
      } else {
        setQuizDone(true);
        trackFunnelEvent("quiz_completed", { funnel: funnelName, answers: newAnswers });
      }
    }, 350);
  };

  const handleLeadCaptured = () => {
    // Result-First: reveal result before any further action.
    trackFunnelEvent("lead_captured_to_result", { funnel: funnelName });
    setLeadCaptured(true);
  };

  const handleResultProceed = () => {
    if (onComplete) {
      onComplete(answers);
    } else {
      navigate("/booking");
    }
  };

  return (
    <section className="py-14 md:py-24 bg-background">
      <div className="container mx-auto max-w-lg px-5">
        {/* Sticky progress bar */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm pb-4 pt-2 -mx-5 px-5">
          <div className="flex items-center justify-between font-sans text-xs text-muted-foreground mb-2">
            <span>
              {quizDone
                ? "Fertig — dein Ergebnis ist da."
                : `Schritt ${currentQ + 1} von ${questions.length} · 40 Sekunden, kein Druck`}
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

        {/* Quiz → Lead Capture → Result-First → Single CTA */}
        <AnimatePresence mode="wait">
          {quizDone && leadCaptured ? (
            /* RESULT-FIRST GATE — reveal result, then ONE dominant CTA */
            <div key="result-gate" className="pt-8">
              <QuizResultGate
                funnelName={funnelName}
                answers={answers}
                buttonClass={styles.button}
                onProceed={handleResultProceed}
              />
            </div>
          ) : quizDone ? (
            /* LEAD CAPTURE GATE — mandatory before showing result */
            <div key="lead-gate" className="pt-8">
              <LeadCaptureGate
                funnelName={funnelName}
                buttonClass={styles.button}
                onLeadCaptured={handleLeadCaptured}
              />
            </div>
          ) : (
            <motion.div
              key={currentQ}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="space-y-5 pt-2"
            >
              {currentQ === 0 && (
                <Q1MomentumBanner totalQuestions={questions.length} />
              )}
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
                    <span className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all",
                      selectedOption === i
                        ? "border-current bg-current/20"
                        : "border-border"
                    )}>
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
        </AnimatePresence>
      </div>
    </section>
  );
};

export default FunnelQuiz;
