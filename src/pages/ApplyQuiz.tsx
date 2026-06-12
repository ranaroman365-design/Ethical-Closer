import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/track-event";
import { supabase } from "@/integrations/supabase/client";
import LeadCaptureGate from "@/components/funnel/LeadCaptureGate";
import { persistLeadVerdict, routeForVerdict, generateBookingToken } from "@/lib/lead-storage";
import {
  APPLY_QUESTIONS,
  getApplyQuestions,
  calculateApplyResult,
  type ApplyAnswerId,
  type ApplyResult,
} from "@/lib/apply-qualification";
import { resolveApplyV2 } from "@/lib/apply-v2-flag";
import { consumeApplyTimePrefill, TIME_BUCKET_TO_QUIZ_INDEX } from "@/lib/apply-prefill";
import { getOrCreateAttributionSessionId } from "@/lib/attribution-session";
import { captureCurrentPageAttribution } from "@/lib/lead-attribution";
import { captureAttributionSource } from "@/lib/attribution-source";
import { getApplyAudience } from "@/lib/apply-audience";
import { fireMosQuizEvent } from "@/lib/mos-quiz-events";
import { fireApplyQuizEvent } from "@/lib/apply-quiz-events";
import { recordIntentSignal } from "@/lib/mos-high-intent";
import { useAbSlot } from "@/hooks/useAbSlot";
import {
  isMosQuizSession,
  MOS_QUIZ_HERO_HEADLINE,
  MOS_QUIZ_SUBHEADLINE,
  MOS_QUIZ_CTA,
  MOS_COMMITMENT_TOGGLE,
  MOS_PROGRESS_STYLE,
  MOS_QUIZ_Q1_SOFT,
  MOS_RESULT_ANTICIPATION,
  MOS_BENEFIT_STACK,
  MOS_QUIZ_LENGTH,
  MOS_AVATAR_FILTER_COPY,
  HEADLINE_COPY,
  SUB_COPY,
  CTA_COPY,
  trackHeroVariantView,
  trackCommitmentView,
  trackQuizLengthView,
  trackQuizLengthVariantView,
  trackQuizResultAnticipationView,
  trackQuizIntroModeView,
  trackQuestion1VariantView,
  QuizOutcomePreview,
  QuizCommitmentBlock,
  QuizTransitionScreen,
  ProgressVariant,
  AnticipationCaption,
  SoftEntryQuestion,
} from "@/components/masterofsales/quiz-continuity";
import { AvatarFilterQuestions, type AvatarFilterResult } from "@/components/masterofsales/quiz/AvatarFilterQuestions";
import { GlobalCloserInterstitial } from "@/components/masterofsales/quiz/GlobalCloserInterstitial";
import { MosCommitmentLine } from "@/components/masterofsales/quiz/MosCommitmentLine";
import MosInstantQ1 from "@/components/masterofsales/quiz/MosInstantQ1";
import { MOS_QUIZ_DIRECT_ENTRY, MOS_Q1_INSTANT_ANSWER } from "@/lib/mos-cro-slots";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import { GLOBALCLOSER_URL } from "@/lib/mos-development-score";

const FUNNEL_ID = "apply";
const EXPERIMENT_ID = "apply_vs_qualify_v1";

/**
 * Funnel-tag payload threaded onto every canonical event in the quiz flow
 * (quiz_view, quiz_started, quiz_completed, qualified/not_qualified,
 * lead_capture_submitted) so downstream A/B analytics can attribute each
 * event back to the originating landing variant + its micro-commitment
 * pre-selections (e.g. /qualify ?src=qualify&income=..&time=..&experience=..).
 *
 * Schema is locked to snake_case to match canonical-events.ts. All values are
 * normalized to lowercase strings or null — never undefined.
 */
const ALLOWED_INCOME = new Set(["yes", "no", "maybe"]);
const ALLOWED_TIME = new Set(["lt5", "5to10", "gte10"]);
const ALLOWED_EXPERIENCE = new Set(["none", "some", "lots"]);
const norm = (v: string | null, allow: Set<string>): string | null => {
  if (!v) return null;
  const lower = v.toLowerCase();
  return allow.has(lower) ? lower : null;
};

type Selection = { id: ApplyAnswerId; optionIndex: number };

function buildServerQuizAnswers(result: ApplyResult) {
  const byId = Object.fromEntries(result.answers.map((answer) => [answer.id, answer]));
  const answerLabel = (id: ApplyAnswerId) => byId[id]?.label ?? null;

  return {
    answers: result.answers,
    score: result.score,
    qualification_score: result.score,
    qualification_bucket: result.bucket,
    hard_blocked: result.hardBlocked,
    qualification_hard_blocked: result.hardBlocked,
    motivation: answerLabel("motivation"),
    ambition: answerLabel("ambition"),
    real_calls: answerLabel("real_calls"),
    time: answerLabel("time"),
    experience: answerLabel("experience"),
    income_goal: answerLabel("income_goal"),
    // V2 additive (null in V1) — server-side schema must remain forward-tolerant.
    commitment: answerLabel("commitment"),
    velocity: answerLabel("velocity"),
    velocity_bucket: result.velocity ?? null,
    commitment_bucket: result.commitment ?? null,
    apply_v2: result.v2,
    income_target: answerLabel("income_target"),
  };
}

export default function ApplyQuiz() {
  // -1 = intro, 0..N-1 = questions, N = lead capture, N+1 = processing
  const [step, setStep] = useState(-1);
  const [showTransition, setShowTransition] = useState(false);
  const [showSoftEntry, setShowSoftEntry] = useState(false);
  // Hero-Simplification Sprint — instant Q1 overlay (MOS only).
  const [showInstantQ1, setShowInstantQ1] = useState(false);
  const directEntryAb = useAbSlot(MOS_QUIZ_DIRECT_ENTRY);
  const instantQ1Ab = useAbSlot(MOS_Q1_INSTANT_ANSWER);
  const directEntryAutoStartedRef = useRef(false);
  // MOS Avatar Filter — additive gate between last quiz Q and lead capture.
  // States: null = not shown yet, "questions" = qualification cluster + indirect,
  // "interstitial" = GlobalCloser redirect screen.
  const [avatarPhase, setAvatarPhase] = useState<null | "questions" | "interstitial">(null);
  const [avatarResult, setAvatarResult] = useState<AvatarFilterResult | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const outcomeTrackedRef = useRef(false);
  const sessionId = useMemo(() => getOrCreateAttributionSessionId(), []);
  const audience = useMemo(() => getApplyAudience(), []);
  const isMale = audience === "male_ambition";
  const applyV2 = useMemo(() => resolveApplyV2(), []);
  const questions = useMemo(() => getApplyQuestions(applyV2), [applyV2]);

  // Master Funnel Tracking v2 — if the user arrives here via the masterofsales
  // funnel (?source=masterofsales OR sticky audience=male_ambition with prior
  // funnel-id), make sure the same master_funnel_id is reused. Pure additive.
  useEffect(() => {
    const src = searchParams.get("source") || "";
    const looksMos = src.startsWith("masterofsales") || isMale;
    if (!looksMos) return;
    void import("@/lib/master-funnel-id").then(({ ensureMasterFunnelId }) => {
      ensureMasterFunnelId();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Audience-aware copy layer (Männer-Cohort: Richtungs-Check / Klare Richtung,
  // Frauen-Cohort: Karriere-Check / 90-Sek-Check). Quiz logic, questions and
  // lead-capture mechanics stay identical — this is a pure wording switch.
  const copy = isMale
    ? {
        topbar: "Closer Readiness Call™ · 90 Sekunden",
        introTitle1: "Dein Richtungs-Check",
        introTitle2: "in 5 Fragen.",
        introBody: "Klare Richtung. Kein Vertrieb. Kein Druck. Nur ein ehrlicher Check, ob dieser Weg zu dir passen könnte. 90 Sekunden.",
        introCta: "Closer Readiness Call™ starten",
        docTitle: "Closer Readiness Call™ — Ethical Top Closer",
        footer: "Nicht für jeden. Vielleicht für dich.",
      }
    : {
        topbar: "Closer Readiness Call™ · 90 Sekunden",
        introTitle1: "Dein Karriereweg",
        introTitle2: "in 5 Fragen.",
        introBody: "Kein Druck. Keine Bewerbung. Nur ein ehrlicher Check, ob dieser Weg zu dir passen könnte. Dauert 90 Sekunden.",
        introCta: "Closer Readiness Call™ starten",
        docTitle: "Closer Readiness Call™ — Ethical Top Closer",
        footer: "Keine E-Mail-Pflicht zum Start. Du entscheidest am Ende.",
      };

  // MOS Quiz Continuity Layer — additive, only for masterofsales* sessions.
  // Replaces the "Closer Readiness Call™" frame with LP-aligned vocabulary
  // (Richtung / Potenzial / Klarheit). Quiz logic stays identical.
  const isMosQuiz = isMosQuizSession(isMale);
  const heroHeadlineAb = useAbSlot(MOS_QUIZ_HERO_HEADLINE);
  const heroSubAb = useAbSlot(MOS_QUIZ_SUBHEADLINE);
  const heroCtaAb = useAbSlot(MOS_QUIZ_CTA);
  const commitmentAb = useAbSlot(MOS_COMMITMENT_TOGGLE);
  const progressAb = useAbSlot(MOS_PROGRESS_STYLE);
  const q1SoftAb = useAbSlot(MOS_QUIZ_Q1_SOFT);
  const anticipationAb = useAbSlot(MOS_RESULT_ANTICIPATION);
  const benefitAb = useAbSlot(MOS_BENEFIT_STACK);
  const quizLengthAb = useAbSlot(MOS_QUIZ_LENGTH);
  const avatarCopyAb = useAbSlot(MOS_AVATAR_FILTER_COPY);
  if (isMosQuiz) {
    const h = HEADLINE_COPY[heroHeadlineAb.variant] ?? HEADLINE_COPY.richtungs_check;
    const sub = SUB_COPY[heroSubAb.variant] ?? SUB_COPY["5_fragen_90s"];
    const cta = CTA_COPY[heroCtaAb.variant] ?? CTA_COPY.richtungs_check_starten;
    copy.topbar = "Richtungs-Check · 90 Sekunden";
    copy.introTitle1 = h.title1;
    copy.introTitle2 = h.title2;
    copy.introBody = sub;
    copy.introCta = cta;
    copy.docTitle = "Dein Richtungs-Check — Ethical Closer";
    copy.footer = "Kein Vertrieb. Kein Druck. Nur ein ehrlicher Check.";
  }
  useEffect(() => {
    if (!isMosQuiz) return;
    trackHeroVariantView(heroHeadlineAb.variant, heroSubAb.variant, heroCtaAb.variant);
    trackQuizLengthView(quizLengthAb.variant);
    // Brief-spec aliases (additive, separately deduped).
    trackQuizLengthVariantView(quizLengthAb.variant);
    trackQuizResultAnticipationView(anticipationAb.variant);
    trackQuizIntroModeView(q1SoftAb.variant === "on" ? "soft_q1" : "transition_only");
    // commitment "off" still emits a view (per-variant), "on" emitted by component
    if (commitmentAb.variant === "off") trackCommitmentView("off");
    if (q1SoftAb.variant === "off") trackQuestion1VariantView("off");
  }, [
    isMosQuiz,
    heroHeadlineAb.variant,
    heroSubAb.variant,
    heroCtaAb.variant,
    commitmentAb.variant,
    q1SoftAb.variant,
    quizLengthAb.variant,
    anticipationAb.variant,
  ]);

  // ─── Hero-Simplification Sprint — direct-entry auto-start (MOS only) ──
  // Skip the secondary intro/CTA screen entirely. CTA-Klick auf der LP →
  // /apply/quiz?source=masterofsales → diese Komponente startet das Quiz
  // ohne zweiten "Start"-Button. Bestehende non-MOS-Sessions unverändert.
  useEffect(() => {
    if (!isMosQuiz) return;
    if (directEntryAutoStartedRef.current) return;
    if (step !== -1) return;
    if (showTransition || showSoftEntry || showInstantQ1) return;
    const mode = directEntryAb.variant;
    if (mode !== "direct" && mode !== "transition" && mode !== "mini_intro") return;
    directEntryAutoStartedRef.current = true;
    fireMosCroEvent("MASTER_QUIZ_DIRECT_ENTRY_VIEW", mode);
    try {
      trackFunnelEvent("quiz_started", eventBasePayload);
      if (isMale) {
        try { trackFunnelEvent("quiz_started_men", { funnel: "masterofsales", session_id: sessionId }); } catch { /* noop */ }
      }
      recordIntentSignal("quiz_started");
      fireMosQuizEvent("MASTER_QUIZ_STARTED");
      fireApplyQuizEvent("APPLY_QUIZ_STARTED");
    } catch { /* never throw */ }

    if (mode === "direct") {
      // Sofort instant-Q1 zeigen — keinerlei Hero-/Intro-Anzeige.
      setShowInstantQ1(true);
    } else if (mode === "transition") {
      setShowTransition(true);
      window.setTimeout(() => {
        setShowTransition(false);
        setShowInstantQ1(true);
      }, 800);
    } else {
      // mini_intro — eine Zeile Reassurance, dann sofort Q1.
      setShowSoftEntry(true);
      window.setTimeout(() => {
        setShowSoftEntry(false);
        setShowInstantQ1(true);
      }, 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMosQuiz, directEntryAb.variant, step]);

  // Funnel-tag payload — derived once per URL, threaded onto every event.
  const funnelTags = useMemo(() => {
    const src = (searchParams.get("src") || "").toLowerCase() || null;
    return {
      funnel_variant: src,                        // "qualify" | null
      micro_income: norm(searchParams.get("income"), ALLOWED_INCOME),
      micro_time: norm(searchParams.get("time"), ALLOWED_TIME),
      micro_experience: norm(searchParams.get("experience"), ALLOWED_EXPERIENCE),
    };
  }, [searchParams]);

  const eventBasePayload = useMemo(() => ({
    funnel: FUNNEL_ID,
    variant: funnelTags.funnel_variant ?? "apply",
    session_id: sessionId,
    experiment_id: EXPERIMENT_ID,
    apply_v2: applyV2,
    // Cohort tag — propagates to every quiz + lead-capture event so funnel
    // analytics can split men vs. default cleanly. Resolved client-side
    // (UTM/sticky/override) via getApplyAudience().
    audience,
    audience_cohort: audience,
    ...funnelTags,
  }), [funnelTags, sessionId, audience, applyV2]);

  const total = questions.length;
  const STEP_CAPTURE = total;
  const STEP_PROCESSING = total + 1;

  useEffect(() => {
    document.title = copy.docTitle;
    captureCurrentPageAttribution("ApplyQuiz");
    captureAttributionSource(); // ensure ?source= is captured even if user lands directly on /apply/quiz
    trackFunnelEvent("quiz_view", eventBasePayload);

    // Above-the-fold micro-commitment: if the user picked a time bucket on
    // /apply, prefill the `time` question and skip directly to the next.
    const bucket = consumeApplyTimePrefill();
    if (!bucket) return;
    const timeIdx = APPLY_QUESTIONS.findIndex((q) => q.id === "time");
    if (timeIdx < 0) return;
    const optionIndex = TIME_BUCKET_TO_QUIZ_INDEX[bucket];
    setSelections([{ id: "time", optionIndex }]);
    setPrefillApplied(true);
    // Start at first non-time question; if `time` is last, jump to capture.
    const next = timeIdx === 0 ? 1 : 0;
    setStep(next < total ? next : total);
    trackFunnelEvent("apply_prefill_consumed", { ...eventBasePayload, bucket, option_index: optionIndex });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MOS additive layer — fire MASTER_QUIZ_STEP_n once per session as the user
  // advances. Only active for masterofsales* attribution; no-op otherwise.
  useEffect(() => {
    if (step === 0) { fireMosQuizEvent("MASTER_QUIZ_STEP_1", { step: 1 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_1", { step: 1 }); }
    if (step === 1) { fireMosQuizEvent("MASTER_QUIZ_STEP_2", { step: 2 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_2", { step: 2 }); }
    if (step === 2) { fireMosQuizEvent("MASTER_QUIZ_STEP_3", { step: 3 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_3", { step: 3 }); }
    // Fix A: STEP_4 wurde bisher nicht gefeuert → künstlicher 85% Drop bei Frage 4.
    if (step === 3) { fireMosQuizEvent("MASTER_QUIZ_STEP_4", { step: 4 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_4", { step: 4 }); }
    // Additiv (Fix Teil 1): Quiz hat bis zu 9 Fragen (V2). Bisher wurden nur
    // STEP_5/6 für APPLY_* gefeuert — nie für MASTER_*, nie für STEP_7..9.
    // Wir feuern jetzt für ALLE realen Quiz-Schritte beide Event-Namespaces.
    // Dashboard kann so dynamisch alle Fragen darstellen.
    if (step === 4) { fireMosQuizEvent("MASTER_QUIZ_STEP_5", { step: 5 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_5", { step: 5 }); }
    if (step === 5) { fireMosQuizEvent("MASTER_QUIZ_STEP_6", { step: 6 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_6", { step: 6 }); }
    if (step === 6) { fireMosQuizEvent("MASTER_QUIZ_STEP_7", { step: 7 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_7", { step: 7 }); }
    if (step === 7) { fireMosQuizEvent("MASTER_QUIZ_STEP_8", { step: 8 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_8", { step: 8 }); }
    if (step === 8) { fireMosQuizEvent("MASTER_QUIZ_STEP_9", { step: 9 }); fireApplyQuizEvent("APPLY_QUIZ_STEP_9", { step: 9 }); }
    if (step >= 1) {
      // 2 steps completed → high-intent signal
      recordIntentSignal("quiz_step_2");
      fireApplyQuizEvent("APPLY_HIGH_INTENT", { trigger: "quiz_step_2" });
    }
  }, [step]);

  // MOS additive layer — fire MASTER_QUIZ_DROPOFF if user leaves mid-quiz.
  useEffect(() => {
    const onLeave = () => {
      if (step >= 0 && step < total) {
        fireMosQuizEvent("MASTER_QUIZ_DROPOFF", { step, total });
        fireApplyQuizEvent("APPLY_QUIZ_DROPOFF", { step, total });
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [step, total]);

  const currentQ =
    step >= 0 && step < total ? questions[step] : null;

  const progress = useMemo(() => {
    if (step < 0) return 0;
    if (step >= total) return 100;
    return Math.round(((step + 1) / total) * 100);
  }, [step, total]);

  const handleAnswer = (optionIndex: number) => {
    if (!currentQ) return;
    setActiveIdx(optionIndex);

    // Fix B — Per-Answer-Tracking (additiv, ändert keine bestehende Logik).
    // Schreibt question_index/question_text/option_label/value/score-Impact in event_logs.
    try {
      const opt = currentQ.options[optionIndex];
      trackFunnelEvent("quiz_answer", {
        ...eventBasePayload,
        question_index: step,            // 0-indexed
        question_number: step + 1,       // 1-indexed (für Dashboards)
        question_id: currentQ.id,
        question_text: currentQ.question,
        option_index: optionIndex,
        option_label: opt?.label ?? null,
        value: opt?.value ?? null,
        hard_block: opt?.flag === "hard_block",
        ab_variant: applyV2 ? "v2" : "v1",
      });
    } catch { /* never throw */ }

    setTimeout(() => {
      const next: Selection[] = [
        ...selections.filter((s) => s.id !== currentQ.id),
        { id: currentQ.id, optionIndex },
      ];
      setSelections(next);
      setActiveIdx(null);
      if (step + 1 < total) {
        setStep(step + 1);
      } else if (isMosQuiz && avatarPhase === null) {
        // MOS gate: avatar filter sits between last Q and lead capture.
        // Never affects non-MOS sessions and never skips lead capture.
        setAvatarPhase("questions");
      } else {
        setStep(STEP_CAPTURE);
      }
    }, 220);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleLeadCaptured = async (capture: { name: string; email: string; phone: string; leadId?: string; verdict?: Record<string, unknown> }) => {
    setStep(STEP_PROCESSING);
    const result = calculateApplyResult(selections, applyV2);
    const fallbackVerdict = {
      lead_id: capture.leadId,
      quiz_score: result.score,
      lead_score: result.score,
      lead_quality: result.bucket === "high" ? "A" : result.bucket === "mid" ? "B" : "C",
      qualification_bucket: result.bucket,
    };
    const serverVerdict = capture.verdict ?? fallbackVerdict;
    const verdict = persistLeadVerdict(serverVerdict, capture);
    const resolvedBucket =
      verdict.qualificationBucket === "high" || verdict.qualificationBucket === "mid" || verdict.qualificationBucket === "low"
        ? verdict.qualificationBucket
        : result.bucket;
    const resolvedLeadQuality =
      verdict.leadQuality ?? (resolvedBucket === "high" ? "A" : resolvedBucket === "mid" ? "B" : "C");
    const resolvedScore = verdict.quizScore ?? verdict.leadScore ?? result.score;
    const isQualified = resolvedBucket === "high" || resolvedBucket === "mid" || resolvedLeadQuality === "A" || resolvedLeadQuality === "B";
    const leadId = verdict.leadId ?? capture.leadId ?? null;

    // Persist context from server truth, not stale client-only snapshots.
    localStorage.setItem("quiz_funnel", FUNNEL_ID);
    localStorage.setItem("quiz_completed_at", new Date().toISOString());
    if (result.hardBlocked && (resolvedBucket === "low" || resolvedLeadQuality === "C")) {
      localStorage.setItem("qualification_hard_blocked", "true");
    } else {
      localStorage.removeItem("qualification_hard_blocked");
    }

    if (!outcomeTrackedRef.current) {
      outcomeTrackedRef.current = true;
      const outcomePayload = {
        ...eventBasePayload,
        lead_id: leadId,
        qualification_score: resolvedScore,
        quiz_score: resolvedScore,
        lead_score: verdict.leadScore ?? resolvedScore,
        lead_quality: resolvedLeadQuality,
        qualification_bucket: resolvedBucket,
        hard_blocked: result.hardBlocked,
        answers_count: result.answers.length,
      };

      await Promise.all([
        trackFunnelEvent("quiz_completed", outcomePayload),
        trackFunnelEvent(isQualified ? "qualified" : "not_qualified", {
          ...outcomePayload,
          bucket: resolvedBucket,
          score: resolvedScore,
        }),
      ]);
    }

    // Persist submission (compatible with existing schema)
    try {
      const quizSessionId =
        localStorage.getItem("quiz_session_id") || sessionId || crypto.randomUUID();
      localStorage.setItem("quiz_session_id", quizSessionId);
      const submissionId = crypto.randomUUID();
      localStorage.setItem("quiz_submission_id", submissionId);

      await supabase.from("quiz_submissions").insert({
        id: submissionId,
        session_id: quizSessionId,
        funnel_source: FUNNEL_ID,
        answers_json: result.answers,
        scores_json: { score: resolvedScore, bucket: resolvedBucket, hard_blocked: result.hardBlocked },
        final_segment: resolvedBucket,
        quiz_score: resolvedScore,
        ...(leadId ? { lead_id: leadId } : {}),
      } as never);
    } catch (err) {
      console.error("[ApplyQuiz] submission save error:", err);
    }

    // Fire-and-forget: deliver the cohort-correct Ethical Closing Playbook PDF.
    // Audience is resolved client-side (UTM/sticky) so men get the men variant
    // and everyone else gets the women variant. Idempotent per (lead, template).
    try {
      const audience = getApplyAudience();
      const isMen = audience === "male_ambition";
      const downloadUrl = isMen
        ? "https://www.ethicalcloser.de/playbooks/ethical-closing-playbook-men.pdf"
        : "https://www.ethicalcloser.de/playbooks/ethical-closing-playbook-women.pdf";
      const idempotencyKey = `ethical-closing-playbook-${leadId ?? capture.email}-${audience}`;
      void supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "lp-ethical-closing-playbook",
          recipientEmail: capture.email,
          idempotencyKey,
          templateData: {
            name: capture.name?.split(" ")[0] ?? undefined,
            audience,
            downloadUrl,
          },
        },
      });
    } catch (err) {
      console.warn("[ApplyQuiz] playbook send failed:", err);
    }

    // Apply v2 · Item 4 — Low-bucket nurture (T+1d / T+3d / T+14d).
    // Fire-and-forget. Idempotent via (email, stage) unique constraint.
    if (resolvedBucket === "low" || resolvedLeadQuality === "C") {
      try {
        void supabase.functions.invoke("apply-nurture-enqueue", {
          body: {
            lead_id: leadId,
            email: capture.email,
            name: capture.name ?? null,
            bucket: resolvedBucket,
          },
        });
      } catch (err) {
        console.warn("[ApplyQuiz] nurture enqueue failed:", err);
      }
    }

    setTimeout(async () => {
      // V3: NO dead-end. All buckets (incl. low / hard_blocked) route into
      // /booking-{aud}. Low/early-stage leads receive the orientation calendar
      // automatically via useLeadQuality.calendarType === "orientation". The
      // legacy /quiz/low-result page is no longer in the routing graph and
      // exists only as a redirect for safety.
      let tokenParam = "";
      if (leadId) {
        const token = await generateBookingToken(leadId);
        if (token) tokenParam = `&token=${encodeURIComponent(token)}`;
      }

      // Audience-aware booking redirect: men → /booking-men, women → /booking-women.
      let isMenRedirect = isMale;
      try {
        const audParam = (new URLSearchParams(window.location.search).get("aud") || "").toLowerCase();
        if (["men", "male", "ambition", "career", "karriere", "m"].includes(audParam)) {
          isMenRedirect = true;
        } else if (["women", "female", "default", "f", "w"].includes(audParam)) {
          isMenRedirect = false;
        }
      } catch { /* never throw */ }
      const bookingBase = isMenRedirect ? "/booking-men" : "/booking-women";

      // Map bucket → calendar-type query hint (Booking page also derives this
      // from useLeadQuality, this is purely an attribution / copy hint).
      const qParam = resolvedBucket === "high" ? "high" : resolvedBucket === "mid" ? "mid" : "low";
      const callTypeHint =
        resolvedBucket === "low" || resolvedLeadQuality === "C" ? "&type=orientation" : "";
      // V2 additive: high-intent + 30-day velocity → priority slot hint.
      // Booking page may use this as a soft signal; never breaks routing.
      const priorityHint =
        applyV2 && result.velocity === "30d" && resolvedBucket === "high" ? "&priority=1" : "";
      // MOS additive: preserve funnel identity in the redirect — men coming
      // from /masterofsales keep `src=masterofsales`, never get rewritten to
      // `src=apply`. Women / direct /apply keep the original `src=apply`.
      const attrSrc = (typeof window !== "undefined"
        ? window.sessionStorage.getItem("etc_attribution_source_v1")
        : null) || "";
      const srcParam = isMenRedirect && attrSrc.startsWith("masterofsales") ? "masterofsales" : "apply";
      const destination = routeForVerdict(
        { ...verdict, qualificationBucket: resolvedBucket, leadQuality: resolvedLeadQuality },
        {
          defaultPath: `${bookingBase}?src=${srcParam}&q=${qParam}${priorityHint}${tokenParam}`,
          // Low override → still booking, orientation calendar, expectation setting.
          lowPath: `${bookingBase}?src=${srcParam}&q=low${callTypeHint}${tokenParam}`,
        },
      );
      if (isMenRedirect) {
        try { trackFunnelEvent("quiz_completed_men", { funnel: "masterofsales", session_id: sessionId }); } catch { /* noop */ }
        fireMosQuizEvent("MASTER_QUIZ_COMPLETED", { bucket: resolvedBucket });
      } else {
        try { trackFunnelEvent("quiz_completed_women", { funnel: "apply", session_id: sessionId }); } catch { /* noop */ }
      }
      // APPLY_* canonical completion — gated to non-masterofsales sessions inside the helper.
      fireApplyQuizEvent("APPLY_QUIZ_COMPLETED", { bucket: resolvedBucket });
      navigate(destination);
    }, 600);
  };


  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10 md:py-16">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {copy.topbar}
          </p>
          {step > 0 && step < total && (
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1 font-sans text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Zurück
            </button>
          )}
        </div>

        {/* Progress */}
        {step >= 0 && step < total && (
          isMosQuiz ? (
            <ProgressVariant variant={progressAb.variant} step={step} total={total} />
          ) : (
            <div className="mt-6">
              <div className="h-px w-full bg-border/40">
                <motion.div
                  className="h-px bg-foreground"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
              <p className="mt-3 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Schritt {step + 1} von {total} · 40 Sekunden
              </p>
            </div>
          )
        )}

        <div className="flex flex-1 items-center">
          <div className="w-full">
            <AnimatePresence mode="wait">
              {step === -1 && !showTransition && !showSoftEntry && !showInstantQ1 && (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-8"
                >
                  <h1 className="font-serif text-3xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
                    {copy.introTitle1}
                    <br />
                    <span className="text-muted-foreground">
                      {copy.introTitle2}
                    </span>
                  </h1>
                  <p className="max-w-xl font-serif text-lg leading-relaxed text-foreground/80 md:text-xl">
                    {copy.introBody}
                  </p>
                  <button
                    onClick={() => {
                      trackFunnelEvent("quiz_started", eventBasePayload);
                      if (isMale) {
                        try { trackFunnelEvent("quiz_started_men", { funnel: "masterofsales", session_id: sessionId }); } catch { /* noop */ }
                      }
                      // MOS additive: high-intent signal + canonical MASTER event
                      recordIntentSignal("quiz_started");
                      fireMosQuizEvent("MASTER_QUIZ_STARTED");
                      fireApplyQuizEvent("APPLY_QUIZ_STARTED");
                      // Soft entry (non-scoring) → transition → Q1, MOS-only.
                      if (isMosQuiz && q1SoftAb.variant === "on") {
                        setShowSoftEntry(true);
                      } else if (isMosQuiz) {
                        setShowTransition(true);
                        window.setTimeout(() => {
                          setShowTransition(false);
                          setStep(0);
                        }, 1500);
                      } else {
                        setStep(0);
                      }
                    }}
                    className="group inline-flex items-center gap-3 rounded-sm bg-foreground px-10 py-4 font-sans text-sm font-medium tracking-wide text-background transition-all hover:bg-foreground/90"
                  >
                    {copy.introCta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                  {isMosQuiz && <QuizOutcomePreview variant={benefitAb.variant} />}
                  <p className="font-sans text-xs text-muted-foreground/70">
                    {copy.footer}
                  </p>
                </motion.div>
              )}

              {showSoftEntry && (
                <motion.div
                  key="soft-entry"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <SoftEntryQuestion
                    onContinue={() => {
                      setShowSoftEntry(false);
                      setShowTransition(true);
                      window.setTimeout(() => {
                        setShowTransition(false);
                        setStep(0);
                      }, 1200);
                    }}
                  />
                </motion.div>
              )}

              {showTransition && (
                <motion.div
                  key="transition"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="space-y-8"
                >
                  <QuizTransitionScreen total={total} />
                </motion.div>
              )}

              {/* Hero-Simplification Sprint — instant Q1 (MOS only).
                  Non-scoring; routes user into canonical quiz step 0. */}
              {showInstantQ1 && step === -1 && (
                <motion.div
                  key="instant-q1"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8"
                >
                  <MosInstantQ1
                    variant={instantQ1Ab.variant}
                    onContinue={() => {
                      setShowInstantQ1(false);
                      setStep(0);
                    }}
                  />
                </motion.div>
              )}

              {currentQ && step >= 0 && step < total && (
                <motion.div
                  key={`q-${step}`}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8"
                >
                  {isMosQuiz && step === 0 && commitmentAb.variant === "on" && <QuizCommitmentBlock />}
                  <div className="space-y-3">

                    {prefillApplied && step === 0 && (
                      <p
                        role="status"
                        aria-live="polite"
                        className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-muted/40 px-3 py-1 font-sans text-xs text-muted-foreground"
                      >
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                        Deine Auswahl ist übernommen — weiter mit Frage 1.
                      </p>
                    )}
                    <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight md:text-4xl">
                      {currentQ.question}
                    </h2>
                    {currentQ.subtitle && (
                      <p className="font-serif text-base leading-relaxed text-muted-foreground md:text-lg">
                        {currentQ.subtitle}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    {currentQ.options.map((opt, idx) => {
                      const isActive = activeIdx === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleAnswer(idx)}
                          className={cn(
                            "group flex w-full items-center justify-between gap-4 rounded-sm border px-5 py-5 text-left font-serif text-base transition-all md:text-lg",
                            "active:scale-[0.99]",
                            isActive
                              ? "border-foreground bg-foreground text-background"
                              : "border-border/60 bg-background hover:border-foreground hover:bg-muted/40",
                          )}
                        >
                          <span>{opt.label}</span>
                          <ArrowRight
                            className={cn(
                              "h-4 w-4 shrink-0 transition-transform",
                              isActive
                                ? "translate-x-1"
                                : "opacity-40 group-hover:translate-x-1 group-hover:opacity-100",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                  {isMosQuiz && (
                    <AnticipationCaption
                      variant={anticipationAb.variant}
                      step={step}
                      total={total}
                    />
                  )}
                </motion.div>
              )}

              {/* MOS Avatar Filter — between last quiz Q and lead capture.
                  Pure additive; only runs when isMosQuiz && avatarPhase set. */}
              {isMosQuiz && avatarPhase === "questions" && step !== STEP_CAPTURE && step !== STEP_PROCESSING && (
                <motion.div
                  key="avatar-questions"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35 }}
                  className="space-y-8"
                >
                  <AvatarFilterQuestions
                    onComplete={(r) => {
                      setAvatarResult(r);
                      if (r.decision.kind === "redirect_globalcloser") {
                        setAvatarPhase("interstitial");
                      } else {
                        setAvatarPhase(null);
                        setStep(STEP_CAPTURE);
                      }
                    }}
                  />
                </motion.div>
              )}

              {isMosQuiz && avatarPhase === "interstitial" && avatarResult && (
                <motion.div
                  key="avatar-interstitial"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35 }}
                  className="space-y-8"
                >
                  <GlobalCloserInterstitial
                    variant={avatarCopyAb.variant}
                    routingReason={avatarResult.decision.reason}
                    devScore={avatarResult.devScore}
                    cluster={avatarResult.cluster}
                    onStay={() => {
                      setAvatarPhase(null);
                      setStep(STEP_CAPTURE);
                    }}
                  />
                </motion.div>
              )}


              {step === STEP_CAPTURE && (
                <motion.div
                  key="capture"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-8"
                >
                  <div className="space-y-3">
                    <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
                      Letzter Schritt.
                    </h2>
                    {isMosQuiz && <MosCommitmentLine />}
                    <p className="font-serif text-base leading-relaxed text-muted-foreground md:text-lg">
                      Damit wir dir deine persönliche Auswertung schicken und
                      dich bei Rückfragen erreichen können.
                    </p>
                  </div>
                  <LeadCaptureGate
                    funnelName={FUNNEL_ID}
                    buttonClass="bg-foreground text-background hover:bg-foreground/90"
                    quizAnswers={buildServerQuizAnswers(calculateApplyResult(selections, applyV2))}
                    extraEventPayload={eventBasePayload}
                    onLeadCaptured={handleLeadCaptured}
                  />
                </motion.div>
              )}

              {step === STEP_PROCESSING && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-6 text-center"
                >
                  <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-foreground/10" />
                  <h2 className="font-serif text-2xl font-semibold tracking-tight">
                    Wir bereiten deine Auswertung vor.
                  </h2>
                  <p className="font-sans text-sm text-muted-foreground">
                    Einen Moment…
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <p className="mt-12 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
          Nicht für jeden. Aber vielleicht für dich.
        </p>
      </div>
    </main>
  );
}
