import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles, Target, TrendingUp } from "lucide-react";
import { trackCloserPath } from "@/lib/track-closerpath";
import FooterSection from "@/components/landing/FooterSection";

type ResultStatus = "high_potential" | "strong_fit" | "needs_development";

interface ResultProfile {
  status: ResultStatus;
  badge: string;
  headline: string;
  diagnosis: string;
  microProof: string;
}

const PROFILES: Record<ResultStatus, ResultProfile> = {
  high_potential: {
    status: "high_potential",
    badge: "High Potential",
    headline: "Your Result: High Potential",
    diagnosis:
      "You show clear ownership, strong urgency, and the willingness to execute. You don't need motivation — you need structure. That's exactly what this system provides.",
    microProof:
      "People with this profile typically reach their first deals within the first weeks of execution.",
  },
  strong_fit: {
    status: "strong_fit",
    badge: "Strong Fit",
    headline: "Your Result: Strong Fit",
    diagnosis:
      "You show strong motivation and willingness to take ownership. Your main gap is structure and execution consistency — exactly what this system is built to solve.",
    microProof:
      "People with a similar starting point have built real income inside the system within their first months.",
  },
  needs_development: {
    status: "needs_development",
    badge: "Needs Development",
    headline: "Your Result: Needs Development",
    diagnosis:
      "Your foundation is there, but commitment and clarity need to deepen before you operate at a closer level. The system shows you exactly where to start and how to build that foundation.",
    microProof:
      "People who started here and followed the system have moved into real call activity within weeks.",
  },
};

function bucketToStatus(bucket: string | null): ResultStatus {
  if (bucket === "high") return "high_potential";
  if (bucket === "low") return "needs_development";
  return "strong_fit";
}

/**
 * /closerpath/result — Quiz Result Page (Reward-Driven)
 *
 * Flow: Quiz → Lead Capture → THIS PAGE → Booking
 * Principle: Effort → Reward → Identity → Action
 *
 * Reads `qualification_bucket` from localStorage (set by Quiz page) to
 * personalize the status. Falls back to "Strong Fit" if missing.
 */
const CloserPathResult = () => {
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState(false);

  const profile = useMemo<ResultProfile>(() => {
    const bucket = localStorage.getItem("qualification_bucket");
    return PROFILES[bucketToStatus(bucket)];
  }, []);

  useEffect(() => {
    trackCloserPath("result_viewed", { metadata: { status: profile.status } });
    // Reveal animation after a beat → "result revealed" moment
    const t = window.setTimeout(() => setRevealed(true), 350);
    return () => window.clearTimeout(t);
  }, [profile.status]);

  const handleBookingClick = () => {
    trackCloserPath("booking_viewed", {
      metadata: { source: "result_cta", status: profile.status },
    });
    navigate("/closerpath/booking");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-2xl px-6 py-16 md:py-24">
        {/* Progress = 100% */}
        <div className="mb-10">
          <div className="mb-2 flex items-center justify-between font-sans text-xs text-muted-foreground">
            <span>Qualification complete</span>
            <span>100%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* SECTION 1 — STATUS (immediate reward) */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12 space-y-5 text-center"
        >
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-primary">
              {profile.badge}
            </span>
          </div>
          <h1 className="font-display text-3xl font-semibold leading-tight md:text-5xl">
            {profile.headline}
          </h1>
          <p className="mx-auto max-w-md font-sans text-base text-muted-foreground md:text-lg">
            Based on your answers, you have a real foundation to succeed
            inside this system.
          </p>
        </motion.section>

        {/* SECTION 2 — DIAGNOSIS */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mb-12 rounded-lg border border-border bg-card p-6 md:p-8"
        >
          <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your profile
          </p>
          <p className="font-display text-lg leading-relaxed text-foreground md:text-xl">
            {profile.diagnosis}
          </p>
        </motion.section>

        {/* SECTION 3 — PATH */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mb-12 space-y-5"
        >
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your likely path
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {["Trainee", "Setter", "Closer", "Senior Closer"].map(
              (step, i, arr) => (
                <div key={step} className="flex items-center gap-2">
                  <div className="rounded-md border border-border bg-card px-3 py-2 font-sans text-sm font-medium text-foreground">
                    {step}
                  </div>
                  {i < arr.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              ),
            )}
          </div>
          <p className="font-sans text-sm text-muted-foreground">
            This is the exact path you would follow inside the system.
          </p>
        </motion.section>

        {/* SECTION 4 — IDENTITY ACTIVATION */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mb-12 border-l-2 border-primary/60 pl-6"
        >
          <p className="font-display text-xl font-medium leading-relaxed text-foreground md:text-2xl">
            You are not starting from zero.
            <br />
            <span className="text-muted-foreground">
              You are stepping into a structured path where performance turns
              into income.
            </span>
          </p>
        </motion.section>

        {/* SECTION 5 — MICRO-PROOF */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mb-12 flex items-start gap-3 rounded-lg bg-muted/40 p-5"
        >
          <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="font-sans text-sm leading-relaxed text-foreground/85 md:text-base">
            {profile.microProof}
          </p>
        </motion.section>

        {/* SECTION 6 — TRANSITION + CTA */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={revealed ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="space-y-6 rounded-lg border border-border bg-card p-6 text-center md:p-8"
        >
          <div className="space-y-3">
            <Target className="mx-auto h-6 w-6 text-primary" />
            <p className="font-display text-xl font-semibold leading-tight text-foreground md:text-2xl">
              Based on your profile, the next step is a short call to validate
              your entry.
            </p>
          </div>

          <button
            onClick={handleBookingClick}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 font-sans text-base font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] md:w-auto"
          >
            Book Your Qualification Call
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="space-y-1.5">
            <p className="font-sans text-xs text-muted-foreground">
              Takes 20–30 minutes
            </p>
            <p className="font-sans text-xs text-muted-foreground">
              We only work with a limited number of applicants per cohort.
            </p>
          </div>
        </motion.section>

        {/* Soft fallback link */}
        <div className="mt-10 text-center">
          <Link
            to="/closerpath"
            className="font-sans text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>
        </div>
      </div>

      <FooterSection />
    </main>
  );
};

export default CloserPathResult;
