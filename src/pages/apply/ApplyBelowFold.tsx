/**
 * ApplyBelowFold — every section of /apply that is NOT the hero.
 *
 * Code-split out of ApplyLanding.tsx to keep the initial JS chunk tiny
 * (mobile LCP/FCP win). Mounted lazily by the parent only after the
 * `belowFoldReady` gate fires (idle / scroll / touch / pointer).
 *
 * NO copy / design / tracking / funnel changes — pure structural move.
 * Helpers `Section`, `Eyebrow`, `H2`, `Body`, `SectionImage` and all
 * non-hero image imports live here so they never enter the hero chunk.
 */
import { lazy, Suspense, type RefObject } from "react";
import TransformationStories from "@/components/apply/TransformationStories";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Star, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import testimonialSteffi from "@/assets/testimonial-sarah-128w.webp";
import testimonialLeon from "@/assets/testimonial-leon-128w.webp";
import testimonialDaniel from "@/assets/testimonial-daniel-128w.webp";

import problemOfficeImgWebp from "@/assets/apply-problem-office.webp";
import problemOfficeImg768Avif from "@/assets/apply-problem-office-768w.avif";
import problemOfficeImg1280Avif from "@/assets/apply-problem-office-1280w.avif";
import problemOfficeImg768Webp from "@/assets/apply-problem-office-768w.webp";
import problemOfficeImg1280Webp from "@/assets/apply-problem-office-1280w.webp";
import opportunityCalmImgWebp from "@/assets/apply-opportunity-calm.webp";
import opportunityCalmImg768Avif from "@/assets/apply-opportunity-calm-768w.avif";
import opportunityCalmImg1280Avif from "@/assets/apply-opportunity-calm-1280w.avif";
import opportunityCalmImg768Webp from "@/assets/apply-opportunity-calm-768w.webp";
import opportunityCalmImg1280Webp from "@/assets/apply-opportunity-calm-1280w.webp";
import systemCallImgWebp from "@/assets/apply-system-call.webp";
import systemCallImg768Avif from "@/assets/apply-system-call-768w.avif";
import systemCallImg1280Avif from "@/assets/apply-system-call-1280w.avif";
import systemCallImg768Webp from "@/assets/apply-system-call-768w.webp";
import systemCallImg1280Webp from "@/assets/apply-system-call-1280w.webp";
import selectionPortraitImgWebp from "@/assets/apply-selection-portrait.webp";
import selectionPortraitImg768Avif from "@/assets/apply-selection-portrait-768w.avif";
import selectionPortraitImg1280Avif from "@/assets/apply-selection-portrait-1280w.avif";
import selectionPortraitImg768Webp from "@/assets/apply-selection-portrait-768w.webp";
import selectionPortraitImg1280Webp from "@/assets/apply-selection-portrait-1280w.webp";
import quizDecisionImgWebp from "@/assets/apply-quiz-decision.webp";
import quizDecisionImg768Avif from "@/assets/apply-quiz-decision-768w.avif";
import quizDecisionImg1280Avif from "@/assets/apply-quiz-decision-1280w.avif";
import quizDecisionImg768Webp from "@/assets/apply-quiz-decision-768w.webp";
import quizDecisionImg1280Webp from "@/assets/apply-quiz-decision-1280w.webp";

import type { ApplyAbBucket, ApplyAbVariant } from "@/lib/apply-ab-test";
import { APPLY_AB_TEST_KEY, APPLY_AB_COPY } from "@/lib/apply-ab-test";
import { trackFunnelEvent } from "@/lib/track-event";

// FooterSection stays its own chunk for further reuse.
const FooterSection = lazy(() => import("@/components/landing/FooterSection"));

const FUNNEL_ID = "apply";

const problemOfficeImg = problemOfficeImgWebp;
const opportunityCalmImg = opportunityCalmImgWebp;
const systemCallImg = systemCallImgWebp;
const selectionPortraitImg = selectionPortraitImgWebp;
const quizDecisionImg = quizDecisionImgWebp;

const RESPONSIVE_VARIANTS: Record<
  string,
  { avif768: string; avif1280: string; webp768: string; webp1280: string }
> = {
  [problemOfficeImg]: {
    avif768: problemOfficeImg768Avif,
    avif1280: problemOfficeImg1280Avif,
    webp768: problemOfficeImg768Webp,
    webp1280: problemOfficeImg1280Webp,
  },
  [opportunityCalmImg]: {
    avif768: opportunityCalmImg768Avif,
    avif1280: opportunityCalmImg1280Avif,
    webp768: opportunityCalmImg768Webp,
    webp1280: opportunityCalmImg1280Webp,
  },
  [systemCallImg]: {
    avif768: systemCallImg768Avif,
    avif1280: systemCallImg1280Avif,
    webp768: systemCallImg768Webp,
    webp1280: systemCallImg1280Webp,
  },
  [selectionPortraitImg]: {
    avif768: selectionPortraitImg768Avif,
    avif1280: selectionPortraitImg1280Avif,
    webp768: selectionPortraitImg768Webp,
    webp1280: selectionPortraitImg1280Webp,
  },
  [quizDecisionImg]: {
    avif768: quizDecisionImg768Avif,
    avif1280: quizDecisionImg1280Avif,
    webp768: quizDecisionImg768Webp,
    webp1280: quizDecisionImg1280Webp,
  },
};

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const Section = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={`border-b border-border/40 px-6 py-24 md:py-32 [content-visibility:auto] [contain-intrinsic-size:1px_1200px] ${className}`}
  >
    <div className="mx-auto max-w-3xl">{children}</div>
  </section>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-6 font-sans text-[11px] font-medium uppercase tracking-[0.25em] text-accent">
    {children}
  </p>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl">
    {children}
  </h2>
);

const Body = ({ children }: { children: React.ReactNode }) => (
  <p className="font-serif text-lg leading-relaxed text-foreground/80 md:text-xl">
    {children}
  </p>
);

const SectionImage = ({
  src,
  srcWebp,
  alt,
  position = "below-headline",
  priority = false,
  focal = "center",
}: {
  src: string;
  srcWebp?: string;
  alt: string;
  position?: "below-headline" | "above-headline";
  priority?: boolean;
  focal?: "center" | "top" | "bottom" | "left" | "right";
}) => {
  const focalClass = {
    center: "object-center",
    top: "object-top",
    bottom: "object-bottom",
    left: "object-left",
    right: "object-right",
  }[focal];
  const imgClass = `aspect-[16/9] w-full saturate-50 contrast-110 object-cover ${focalClass}`;
  const variants = RESPONSIVE_VARIANTS[src];
  const sizes = "(max-width: 767px) 100vw, 720px";
  return (
    <figure
      className={`${position === "above-headline" ? "mb-10" : "mt-10 mb-2"} overflow-hidden rounded-sm border border-border/40 bg-muted/30`}
      aria-hidden={alt ? undefined : true}
    >
      <picture>
        {variants ? (
          <>
            <source
              type="image/avif"
              sizes={sizes}
              srcSet={`${variants.avif768} 768w, ${variants.avif1280} 1280w`}
            />
            <source
              type="image/webp"
              sizes={sizes}
              srcSet={`${variants.webp768} 768w, ${variants.webp1280} 1280w${srcWebp ? `, ${srcWebp} 1920w` : ""}`}
            />
          </>
        ) : srcWebp ? (
          <source srcSet={srcWebp} type="image/webp" />
        ) : null}
        <img
          src={src}
          alt={alt}
          width={1920}
          height={1080}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          {...(priority ? { fetchpriority: "high" as const } : {})}
          className={imgClass}
        />
      </picture>
    </figure>
  );
};

interface ApplyCtaTrackingMeta {
  section?: string;
  variant?: string;
  abBucket?: ApplyAbBucket;
}

export interface ApplyBelowFoldProps {
  /** Forwarded to the social-proof section so the parent's IntersectionObserver still binds. */
  socialProofRef: RefObject<HTMLElement>;
  /** Active A/B copy bucket (resolved by parent). */
  abBucket: ApplyAbBucket;
  /** Active A/B copy table (parent-derived from variant). */
  abCopy: (typeof APPLY_AB_COPY)[ApplyAbVariant];
  /** Primary CTA renderer — kept in parent so it ships with the hero chunk. */
  ApplyCTA: React.ComponentType<{
    label?: string;
    variant?: "primary" | "accent";
    location?: string;
  }>;
  /** Tracking helper — re-used so cta_type stays consistent across chunks. */
  handleApplyCtaClick: (location: string, meta?: ApplyCtaTrackingMeta) => void;
}

export default function ApplyBelowFold({
  socialProofRef,
  abBucket,
  abCopy,
  ApplyCTA,
  handleApplyCtaClick,
}: ApplyBelowFoldProps) {
  return (
    <>
      {/* 1.25 FRAME-SHIFT + OUTCOME CLARITY */}
      <section className="border-b border-border/40 px-6 py-16 md:py-24">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2 md:gap-14">
          <div>
            <Eyebrow>Application frame</Eyebrow>
            <h2 className="mt-3 font-serif text-2xl font-semibold leading-[1.15] tracking-tight text-foreground md:text-3xl">
              Das ist kein normales Formular.
            </h2>
            <p className="mt-5 font-serif text-base leading-relaxed text-foreground/80 md:text-lg">
              Du bewirbst dich hier nicht einfach. Du wirst geprüft.
              Wir arbeiten nur mit Menschen, die bereit sind, Verantwortung
              zu übernehmen.
            </p>
          </div>
          <div>
            <Eyebrow>Was danach passiert</Eyebrow>
            <h2 className="mt-3 font-serif text-2xl font-semibold leading-[1.15] tracking-tight text-foreground md:text-3xl">
              Was passiert nach deiner Bewerbung?
            </h2>
            <ol className="mt-5 space-y-3 font-sans text-[15px] text-foreground/85">
              {[
                "Qualifikations-Check (2–3 Minuten).",
                "Auswertung deiner Antworten.",
                "Ggf. Einladung zum Gespräch.",
                "Ggf. Start im System.",
              ].map((line, i) => (
                <li key={line} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/60 font-sans text-[11px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 1.5 SOCIAL PROOF — TRUST */}
      <section ref={socialProofRef} className="border-b border-border/40 bg-muted/20 px-5 py-14 sm:px-6 md:py-28">
        <div className="mx-auto max-w-6xl">
          <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
            <p className="mb-3 font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-accent md:mb-4 md:text-[11px] md:tracking-[0.25em]">
              Vertrauen aus echter Praxis
            </p>
            <h2 className="font-serif text-[26px] font-semibold leading-[1.15] tracking-tight text-foreground md:text-4xl">
              Bereits über{" "}
              <span className="text-signal">490+ Bewerber</span> haben den
              nächsten Schritt gemacht
            </h2>
            <p className="mt-3 font-serif text-[15px] leading-snug text-foreground/70 md:mt-4 md:text-lg">
              Vom ersten Interesse bis zu echten Gesprächen und neuer Richtung im Alltag.
            </p>

          </motion.div>

          <motion.div
            {...fadeUp}
            className="mt-8 grid grid-cols-1 gap-4 sm:gap-5 md:mt-14 md:grid-cols-3 md:gap-7"
          >
            {[
              {
                name: "Steffi T.",
                image: testimonialSteffi,
                alt: "Portraitfoto von Steffi T., lächelnde Closer-Absolventin aus Deutschland",
                text: "Ich hatte vorher keinen Plan von Sales. Nach den ersten Wochen hatte ich meine ersten echten Calls – und auch meine ersten Abschlüsse.",
                result: abCopy.max.result,
                note: abCopy.max.note,
              },
              {
                name: "Leon K.",
                image: testimonialLeon,
                alt: "Portraitfoto von Leon K., fokussierter Closer-Teilnehmer im grauen Pullover",
                text: "Was mir am meisten geholfen hat, war das direkte Feedback nach jedem Call. Dadurch habe ich schnell Fortschritte gemacht.",
                result: abCopy.leon.result,
                note: abCopy.leon.note,
              },
              {
                name: "Daniel R.",
                image: testimonialDaniel,
                alt: "Portraitfoto von Daniel R., Remote-Closer mit ruhigem, selbstbewusstem Lächeln",
                text: "Ich wollte einfach raus aus dem 9–5. Heute arbeite ich remote und habe ein komplett anderes Gefühl von Kontrolle.",
                result: abCopy.daniel.result,
                note: "Arbeitet heute remote aus Portugal",
              },
            ].map((t) => (
              <article
                key={t.name}
                className="flex h-full flex-col rounded-lg border border-border/60 bg-background p-5 shadow-sm transition-shadow hover:shadow-md md:rounded-md md:p-7"
              >
                <div className="flex items-center gap-3.5 md:gap-4">
                  <img
                    src={t.image}
                    alt={t.alt}
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-border/60"
                  />
                  <div className="min-w-0">
                    <p className="font-sans text-[15px] font-semibold leading-tight text-foreground md:text-sm">
                      {t.name}
                    </p>
                    <div
                      className="mt-1 flex gap-0.5"
                      aria-label="5 von 5 Sternen"
                    >
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className="h-3.5 w-3.5 fill-signal text-signal md:h-3 md:w-3"
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-4 font-serif text-[15px] leading-relaxed text-foreground/85 md:mt-5">
                  „{t.text}"
                </p>
                <div className="mt-4 md:mt-5">
                  <span className="inline-flex items-center rounded-full bg-signal/10 px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-signal md:text-xs">
                    {t.result}
                  </span>
                </div>
                <p className="mt-2.5 font-sans text-[10.5px] leading-snug text-muted-foreground md:text-[11px]">
                  {t.note}
                </p>
              </article>
            ))}
          </motion.div>

          <motion.p
            {...fadeUp}
            className="mt-6 text-center font-sans text-[10px] uppercase tracking-[0.16em] text-muted-foreground md:mt-8 md:text-[11px] md:tracking-[0.18em]"
          >
            {abCopy.microcopy}
          </motion.p>

          <motion.div
            {...fadeUp}
            className="mt-7 flex flex-col items-center md:mt-10"
          >
            <Link
              to="/apply/quiz"
              onClick={() =>
                handleApplyCtaClick("social_proof", {
                  section: "social_proof",
                  variant: "qualification_check",
                  abBucket,
                })
              }
              className="group inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-sm bg-signal px-6 py-3.5 font-sans text-sm font-semibold tracking-wide text-signal-foreground shadow-lg transition-all hover:bg-signal-hover active:scale-[0.98] md:w-auto md:px-8 md:py-4"
            >
              Jetzt Bewerbung starten
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="mt-2.5 font-sans text-[11px] text-muted-foreground md:mt-3">
              Kostenlos • 2 Min • unverbindlich
            </p>
          </motion.div>
        </div>
      </section>

      {/* 1.5b TRANSFORMATION STORIES — Echte Wege echter Teilnehmerinnen (Phase D) */}
      <TransformationStories />

      {/* 1.6 FAQ — OBJECTION HANDLING */}
      <section className="border-b border-border/40 px-5 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-3xl">
          <motion.div {...fadeUp} className="text-center">
            <p className="mb-3 font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-accent md:mb-4 md:text-[11px] md:tracking-[0.25em]">
              Häufige Fragen
            </p>
            <h2 className="font-serif text-[26px] font-semibold leading-[1.15] tracking-tight text-foreground md:text-4xl">
              Was du wissen solltest, bevor du dich bewirbst
            </h2>
          </motion.div>

          <motion.div {...fadeUp} className="mt-8 md:mt-12">
            <Accordion type="single" collapsible className="w-full">
              {[
                {
                  q: "Wie läuft die Bewerbung konkret ab?",
                  a: "Du beantwortest 6 kurze Fragen (ca. 2 Minuten). Wenn deine Antworten passen, kannst du im Anschluss direkt einen Strategie-Call mit unserem Team buchen. Im Call klären wir, ob ein gemeinsamer Weg sinnvoll ist – für dich und für uns.",
                },
                {
                  q: "Was bedeutet \"ethisches Closing\" bei euch?",
                  a: "Wir verkaufen niemandem etwas, das er nicht braucht. Unser Ansatz basiert auf Klarheit statt Druck: ehrliche Diagnose, klare Empfehlung, sauberes Nein wenn es nicht passt. Manipulation oder klassische Druck-Taktiken sind ein sofortiger Ausschlussgrund.",
                },
                {
                  q: "Welche Voraussetzungen muss ich mitbringen?",
                  a: "Du brauchst keine Sales-Erfahrung. Wichtig sind: Deutsch auf Muttersprach-Niveau, Bereitschaft täglich 2–3 Stunden zu investieren, ein ruhiger Arbeitsplatz mit Headset und stabilem Internet – und die Offenheit, ehrliches Feedback anzunehmen.",
                },
                {
                  q: "Kann ich das komplett remote machen?",
                  a: "Ja. Das gesamte Programm – Training, Calls, Coaching, Community – läuft 100% remote. Du brauchst nur Laptop und Headset. Viele unserer Closer arbeiten von zuhause, einige reisen dauerhaft.",
                },
                {
                  q: "Was passiert direkt nach meiner Bewerbung?",
                  a: "Sofort nach dem Quiz siehst du, ob du grundsätzlich passt. Falls ja, buchst du direkt einen Strategie-Call. Im Call (ca. 30–45 Min) prüfen wir gemeinsam deine Situation, deine Ziele und ob unser Programm der richtige Hebel für dich ist. Keine Überraschungen, keine versteckten Bedingungen.",
                },
              ].map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-border/60">
                  <AccordionTrigger className="text-left font-serif text-base font-medium leading-snug text-foreground hover:no-underline md:text-lg">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="font-serif text-[15px] leading-relaxed text-foreground/80 md:text-base">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* 2. PROBLEM */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Das Problem</Eyebrow>
          <H2>9 – 5 ist keine Karriere. Es ist eine Sackgasse.</H2>
          <SectionImage
            src={problemOfficeImg} srcWebp={problemOfficeImgWebp}
            alt="Übermüdeter Mitarbeiter am Schreibtisch in monotoner Büro-Umgebung"
            focal="right"
          />
          <div className="mt-12 space-y-6">
            <Body>
              Du arbeitest hart und hast trotzdem keinen echten Einfluss auf dein Einkommen.
              Du bist austauschbar. Dein Potenzial wird verwaltet, nicht entfesselt.
            </Body>
            <Body>
              Jeder Monat ohne Veränderung ist ein Monat, in dem du dir selbst
              beweist, dass du dich damit abfinden kannst. Genau das ist das
              eigentliche Risiko.
            </Body>
          </div>
        </motion.div>
      </Section>

      {/* 3. SHIFT */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Realität</Eyebrow>
          <H2>Das Problem ist nicht du.</H2>
          <div className="mt-12 space-y-6">
            <Body>
              Niemand hat dir je gezeigt, wie man wirklich verkauft.
              Wie man Vertrauen aufbaut, Einwände führt, Menschen zur Entscheidung bewegt.
            </Body>
            <p className="border-l-2 border-accent pl-6 font-serif text-2xl italic leading-snug text-foreground md:text-3xl">
              Das Problem ist, dass du nie gelernt hast, wie man verkauft.
            </p>
          </div>
        </motion.div>
      </Section>

      {/* 4. BIG IDEA */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Big Idea</Eyebrow>
          <H2>
            Closing ist kein Kurs.
            <br />
            Es ist ein Hochleistungsskill.
          </H2>
          <SectionImage
            src={opportunityCalmImg} srcWebp={opportunityCalmImgWebp}
            alt="Junger Mann arbeitet ruhig und fokussiert am Laptop in heller Umgebung"
            focal="left"
          />
          <div className="mt-12 space-y-6">
            <Body>
              Niemand wird Pianist durch ein PDF. Niemand wird Athlet durch ein
              Webinar. Du wirst kein Closer, indem du Notizen machst.
            </Body>
            <Body>
              Meisterschaft entsteht aus einem Loop: echte Praxis, präzises
              Feedback, messbare Wiederholung. Alles andere ist Unterhaltung.
            </Body>
          </div>
        </motion.div>
      </Section>

      {/* 5. LÖSUNG — SYSTEM */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Das System</Eyebrow>
          <H2>Die ETC Performance Pipeline™</H2>
          <SectionImage
            src={systemCallImg} srcWebp={systemCallImgWebp}
            alt="Closer mit Headset im Verkaufsgespräch, fokussiert am Bildschirm"
            focal="right"
          />

          <figure
            aria-label="Pipeline-Diagramm: Calls, Feedback, KPI Tracking"
            className="mt-6 overflow-hidden rounded-sm border border-border/40 bg-muted/20 px-6 py-8 text-foreground/80"
          >
            <svg
              viewBox="0 0 600 110"
              className="mx-auto block h-auto w-full max-w-2xl"
              role="img"
              aria-hidden="true"
            >
              <g fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="10" y="30" width="160" height="50" rx="2" />
                <rect x="220" y="30" width="160" height="50" rx="2" />
                <rect x="430" y="30" width="160" height="50" rx="2" />
                <line x1="170" y1="55" x2="220" y2="55" />
                <polyline points="212,49 220,55 212,61" />
                <line x1="380" y1="55" x2="430" y2="55" />
                <polyline points="422,49 430,55 422,61" />
              </g>
              <g
                fill="currentColor"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontSize="12"
                textAnchor="middle"
                letterSpacing="2"
              >
                <text x="90" y="50" opacity="0.55">01</text>
                <text x="90" y="68" fontSize="13" letterSpacing="0">Calls</text>
                <text x="300" y="50" opacity="0.55">02</text>
                <text x="300" y="68" fontSize="13" letterSpacing="0">Feedback</text>
                <text x="510" y="50" opacity="0.55">03</text>
                <text x="510" y="68" fontSize="13" letterSpacing="0">KPI Tracking</text>
              </g>
            </svg>
            <figcaption className="mt-3 text-center font-sans text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Performance Loop
            </figcaption>
          </figure>

          <Body>
            <span className="mt-8 block">
              Kein Coaching. Ein System. Du wirst nicht geschult — du wirst
              gemessen, eingesetzt und verbessert.
            </span>
          </Body>

          <div className="mt-16 space-y-12">
            {[
              {
                n: "01",
                title: "Echte Calls ab Woche 1",
                body: "Reale Verkaufsgespräche mit echten Leads. Keine Rollenspiele. Kein Theater.",
              },
              {
                n: "02",
                title: "Live Feedback Loop",
                body: "Jeder Call wird ausgewertet. Was hat funktioniert, was nicht, was wird beim nächsten Mal anders.",
              },
              {
                n: "03",
                title: "Messbare KPIs",
                body: "Show Rate, Close Rate, Earnings per Call, Cycle Time. Performance ist sichtbar — für dich und uns.",
              },
              {
                n: "04",
                title: "Klare Progression",
                body: "Sechs Level (L1–L6). Jeder Aufstieg ist verdient durch Zahlen, nicht durch Anwesenheit.",
              },
            ].map((item) => (
              <div
                key={item.n}
                className="grid grid-cols-[auto_1fr] gap-6 border-t border-border/40 pt-8"
              >
                <span className="font-sans text-sm tracking-widest text-accent">
                  {item.n}
                </span>
                <div>
                  <h3 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
                    {item.title}
                  </h3>
                  <p className="mt-3 font-serif text-lg leading-relaxed text-foreground/75">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16">
            <ApplyCTA variant="accent" label="Eignung prüfen" location="who_for" />
          </div>
        </motion.div>
      </Section>

      {/* 5b. QUIZ PRE-FRAME */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Nächster Schritt</Eyebrow>
          <H2>Finde heraus, ob das für dich passt.</H2>
          <SectionImage
            src={quizDecisionImg} srcWebp={quizDecisionImgWebp}
            alt="Hand tippt entschlossen auf ein Smartphone-Display"
            focal="center"
          />
          <p className="mt-4 text-center font-serif text-base italic leading-snug text-muted-foreground md:text-lg">
            Du wirst im nächsten Schritt geprüft. Das entscheidet, ob du eingeladen wirst.
          </p>
          <p className="mt-8 font-serif text-lg leading-relaxed text-foreground/80 md:text-xl">
            Im nächsten Schritt bekommst du eine ehrliche Einschätzung deiner
            Situation – und siehst sofort, ob ein gemeinsamer Weg Sinn ergibt.
          </p>
          <ul className="mt-10 space-y-4 font-serif text-lg text-foreground/85 md:text-xl">
            <li className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
              Dauert 2–3 Minuten
            </li>
            <li className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
              Keine Vorkenntnisse nötig
            </li>
            <li className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
              Klare Einschätzung deiner Ausgangslage
            </li>
          </ul>
          <div className="mt-12">
            <ApplyCTA variant="accent" label="Eignung prüfen" location="quiz_preframe" />
          </div>
        </motion.div>
      </Section>

      {/* 6. DIFFERENZIERUNG */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Vergleich</Eyebrow>
          <H2>
            Andere Programme.
            <br />
            ETC.
          </H2>
          <div className="mt-12 grid gap-px overflow-hidden border border-border/40 bg-border/40 md:grid-cols-2">
            <div className="bg-background p-8">
              <p className="mb-6 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Andere
              </p>
              <ul className="space-y-4">
                {[
                  "Theorie und Module",
                  "Simulation mit Peers",
                  "Motivation und Mindset",
                  "Keine echten KPIs",
                  "Anwesenheit zählt",
                ].map((t) => (
                  <li
                    key={t}
                    className="flex items-start gap-3 font-serif text-lg text-muted-foreground"
                  >
                    <X className="mt-1 h-4 w-4 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-background p-8">
              <p className="mb-6 font-sans text-xs uppercase tracking-[0.2em] text-accent">
                ETC
              </p>
              <ul className="space-y-4">
                {[
                  "Echte Gespräche ab Woche 1",
                  "Echte Leads, echte Deals",
                  "Echte Zahlen, transparent",
                  "Live Feedback nach jedem Call",
                  "Performance bestimmt Aufstieg",
                ].map((t) => (
                  <li
                    key={t}
                    className="flex items-start gap-3 font-serif text-lg text-foreground"
                  >
                    <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </Section>

      {/* 7. BENEFITS */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Was du gewinnst</Eyebrow>
          <H2>Nicht nur Geld. Ein neues Leben.</H2>
          <div className="mt-12 grid gap-8 md:grid-cols-2">
            {[
              {
                t: "Freiheit",
                d: "Arbeite von überall. Keine Stechuhr, kein Pendeln, kein Chef im Nacken.",
              },
              {
                t: "Geld",
                d: "Direkter Zusammenhang zwischen Skill und Einkommen. Kein Deckel.",
              },
              {
                t: "Selbstbewusstsein",
                d: "Du weißt, was du kannst — weil du es jede Woche beweist.",
              },
              {
                t: "Status",
                d: "Du bist Teil eines Systems, das nur die Top 20 % aufnimmt.",
              },
            ].map((b) => (
              <div key={b.t} className="border-t border-border/40 pt-6">
                <h3 className="font-serif text-2xl font-semibold text-foreground">
                  {b.t}
                </h3>
                <p className="mt-2 font-serif text-lg leading-relaxed text-foreground/75">
                  {b.d}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* 8. SOCIAL PROOF */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Entwicklung</Eyebrow>
          <H2>Was tatsächlich passiert.</H2>
          <div className="mt-16 space-y-12">
            {[
              {
                from: "Erste Calls",
                to: "Erste Deals",
                body: "Aus Unsicherheit wird Routine. Aus Routine wird Resultat.",
              },
              {
                from: "Unsicher",
                to: "Strukturiert",
                body: "Aus Bauchgefühl wird ein Framework, das in jedem Gespräch greift.",
              },
              {
                from: "Theorie",
                to: "Echte Gespräche",
                body: "Aus Notizen wird Performance, die sich in KPIs ablesen lässt.",
              },
            ].map((s) => (
              <div key={s.from} className="border-t border-border/40 pt-8">
                <div className="flex items-baseline gap-4 font-serif text-2xl text-foreground md:text-3xl">
                  <span className="text-muted-foreground">{s.from}</span>
                  <ArrowRight className="h-5 w-5 text-accent" />
                  <span className="font-semibold">{s.to}</span>
                </div>
                <p className="mt-3 font-serif text-lg leading-relaxed text-foreground/75">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* 9. SELEKTION */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Auswahl</Eyebrow>
          <H2>
            Nicht jeder wird genommen.
            <br />
            <span className="text-muted-foreground">
              Finde heraus, ob du dazugehörst.
            </span>
          </H2>
          <SectionImage
            src={selectionPortraitImg} srcWebp={selectionPortraitImgWebp}
            alt="Fokussierter Mann mit ernstem, entschlossenem Blick — Schwarz-Weiß-Porträt"
            focal="top"
          />
          <div className="mt-12 grid gap-12 md:grid-cols-2">
            <div>
              <p className="mb-6 font-sans text-xs uppercase tracking-[0.2em] text-accent">
                Du passt gut, wenn
              </p>
              <ul className="space-y-4 font-serif text-lg text-foreground/90">
                <li className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  Du mehr willst als das, was du gerade hast.
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  Du bereit bist, wirklich zu lernen.
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  Du Verantwortung für deine Ergebnisse übernimmst.
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                  Du an dir gemessen werden willst.
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-6 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Wahrscheinlich nicht für dich, wenn
              </p>
              <ul className="space-y-4 font-serif text-lg text-muted-foreground">
                <li className="flex items-start gap-3">
                  <X className="mt-1 h-4 w-4 shrink-0" />
                  Du „schnelles Geld" suchst.
                </li>
                <li className="flex items-start gap-3">
                  <X className="mt-1 h-4 w-4 shrink-0" />
                  Du keine Disziplin mitbringen willst.
                </li>
                <li className="flex items-start gap-3">
                  <X className="mt-1 h-4 w-4 shrink-0" />
                  Du Aufwand mit Erfolg verwechselst.
                </li>
                <li className="flex items-start gap-3">
                  <X className="mt-1 h-4 w-4 shrink-0" />
                  Du Ausreden brauchst.
                </li>
              </ul>
            </div>
          </div>

          {/* Motivations-Bridge */}
          <div className="mt-20 border-t border-border/40 pt-16 text-center">
            <h3 className="font-serif text-3xl font-semibold leading-[1.15] tracking-tight text-foreground md:text-4xl">
              Du musst nicht perfekt sein.
            </h3>
            <p className="mx-auto mt-6 max-w-2xl font-serif text-lg leading-relaxed text-foreground/80 md:text-xl">
              Die meisten starten ohne Erfahrung. Entscheidend ist nicht,
              wo du stehst – sondern ob du bereit bist, besser zu werden.
            </p>
            <div className="mt-10 flex justify-center">
              <ApplyCTA
                variant="accent"
                label="Eignung prüfen"
                location="motivation_bridge"
              />
            </div>
          </div>
        </motion.div>
      </Section>

      {/* 10. PROZESS */}
      <Section>
        <motion.div {...fadeUp}>
          <Eyebrow>Auswahlprozess</Eyebrow>
          <H2>Vier Schritte. Keine Garantie.</H2>
          <div className="mt-16 space-y-10">
            {[
              {
                n: "01",
                t: "Bewerbung",
                d: "Kurzer Fragebogen. Wir lesen jede Antwort.",
              },
              {
                n: "02",
                t: "Gespräch",
                d: "Strukturiertes Qualifizierungs-Call. Klärung von Eignung und Anspruch.",
              },
              {
                n: "03",
                t: "Auswahl",
                d: "Entscheidung auf Basis von Klarheit, Commitment und Realismus.",
              },
              {
                n: "04",
                t: "Start",
                d: "Onboarding in die Pipeline. Erste echte Calls in der ersten Woche.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="grid grid-cols-[auto_1fr] gap-6 border-t border-border/40 pt-6"
              >
                <span className="font-sans text-sm tracking-widest text-accent">
                  {s.n}
                </span>
                <div>
                  <h3 className="font-serif text-2xl font-semibold text-foreground">
                    {s.t}
                  </h3>
                  <p className="mt-3 font-serif text-lg leading-relaxed text-foreground/75">
                    {s.d}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-12 font-serif text-lg italic text-muted-foreground">
            Nicht jeder wird genommen. Das ist der Punkt.
          </p>
        </motion.div>
      </Section>

      {/* 11. FINAL CTA */}
      <section className="px-6 py-32 md:py-40">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div {...fadeUp}>
            <h2 className="font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl">
              Wenn du nur Geld willst,
              <br />
              <span className="text-muted-foreground">geh woanders hin.</span>
            </h2>
            <h2 className="mt-8 font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl">
              Wenn du besser werden willst,
              <br />
              <span className="text-accent">starte hier.</span>
            </h2>
            <div className="mt-16">
              <ApplyCTA variant="accent" location="final" />
            </div>
            <p className="mt-8 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Ethical Top Closer · Performance Pipeline™
            </p>
          </motion.div>
        </div>
      </section>

      <Suspense fallback={null}>
        <FooterSection />
      </Suspense>
    </>
  );
}

// Avoid "unused import" warnings — these are intentionally kept in the
// module scope so the bundler hoists them into THIS chunk.
void APPLY_AB_TEST_KEY;
void trackFunnelEvent;
void FUNNEL_ID;
