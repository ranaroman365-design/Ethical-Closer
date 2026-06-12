/**
 * Phase 12.1 — /closer-now Visual-First Landingpage (Salesbook-Funnel)
 * --------------------------------------------------------------
 * Visuell geführter Karriere-Funnel. Vollständig additiv,
 * parallel zu /masterofsales und /closer-karriere.
 *
 * Funnel: /closer-now → /salesbook-offer → /danke
 *
 * AB-Slots (ab_slot_weights + useAbSlot):
 *  - closer_now_headline (A/B/C/D)
 *  - closer_now_subheadline · closer_now_cta · closer_now_process
 *  - closer_now_disqualifier · closer_now_final_cta
 *  - closer_now_hero_image (A/B/C/D)            ← visual
 *  - closer_now_proof_layout (grid|carousel)    ← visual
 *  - closer_now_community_section (A|B)         ← visual
 *  - closer_now_visual_density (standard|dense) ← visual
 *
 * Events: CLOSER_NOW_VIEW · CLOSER_NOW_CTA_CLICK · CLOSER_NOW_PROCESS_VIEW
 *         CLOSER_NOW_DISQUALIFIER_VIEW · CLOSER_NOW_SALESBOOK_CLICK
 *         CLOSER_NOW_PROOF_VIEW · CLOSER_NOW_COMMUNITY_VIEW
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { Check, X, ArrowRight, BookOpen, Compass, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useAbSlot } from "@/hooks/useAbSlot";
import { trackFunnelEvent } from "@/lib/track-event";
import { CLOSER_NOW_ENABLED } from "@/lib/closer-now-flag";
import {
  CloserNowStickyCta,
  CloserNowInlineCta,
  CloserNowScrollCta,
  STICKY_CTA_COPY,
} from "@/components/closer-now/CloserNowCtas";
import {
  DisqualifierBlock,
  MicroFilterLine,
  SoftPrequalifierModal,
  goToSalesbook,
} from "@/components/closer-now/CloserNowQualityFilters";

// ── Real image assets (no stock) ───────────────────────────────────────────
import heroA from "@/assets/platform-real/ai-copilot.jpg.asset.json";
import heroB from "@/assets/lp-proof-p94/hero-B-conversation.jpg.asset.json";
import heroC from "@/assets/lp-proof/hero-competence.jpg.asset.json";
import heroD from "@/assets/lp-proof-p94/hero-E-hybrid.jpg.asset.json";

import valueImg1 from "@/assets/lp-proof-p94/hero-C-preparation.jpg.asset.json";
import valueImg2 from "@/assets/platform-real/career-path.jpg.asset.json";
import valueImg3 from "@/assets/lp-proof-p94/community-B-zoom-group.jpg.asset.json";

import proof1 from "@/assets/platform-real/performance-dashboard.jpg.asset.json";
import proof2 from "@/assets/platform-real/ai-copilot.jpg.asset.json";
import proof3 from "@/assets/platform-real/career-path.jpg.asset.json";
import proof4 from "@/assets/lp-proof-p94/training-D-screen-review.jpg.asset.json";
import proof5 from "@/assets/lp-proof-p94/transform-D-timeline.jpg.asset.json";
import proof6 from "@/assets/lp-proof-p94/transform-E-competence.jpg.asset.json";

import commTraining from "@/assets/lp-proof-p94/training-B-live-coaching.jpg.asset.json";
import commCalls from "@/assets/lp-proof-p94/community-C-live-training-room.jpg.asset.json";
import commGroup from "@/assets/lp-proof-p94/community-D-discussion.jpg.asset.json";
import commCoach from "@/assets/lp-proof-p94/training-C-roleplay-v4.jpg.asset.json";

import ctaBg from "@/assets/lp-proof-p94/hero-D-coaching.jpg.asset.json";

const SALESBOOK_HREF = "/salesbook-offer";

// ── AB Slots (copy) ────────────────────────────────────────────────────────
const HEADLINE_SLOT = { slot: "closer_now_headline", variants: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }] } as const;
const HEADLINE_COPY: Record<string, string> = {
  A: "Lerne die Fähigkeiten, die Top-Closer beherrschen.",
  B: "Nicht jeder wird ein erfolgreicher Closer. Finde heraus, ob du das Potenzial dazu hast.",
  C: "Der Unterschied liegt nicht im Talent. Sondern darin, wer bereit ist zu lernen.",
  D: "Closer werden ist einfach. Erfolgreich werden nicht.",
};

const SUBHEADLINE_SLOT = { slot: "closer_now_subheadline", variants: [{ id: "A" }, { id: "B" }, { id: "C" }] } as const;
const SUBHEADLINE_COPY: Record<string, string> = {
  A: "Für Menschen, die bereit sind in ihre Entwicklung zu investieren und professionelle Sales-Skills aufzubauen.",
  B: "Egal ob Anfänger oder bereits ausgebildet: Entscheidend ist deine Bereitschaft zu wachsen.",
  C: "Nicht für Jobsucher. Sondern für Menschen, die sich echte Fähigkeiten aufbauen möchten.",
};

const CTA_SLOT = { slot: "closer_now_cta", variants: [{ id: "A" }] } as const;
const CTA_COPY: Record<string, string> = { A: "SalesBook ansehen" };

const FINAL_CTA_SLOT = { slot: "closer_now_final_cta", variants: [{ id: "A" }] } as const;
const FINAL_CTA_COPY: Record<string, { title: string; button: string }> = {
  A: {
    title: "Erfahre jetzt, ob High-Ticket Closing für dich interessant sein könnte.",
    button: "SalesBook ansehen",
  },
};

// ── Visual AB Slots ────────────────────────────────────────────────────────
const HERO_IMAGE_SLOT = {
  slot: "closer_now_hero_image",
  variants: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }],
} as const;
const HERO_IMAGE_MAP: Record<string, { src: string; alt: string; split?: boolean }> = {
  A: { src: heroA.url, alt: "Closer am Laptop" },
  B: { src: heroB.url, alt: "Closer im Verkaufsgespräch" },
  C: { src: heroC.url, alt: "Lifestyle und Laptop" },
  D: { src: heroD.url, alt: "Karriere und High-Ticket Closing", split: true },
};

const PROOF_LAYOUT_SLOT = {
  slot: "closer_now_proof_layout",
  variants: [{ id: "grid" }, { id: "carousel" }],
} as const;

const COMMUNITY_SLOT = {
  slot: "closer_now_community_section",
  variants: [{ id: "A" }, { id: "B" }],
} as const;

const DENSITY_SLOT = {
  slot: "closer_now_visual_density",
  variants: [{ id: "standard" }, { id: "dense" }],
} as const;

// ── CTA-Maximierung Slots (Phase 12.2) ────────────────────────────────────
const CTA_DENSITY_SLOT = {
  slot: "closer_now_cta_density",
  variants: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }],
} as const;
const STICKY_CTA_SLOT = {
  slot: "closer_now_sticky_cta",
  variants: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }, { id: "E" }],
} as const;
const SCROLL_CTA_SLOT = {
  slot: "closer_now_scroll_cta",
  variants: [{ id: "on" }, { id: "off" }],
} as const;

// Phase 12.3 — Lead-Quality Slots
const SOFT_PREQUAL_SLOT = {
  slot: "closer_now_soft_prequalifier",
  variants: [{ id: "on" }, { id: "off" }],
} as const;
const DISQUALIFIER_SLOT = {
  slot: "closer_now_disqualifier",
  variants: [{ id: "strict" }, { id: "soft" }],
} as const;
const GROWTH_POSITIONING_SLOT = {
  slot: "closer_now_growth_positioning",
  variants: [{ id: "A" }, { id: "B" }, { id: "C" }],
} as const;

// ── Static visual content ──────────────────────────────────────────────────
const PROCESS_CARDS = [
  { icon: BookOpen, label: "Schritt 1", title: "SalesBook ansehen", img: valueImg1.url },
  { icon: Compass, label: "Schritt 2", title: "System verstehen", img: valueImg2.url },
  { icon: Target, label: "Schritt 3", title: "Nächsten Schritt planen", img: valueImg3.url },
];

const WHAT_IS_CARDS = [
  { img: heroB.url, alt: "Remote Sales Gespräch", title: "Beratung statt Kaltakquise", sub: "Hochwertige Gespräche mit qualifizierten Interessenten." },
  { img: heroA.url, alt: "Closer arbeitet von Laptop", title: "Ortsunabhängig arbeiten", sub: "Alles was du brauchst ist Laptop und Headset." },
  { img: commCalls.url, alt: "Closer im Team Call", title: "Im Team statt allein", sub: "Tägliche Calls, Coaching und Peer-Support." },
];

const PROOF_ITEMS = [
  { img: proof1.url, alt: "Performance Dashboard" },
  { img: proof2.url, alt: "AI Sales Co-Pilot" },
  { img: proof3.url, alt: "Karriereweg" },
  { img: proof4.url, alt: "Call Review" },
  { img: proof5.url, alt: "Entwicklung über Zeit" },
  { img: proof6.url, alt: "Kompetenz-Aufbau" },
];

const COMMUNITY_IMAGES = [
  { img: commTraining.url, alt: "Live Training" },
  { img: commCalls.url, alt: "Team Calls" },
  { img: commGroup.url, alt: "Gruppen-Coaching" },
  { img: commCoach.url, alt: "Coaching Session" },
];

const FIT_ITEMS = [
  "Du möchtest professionelle Sales-Skills aufbauen",
  "Du bist bereit in deine Entwicklung zu investieren",
  "Du bist offen für Coaching, Mentoring und Feedback",
  "Du willst langfristig erfolgreich werden",
  "Du übernimmst Verantwortung für deine Ergebnisse",
];
const UNFIT_ITEMS = [
  "Du suchst nur eine Setter-/Closer-Stelle",
  "Du willst ausschließlich Leads oder Auftraggeber",
  "Du willst nicht in deine Weiterbildung investieren",
  "Du suchst eine Abkürzung ohne Lernen",
];

// ── Helpers ────────────────────────────────────────────────────────────────
const ATTRIBUTION_SS_KEY = "etc_attribution_source_v1";
function setAttributionFirstTouch(source: string) {
  try {
    if (!window.sessionStorage.getItem(ATTRIBUTION_SS_KEY)) {
      window.sessionStorage.setItem(ATTRIBUTION_SS_KEY, source);
    }
  } catch { /* ignore */ }
}

const fireOnce = new Set<string>();
function fireOncePerSession(event: string, payload: Record<string, unknown>) {
  if (fireOnce.has(event)) return;
  fireOnce.add(event);
  try { trackFunnelEvent(event, payload); } catch { /* never throw */ }
}

// ────────────────────────────────────────────────────────────────────────────
export default function CloserNow() {
  if (!CLOSER_NOW_ENABLED) return <Navigate to="/" replace />;

  const headline = useAbSlot(HEADLINE_SLOT);
  const subheadline = useAbSlot(SUBHEADLINE_SLOT);
  const cta = useAbSlot(CTA_SLOT);
  const finalCta = useAbSlot(FINAL_CTA_SLOT);
  const heroImage = useAbSlot(HERO_IMAGE_SLOT);
  const proofLayout = useAbSlot(PROOF_LAYOUT_SLOT);
  const community = useAbSlot(COMMUNITY_SLOT);
  const density = useAbSlot(DENSITY_SLOT);
  const ctaDensity = useAbSlot(CTA_DENSITY_SLOT);
  const stickyCta = useAbSlot(STICKY_CTA_SLOT);
  const scrollCta = useAbSlot(SCROLL_CTA_SLOT);
  const softPrequal = useAbSlot(SOFT_PREQUAL_SLOT);
  const disqualifier = useAbSlot(DISQUALIFIER_SLOT);
  const growthPos = useAbSlot(GROWTH_POSITIONING_SLOT);

  const headlineCopy = HEADLINE_COPY[headline.variant] ?? HEADLINE_COPY.A;
  const subheadlineCopy = SUBHEADLINE_COPY[subheadline.variant] ?? SUBHEADLINE_COPY.A;
  const ctaLabel = CTA_COPY[cta.variant] ?? CTA_COPY.A;
  const finalCopy = FINAL_CTA_COPY[finalCta.variant] ?? FINAL_CTA_COPY.A;
  const hero = HERO_IMAGE_MAP[heroImage.variant] ?? HERO_IMAGE_MAP.A;
  const stickyLabel = STICKY_CTA_COPY[stickyCta.variant] ?? STICKY_CTA_COPY.A;

  const sectionPadY = density.variant === "dense" ? "py-14 sm:py-16" : "py-20 sm:py-24";

  const ab_slots = useMemo(() => ({
    closer_now_headline: headline.variant,
    closer_now_subheadline: subheadline.variant,
    closer_now_cta: cta.variant,
    closer_now_final_cta: finalCta.variant,
    closer_now_hero_image: heroImage.variant,
    closer_now_proof_layout: proofLayout.variant,
    closer_now_community_section: community.variant,
    closer_now_visual_density: density.variant,
    closer_now_cta_density: ctaDensity.variant,
    closer_now_sticky_cta: stickyCta.variant,
    closer_now_scroll_cta: scrollCta.variant,
    closer_now_soft_prequalifier: softPrequal.variant,
    closer_now_disqualifier: disqualifier.variant,
    closer_now_growth_positioning: growthPos.variant,
  }), [headline.variant, subheadline.variant, cta.variant, finalCta.variant, heroImage.variant, proofLayout.variant, community.variant, density.variant, ctaDensity.variant, stickyCta.variant, scrollCta.variant, softPrequal.variant, disqualifier.variant, growthPos.variant]);

  const processRef = useRef<HTMLElement>(null);
  const disqRef = useRef<HTMLElement>(null);
  const proofRef = useRef<HTMLElement>(null);
  const commRef = useRef<HTMLElement>(null);

  // Has the user clicked any CTA yet? Used to suppress scroll-trigger cards.
  const [ctaClicked, setCtaClicked] = useState(false);

  useEffect(() => {
    document.title = "High-Ticket Closing Karriere — Closer Now";
    setAttributionFirstTouch("closer_now");

    void import("@/lib/master-funnel-id").then(({ ensureMasterFunnelId, markFunnelBooted }) => {
      try { ensureMasterFunnelId(); } catch { /* ignore */ }
      try { markFunnelBooted(); } catch { /* ignore */ }
    });

    fireOncePerSession("CLOSER_NOW_VIEW", { funnel: "closer_now", ab_slots });
  }, [ab_slots]);

  useEffect(() => {
    const observe = (el: Element | null, event: string) => {
      if (!el || typeof IntersectionObserver === "undefined") return () => {};
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            fireOncePerSession(event, { funnel: "closer_now", ab_slots });
            io.disconnect();
          }
        });
      }, { threshold: 0.35 });
      io.observe(el);
      return () => io.disconnect();
    };
    const c1 = observe(processRef.current, "CLOSER_NOW_PROCESS_VIEW");
    const c2 = observe(disqRef.current, "CLOSER_NOW_DISQUALIFIER_VIEW");
    const c3 = observe(proofRef.current, "CLOSER_NOW_PROOF_VIEW");
    const c4 = observe(commRef.current, "CLOSER_NOW_COMMUNITY_VIEW");
    return () => { c1(); c2(); c3(); c4(); };
  }, [ab_slots]);

  // Soft prequalifier modal state. If the slot is "on", main CTAs first
  // open the prequalifier; if it's "off", they go straight to /salesbook-offer.
  const [prequalOpen, setPrequalOpen] = useState(false);
  const [pendingSection, setPendingSection] = useState<string | null>(null);

  const handleCta = (section: string, e?: MouseEvent) => {
    setCtaClicked(true);
    try {
      trackFunnelEvent("CLOSER_NOW_CTA_CLICK", { funnel: "closer_now", ab_slots, section });
    } catch { /* never throw */ }
    if (softPrequal.variant === "on") {
      // intercept navigation
      e?.preventDefault();
      setPendingSection(section);
      setPrequalOpen(true);
      return;
    }
    try {
      trackFunnelEvent("CLOSER_NOW_SALESBOOK_CLICK", { funnel: "closer_now", ab_slots, section });
    } catch { /* never throw */ }
  };

  const handlePrequalProceed = () => {
    try {
      trackFunnelEvent("CLOSER_NOW_SALESBOOK_CLICK", {
        funnel: "closer_now",
        ab_slots,
        section: pendingSection ?? "prequal",
        prequalified: true,
      });
    } catch { /* */ }
    goToSalesbook();
  };

  // CTA density gates whether each section gets its own inline CTA.
  // A = hero + footer only · B = every 2nd section · C = every section · D = every section + sticky
  const showInline = (idx: number): boolean => {
    const v = ctaDensity.variant;
    if (v === "A") return false;
    if (v === "B") return idx % 2 === 0;
    return true; // C, D
  };
  const showSticky = ctaDensity.variant === "D" || ctaDensity.variant === "C";
  const inlineProps = { ab_slots, onClicked: () => setCtaClicked(true) };


  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* SECTION 1 — HERO (Bild oberhalb des Folds) */}
      <section className="relative overflow-hidden border-b border-border/40">
        {hero.split ? (
          <div className="grid sm:grid-cols-2">
            <img src={hero.src} alt="Karriere" className="h-64 w-full object-cover sm:h-[60vh]" loading="eager" />
            <img src={heroB.url} alt="High-Ticket Closing" className="h-64 w-full object-cover sm:h-[60vh]" loading="eager" />
          </div>
        ) : (
          <div className="relative h-[58vh] min-h-[420px] w-full">
            <img src={hero.src} alt={hero.alt} className="absolute inset-0 h-full w-full object-cover" loading="eager" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
          </div>
        )}
        <div className="relative mx-auto -mt-32 max-w-3xl px-6 pb-16 text-center sm:-mt-40 sm:pb-20">
          <div className="rounded-3xl border border-border/60 bg-background/90 px-6 py-10 backdrop-blur-md shadow-xl">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Karriere im High-Ticket Closing
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl leading-[1.08] text-foreground">
              {headlineCopy}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
              {subheadlineCopy}
            </p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg" className="h-14 px-8 text-base" onClick={(e) => handleCta("hero", e)}>
                <a href={SALESBOOK_HREF}>
                  {ctaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
            <MicroFilterLine ab_slots={ab_slots} className="mt-4" />
          </div>
        </div>
      </section>

      {/* SECTION — DISQUALIFIER (lead-quality filter) */}
      <DisqualifierBlock ab_slots={ab_slots} variant={disqualifier.variant} />

      {/* SECTION 2 — PROCESS (3 große Karten mit Bildern + Icons) */}
      <section ref={processRef} className={`border-b border-border/40 bg-card/30 ${sectionPadY}`}>
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-3xl sm:text-4xl text-center text-foreground">So funktioniert es</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {PROCESS_CARDS.map(({ icon: Icon, label, title, img }) => (
              <div key={label} className="overflow-hidden rounded-2xl border border-border/60 bg-background">
                <img src={img} alt={title} className="h-44 w-full object-cover" loading="lazy" />
                <div className="p-6 text-center">
                  <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-2 font-serif text-xl text-foreground">{title}</p>
                </div>
              </div>
            ))}
          </div>
          {showInline(0) && (
            <CloserNowInlineCta section="process" label="Schritt 1 starten" {...inlineProps} />
          )}
        </div>
      </section>


      {/* SECTION 3 — WAS IST HIGH-TICKET CLOSING (3 Bildkarten) */}
      <section className={`border-b border-border/40 ${sectionPadY}`}>
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-3xl sm:text-4xl text-center text-foreground">Was ist High-Ticket Closing</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {WHAT_IS_CARDS.map(c => (
              <figure key={c.alt} className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
                <img src={c.img} alt={c.alt} className="h-56 w-full object-cover" loading="lazy" />
                <figcaption className="p-5">
                  <p className="font-serif text-lg text-foreground">{c.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{c.sub}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          {showInline(1) && (
            <CloserNowInlineCta section="what_is" label="Mehr erfahren" {...inlineProps} />
          )}
        </div>
      </section>


      {/* SECTION 4 — PROOF (Grid vs Carousel) */}
      <section ref={proofRef} className={`border-b border-border/40 bg-card/30 ${sectionPadY}`}>
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">Plattform &amp; Resultate</p>
          <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-center text-foreground">Was Closer täglich nutzen</h2>

          {proofLayout.variant === "carousel" ? (
            <div className="mt-12 px-8">
              <Carousel opts={{ align: "start", loop: true }}>
                <CarouselContent>
                  {PROOF_ITEMS.map(p => (
                    <CarouselItem key={p.alt} className="sm:basis-1/2 lg:basis-1/3">
                      <figure className="overflow-hidden rounded-2xl border border-border/60 bg-background">
                        <img src={p.img} alt={p.alt} className="h-56 w-full object-cover" loading="lazy" />
                        <figcaption className="px-4 py-3 text-sm text-muted-foreground">{p.alt}</figcaption>
                      </figure>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>
          ) : (
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PROOF_ITEMS.map(p => (
                <figure key={p.alt} className="overflow-hidden rounded-2xl border border-border/60 bg-background">
                  <img src={p.img} alt={p.alt} className="h-52 w-full object-cover" loading="lazy" />
                  <figcaption className="px-4 py-3 text-sm text-muted-foreground">{p.alt}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
        {showInline(2) && (
          <div className="mx-auto max-w-6xl px-6">
            <CloserNowInlineCta section="proof" label="Das System verstehen" {...inlineProps} />
          </div>
        )}
      </section>


      {/* SECTION 5 — COMMUNITY */}
      <section ref={commRef} className={`border-b border-border/40 ${sectionPadY}`}>
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-serif text-3xl sm:text-4xl text-center text-foreground">
            Du gehst diesen Weg nicht alleine.
          </h2>
          <p className="mt-3 text-center text-muted-foreground">Trainings · Calls · Gruppen · Coaching</p>

          {community.variant === "B" ? (
            <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {COMMUNITY_IMAGES.map(c => (
                <img key={c.alt} src={c.img} alt={c.alt} className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
              ))}
            </div>
          ) : (
            <div className="mt-12 grid gap-4 sm:grid-cols-12">
              <img src={COMMUNITY_IMAGES[0].img} alt={COMMUNITY_IMAGES[0].alt} className="sm:col-span-7 h-72 w-full rounded-2xl object-cover" loading="lazy" />
              <img src={COMMUNITY_IMAGES[1].img} alt={COMMUNITY_IMAGES[1].alt} className="sm:col-span-5 h-72 w-full rounded-2xl object-cover" loading="lazy" />
              <img src={COMMUNITY_IMAGES[2].img} alt={COMMUNITY_IMAGES[2].alt} className="sm:col-span-5 h-72 w-full rounded-2xl object-cover" loading="lazy" />
              <img src={COMMUNITY_IMAGES[3].img} alt={COMMUNITY_IMAGES[3].alt} className="sm:col-span-7 h-72 w-full rounded-2xl object-cover" loading="lazy" />
            </div>
          )}
        </div>
        {showInline(3) && (
          <div className="mx-auto max-w-6xl px-6">
            <CloserNowInlineCta section="community" label="Nächsten Schritt ansehen" {...inlineProps} />
          </div>
        )}
      </section>


      {/* SECTION 6 — FÜR WEN GEEIGNET (Checklisten mit Icons, zweispaltig) */}
      <section ref={disqRef} className={`border-b border-border/40 bg-card/30 ${sectionPadY}`}>
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="font-serif text-3xl sm:text-4xl text-center text-foreground">Für wen ist das geeignet</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background p-6">
              <p className="mb-4 text-xs uppercase tracking-[0.18em] text-primary">Passt zu dir</p>
              <ul className="space-y-3">
                {FIT_ITEMS.map(item => (
                  <li key={item} className="flex items-start gap-3 text-foreground">
                    <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background p-6">
              <p className="mb-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Passt nicht</p>
              <ul className="space-y-3">
                {UNFIT_ITEMS.map(item => (
                  <li key={item} className="flex items-start gap-3 text-foreground/70">
                    <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <X className="h-4 w-4" aria-hidden />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        {showInline(4) && (
          <div className="mx-auto max-w-5xl px-6">
            <CloserNowInlineCta section="fit" label="Prüfen ob es passt" {...inlineProps} />
          </div>
        )}
      </section>


      {/* SECTION 7 — FINAL CTA mit großem Hintergrundbild */}
      <section className="relative isolate overflow-hidden">
        <img src={ctaBg.url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/80 to-background/95" />
        <div className="relative mx-auto max-w-3xl px-6 py-28 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl leading-tight text-foreground">
            {finalCopy.title}
          </h2>
          <div className="mt-10 flex justify-center">
            <Button asChild size="lg" className="h-14 px-10 text-base" onClick={(e) => handleCta("final", e)}>
              <a href={SALESBOOK_HREF}>
                {finalCopy.button}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
          <MicroFilterLine ab_slots={ab_slots} className="mt-6" />
        </div>
      </section>

      {/* Phase 12.2 — Scroll-triggered CTA cards (50 % / 75 %) */}
      {scrollCta.variant === "on" && (
        <CloserNowScrollCta
          ab_slots={ab_slots}
          hasInteracted={ctaClicked}
          onClicked={() => setCtaClicked(true)}
        />
      )}

      {/* Phase 12.2 — Permanent Sticky CTA (mobile bar + desktop floating) */}
      {showSticky && (
        <CloserNowStickyCta
          label={stickyLabel}
          ab_slots={ab_slots}
          onClicked={() => setCtaClicked(true)}
        />
      )}

      {/* Phase 12.3 — Soft Prequalifier Modal */}
      <SoftPrequalifierModal
        open={prequalOpen}
        onOpenChange={setPrequalOpen}
        ab_slots={ab_slots}
        onProceed={handlePrequalProceed}
      />
    </main>

  );
}
