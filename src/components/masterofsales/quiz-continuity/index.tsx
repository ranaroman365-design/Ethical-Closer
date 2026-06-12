/**
 * MOS Quiz Continuity & Conversion Optimization Layer — fully additive.
 *
 * Active only when `isMosQuizSession()` returns true (attribution_source
 * starts with "masterofsales" OR sticky male_ambition cohort).
 *
 * EXISTING (do not remove):
 *  - MOS_QUIZ_HERO_HEADLINE / MOS_QUIZ_SUBHEADLINE / MOS_QUIZ_CTA
 *  - HEADLINE_COPY / SUB_COPY / CTA_COPY
 *  - QuizOutcomePreview, QuizCommitmentBlock, QuizTransitionScreen
 *  - trackHeroVariantView (MASTER_QUIZ_HERO_VARIANT_VIEW)
 *
 * NEW (purely additive, never break quiz/CRM/pixel/CAPI/routing):
 *  - Extended headline pool (4 variants) + subheadline pool (3 variants)
 *  - MOS_COMMITMENT_TOGGLE (on/off)
 *  - MOS_PROGRESS_STYLE (classic/segment/circle)
 *  - MOS_QUIZ_Q1_SOFT (on/off)        — soft non-scoring entry question
 *  - MOS_RESULT_ANTICIPATION (4 copy variants under each question)
 *  - MOS_BENEFIT_STACK (richtung/passung/empfehlung)
 *  - MOS_QUIZ_LENGTH (full/short)     — telemetry-only experiment slot
 *  - Components: <ProgressVariant />, <AnticipationCaption />,
 *                <BenefitStack />, <SoftEntryQuestion />
 *  - Once-per-session events:
 *      MASTER_QUIZ_HERO_VIEW
 *      MASTER_COMMITMENT_VIEW
 *      MASTER_PROGRESS_VARIANT_VIEW
 *      MASTER_QUIZ_LENGTH_VIEW
 *      MASTER_QUESTION1_VARIANT_VIEW
 *      MASTER_RESULT_PREVIEW_VIEW
 */
import { useEffect, useRef, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getAttributionSource } from "@/lib/attribution-source";
import { getActiveSlotSummary, type AbSlotDef } from "@/lib/ab-multivariant";
import { cn } from "@/lib/utils";

export function isMosQuizSession(isMale: boolean): boolean {
  if (typeof window === "undefined") return false;
  const src = getAttributionSource();
  return (!!src && src.startsWith("masterofsales")) || isMale;
}

// ─── A/B Slots ───────────────────────────────────────────────────────────
export const MOS_QUIZ_HERO_HEADLINE: AbSlotDef = {
  slot: "mos_quiz_hero_headline",
  variants: [
    { id: "richtungs_check", baseWeight: 1 },
    { id: "potenzial_check", baseWeight: 1 },
    { id: "klarheit_90s", baseWeight: 1 },
    { id: "richtung_motivation", baseWeight: 1 },
  ],
};

export const MOS_QUIZ_SUBHEADLINE: AbSlotDef = {
  slot: "mos_quiz_subheadline",
  variants: [
    { id: "5_fragen_90s", baseWeight: 1 },
    { id: "kein_druck", baseWeight: 1 },
    { id: "naechster_schritt", baseWeight: 1 },
  ],
};

export const MOS_QUIZ_CTA: AbSlotDef = {
  slot: "mos_quiz_cta",
  variants: [
    { id: "richtungs_check_starten", baseWeight: 1 },
    { id: "potenzial_pruefen", baseWeight: 1 },
  ],
};

export const MOS_COMMITMENT_TOGGLE: AbSlotDef = {
  slot: "mos_commitment_toggle",
  variants: [
    { id: "on", baseWeight: 1 },
    { id: "off", baseWeight: 1 },
  ],
};

export const MOS_PROGRESS_STYLE: AbSlotDef = {
  slot: "mos_progress_style",
  variants: [
    { id: "classic", baseWeight: 1 },
    { id: "segment", baseWeight: 1 },
    { id: "circle", baseWeight: 1 },
  ],
};

export const MOS_QUIZ_Q1_SOFT: AbSlotDef = {
  slot: "mos_quiz_q1_soft",
  variants: [
    { id: "on", baseWeight: 1 },
    { id: "off", baseWeight: 1 },
  ],
};

export const MOS_RESULT_ANTICIPATION: AbSlotDef = {
  slot: "mos_result_anticipation",
  variants: [
    { id: "berechnet", baseWeight: 1 },
    { id: "noch_n_schritte", baseWeight: 1 },
    { id: "analyse", baseWeight: 1 },
    { id: "empfehlung", baseWeight: 1 },
  ],
};

export const MOS_BENEFIT_STACK: AbSlotDef = {
  slot: "mos_benefit_stack",
  variants: [
    { id: "richtung", baseWeight: 1 },
    { id: "passung", baseWeight: 1 },
    { id: "empfehlung", baseWeight: 1 },
  ],
};

// Telemetry-only: actual question reduction is owned by apply-qualification.
// Slot exists so the Winner Engine can correlate cohort vs. length later.
export const MOS_QUIZ_LENGTH: AbSlotDef = {
  slot: "mos_quiz_length",
  variants: [
    { id: "full", baseWeight: 1 },
    { id: "short", baseWeight: 0 }, // disabled at runtime until questions support it
  ],
};

// Brief-spec slot — copy variants for the GlobalCloser interstitial.
export const MOS_AVATAR_FILTER_COPY: AbSlotDef = {
  slot: "mos_avatar_filter_copy",
  variants: [
    { id: "control", baseWeight: 1 },
    { id: "alt", baseWeight: 1 },
  ],
};

// ─── Copy pools ──────────────────────────────────────────────────────────
export const HEADLINE_COPY: Record<string, { title1: string; title2: string }> = {
  richtungs_check: { title1: "Dein Richtungs-Check", title2: "in 5 Fragen." },
  potenzial_check: { title1: "Entdecke dein Potenzial", title2: "in 5 kurzen Fragen." },
  klarheit_90s: { title1: "In 90 Sekunden", title2: "zu mehr Klarheit." },
  richtung_motivation: {
    title1: "Vielleicht fehlt dir nicht Motivation.",
    title2: "Vielleicht fehlt dir Richtung.",
  },
};

export const SUB_COPY: Record<string, string> = {
  "5_fragen_90s":
    "Beantworte 5 kurze Fragen und erhalte eine persönliche Einschätzung.",
  kein_druck:
    "Kein Verkaufsgespräch. Keine Bewerbung. Nur Klarheit.",
  naechster_schritt:
    "Finde heraus, welcher nächste Schritt aktuell für dich sinnvoll ist.",
};

export const CTA_COPY: Record<string, string> = {
  richtungs_check_starten: "Richtungs-Check starten",
  potenzial_pruefen: "Potenzial prüfen",
};

const ANTICIPATION_COPY: Record<string, (stepsLeft: number) => string> = {
  berechnet: () => "Dein Ergebnis wird gerade berechnet …",
  noch_n_schritte: (n) =>
    n <= 1 ? "Fast geschafft." : `Noch ${n} Schritte bis zu deiner Auswertung.`,
  analyse: () => "Wir analysieren gerade deine Antworten.",
  empfehlung: () => "Du erhältst gleich deine persönliche Empfehlung.",
};

const BENEFIT_STACKS: Record<string, string[]> = {
  richtung: [
    "Wo du aktuell stehst",
    "Welche Stärken sichtbar werden",
    "Welcher nächste Schritt sinnvoll sein könnte",
  ],
  passung: [
    "Ob Remote Sales aktuell zu dir passt",
    "Welche Rolle am besten zu dir passt",
    "Was dein sinnvollster nächster Schritt ist",
  ],
  empfehlung: [
    "Eine ehrliche Einordnung",
    "Eine klare Richtung",
    "Eine konkrete Empfehlung für deinen nächsten Schritt",
  ],
};

// ─── Event helpers ───────────────────────────────────────────────────────
const FIRED_KEY = "mos_quiz_opt_events_v1";

function isMos(): boolean {
  if (typeof window === "undefined") return false;
  const src = getAttributionSource();
  return !!src && src.startsWith("masterofsales");
}

function fireOnce(key: string, name: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    // Per-event dedup via sessionStorage (independent from canonical fired set).
    const raw = sessionStorage.getItem(FIRED_KEY);
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    if (set.has(key)) return;
    set.add(key);
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...set]));
    trackFunnelEvent(name, {
      funnel: "masterofsales",
      source: getAttributionSource(),
      ab_slots: getActiveSlotSummary(),
      ...payload,
    });
  } catch {
    /* noop */
  }
}

export function trackHeroVariantView(headline: string, sub: string, cta: string) {
  // Legacy event (kept identical for back-compat dashboards).
  fireOnce("mos_quiz_hero_variant_view_v1", "MASTER_QUIZ_HERO_VARIANT_VIEW", {
    hero_headline: headline,
    hero_subheadline: sub,
    hero_cta: cta,
  });
  // New canonical optimization event.
  fireOnce("mos_quiz_hero_view_v1", "MASTER_QUIZ_HERO_VIEW", {
    hero_headline: headline,
    hero_subheadline: sub,
    hero_cta: cta,
  });
}

export function trackCommitmentView(variant: "on" | "off") {
  fireOnce(`mos_commitment_view_${variant}_v1`, "MASTER_COMMITMENT_VIEW", {
    commitment_variant: variant,
  });
}

export function trackProgressVariantView(variant: string) {
  fireOnce(
    `mos_progress_variant_view_${variant}_v1`,
    "MASTER_PROGRESS_VARIANT_VIEW",
    { progress_variant: variant },
  );
}

export function trackQuizLengthView(variant: string) {
  fireOnce(`mos_quiz_length_view_${variant}_v1`, "MASTER_QUIZ_LENGTH_VIEW", {
    length_variant: variant,
  });
}

export function trackQuestion1VariantView(variant: "on" | "off") {
  fireOnce(
    `mos_question1_view_${variant}_v1`,
    "MASTER_QUESTION1_VARIANT_VIEW",
    { question1_variant: variant },
  );
  // Brief-spec alias (additive, deduped via separate key).
  fireOnce(
    `mos_quiz_q1_soft_view_${variant}_v1`,
    "MASTER_QUIZ_Q1_SOFT_VIEW",
    { question1_variant: variant },
  );
}

export function trackResultPreviewView(variant: string) {
  fireOnce(
    `mos_result_preview_view_${variant}_v1`,
    "MASTER_RESULT_PREVIEW_VIEW",
    { benefit_stack: variant },
  );
}

/** Brief-spec event: fired once per session for the active intro-mode variant. */
export function trackQuizIntroModeView(mode: string) {
  fireOnce(
    `mos_quiz_intro_mode_view_${mode}_v1`,
    "MASTER_QUIZ_INTRO_MODE_VIEW",
    { intro_mode: mode },
  );
}

/** Brief-spec event: fired once per session for the active anticipation variant. */
export function trackQuizResultAnticipationView(variant: string) {
  fireOnce(
    `mos_quiz_result_anticipation_view_${variant}_v1`,
    "MASTER_QUIZ_RESULT_ANTICIPATION_VIEW",
    { anticipation_variant: variant },
  );
}

/** Brief-spec alias for length view (one-call-per-variant dedup). */
export function trackQuizLengthVariantView(variant: string) {
  fireOnce(
    `mos_quiz_length_variant_view_${variant}_v1`,
    "MASTER_QUIZ_LENGTH_VARIANT_VIEW",
    { length_variant: variant },
  );
}

// ─── Outcome Preview (3 cards inside intro, slot-aware) ──────────────────
export const QuizOutcomePreview = ({ variant }: { variant?: string } = {}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const items = BENEFIT_STACKS[variant ?? "richtung"] ?? BENEFIT_STACKS.richtung;
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            // Back-compat
            fireOnce(
              "mos_quiz_outcome_preview_view_v1",
              "MASTER_QUIZ_OUTCOME_PREVIEW_VIEW",
              {},
            );
            // New canonical event with variant tag
            trackResultPreviewView(variant ?? "richtung");
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [variant]);
  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-3 max-w-2xl">
      <p className="sm:col-span-3 font-sans text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
        Am Ende erfährst du:
      </p>
      {items.map((t) => (
        <div
          key={t}
          className="rounded-sm border border-border/60 bg-muted/20 p-4"
        >
          <Check className="mb-2 h-4 w-4 text-foreground/70" />
          <p className="font-serif text-sm leading-snug text-foreground/85">{t}</p>
        </div>
      ))}
      <p className="sm:col-span-3 font-sans text-[11px] text-muted-foreground/70">
        Keine Versprechen. Keine Garantien. Keine Placement-Aussagen.
      </p>
    </div>
  );
};

// Alias for backwards compatibility with named-stack consumers.
export const BenefitStack = QuizOutcomePreview;

// ─── Commitment Block (above Q1) ─────────────────────────────────────────
export const QuizCommitmentBlock = () => {
  useEffect(() => {
    // Legacy
    fireOnce("mos_quiz_commitment_view_v1", "MASTER_QUIZ_COMMITMENT_VIEW", {});
    // New canonical
    trackCommitmentView("on");
  }, []);
  return (
    <div className="mb-6 rounded-sm border border-border/50 bg-muted/20 p-4">
      <p className="font-serif text-sm font-semibold text-foreground">
        Beantworte die Fragen ehrlich.
      </p>
      <p className="mt-1 font-serif text-sm text-muted-foreground">
        Je ehrlicher deine Antworten, desto genauer dein Ergebnis.
      </p>
    </div>
  );
};

// ─── Transition Screen (between intro CTA click and Q1) ──────────────────
export const QuizTransitionScreen = ({ total }: { total: number }) => {
  useEffect(() => {
    fireOnce("mos_quiz_transition_view_v1", "MASTER_QUIZ_TRANSITION_VIEW", {});
  }, []);
  return (
    <div className="space-y-8 text-center">
      <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
        Perfekt.
        <br />
        Lass uns herausfinden,
        <br />
        wo du aktuell stehst.
      </h2>
      <ul className="mx-auto inline-block space-y-2 text-left">
        {[
          `${total} kurze Fragen`,
          "ca. 90 Sekunden",
          "Keine richtigen oder falschen Antworten",
          "Keine Verpflichtung",
        ].map((t) => (
          <li
            key={t}
            className="flex items-center gap-2 font-serif text-sm text-foreground/80"
          >
            <Check className="h-4 w-4 text-foreground/60" />
            {t}
          </li>
        ))}
      </ul>
      <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Schritt 1 von {total}
      </p>
    </div>
  );
};

// ─── Progress Variant (classic | segment | circle) ───────────────────────
export const ProgressVariant = ({
  variant,
  step,
  total,
}: {
  variant: string;
  step: number;
  total: number;
}) => {
  useEffect(() => {
    trackProgressVariantView(variant);
  }, [variant]);

  const pct = total > 0 ? Math.min(100, Math.round(((step + 1) / total) * 100)) : 0;
  const stepsLeft = Math.max(0, total - (step + 1));
  const caption =
    stepsLeft <= 0
      ? "Fast geschafft."
      : stepsLeft === 1
      ? "Nur noch 1 Schritt."
      : `Noch ${stepsLeft} Schritte bis zu deiner Auswertung.`;

  if (variant === "segment") {
    return (
      <div className="mt-6">
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all",
                i <= step ? "bg-foreground" : "bg-border/50",
              )}
            />
          ))}
        </div>
        <p className="mt-3 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Schritt {step + 1} von {total} · {caption}
        </p>
      </div>
    );
  }

  if (variant === "circle") {
    const r = 16;
    const c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    return (
      <div className="mt-6 flex items-center gap-4">
        <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
          <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth="3"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={c * 0.25}
            strokeLinecap="round"
          />
          <text
            x="22"
            y="26"
            textAnchor="middle"
            className="fill-foreground font-sans text-[10px] font-medium"
          >
            {pct}%
          </text>
        </svg>
        <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Schritt {step + 1} von {total} · {caption}
        </p>
      </div>
    );
  }

  // classic (default — visually identical to existing bar)
  return (
    <div className="mt-6">
      <div className="h-px w-full bg-border/40">
        <div
          className="h-px bg-foreground transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Schritt {step + 1} von {total} · {caption}
      </p>
    </div>
  );
};

// ─── Anticipation caption (under each question) ──────────────────────────
export const AnticipationCaption = ({
  variant,
  step,
  total,
}: {
  variant: string;
  step: number;
  total: number;
}) => {
  const stepsLeft = Math.max(1, total - (step + 1));
  const fn = ANTICIPATION_COPY[variant] ?? ANTICIPATION_COPY.empfehlung;
  return (
    <p className="mt-3 font-sans text-[11px] italic text-muted-foreground/70">
      {fn(stepsLeft)}
    </p>
  );
};

// ─── Soft non-scoring entry question (between intro and Q1) ──────────────
// Brief-spec'd options: Richtung / Perspektive / Ortsunabhängigkeit /
// Fähigkeiten / Potenzial. Pre-quiz language strictly avoids Bewerbung,
// Call, Readiness, Assessment, Placement.
const SOFT_ENTRY_OPTIONS = [
  "Ich möchte mich beruflich weiterentwickeln",
  "Ich suche nach einer neuen Perspektive",
  "Ich möchte ortsunabhängiger arbeiten",
  "Ich möchte neue Fähigkeiten aufbauen",
  "Ich möchte mehr aus meinem Potenzial machen",
];

export const SoftEntryQuestion = ({
  onContinue,
}: {
  onContinue: (answer: string) => void;
}) => {
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    trackQuestion1VariantView("on");
  }, []);

  const handlePick = (i: number) => {
    setPicked(i);
    const label = SOFT_ENTRY_OPTIONS[i];
    try {
      trackFunnelEvent("MASTER_SOFT_ENTRY_ANSWER", {
        funnel: "masterofsales",
        source: getAttributionSource(),
        option_index: i,
        option_label: label,
      });
    } catch { /* noop */ }
    window.setTimeout(() => onContinue(label), 220);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight md:text-4xl">
          Welche Situation beschreibt dich aktuell am besten?
        </h2>
        <p className="font-serif text-base leading-relaxed text-muted-foreground md:text-lg">
          Keine richtige oder falsche Antwort — wir nutzen das nur zur
          Orientierung.
        </p>
      </div>
      <div className="space-y-3">
        {SOFT_ENTRY_OPTIONS.map((opt, idx) => {
          const isActive = picked === idx;
          return (
            <button
              key={idx}
              onClick={() => handlePick(idx)}
              className={cn(
                "group flex w-full items-center justify-between gap-4 rounded-sm border px-5 py-5 text-left font-serif text-base transition-all md:text-lg",
                "active:scale-[0.99]",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 bg-background hover:border-foreground hover:bg-muted/40",
              )}
            >
              <span>{opt}</span>
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
    </div>
  );
};
