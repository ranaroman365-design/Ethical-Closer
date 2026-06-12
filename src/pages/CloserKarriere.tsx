/**
 * Phase 10 — Ethical Top Closer Registrierungs-Landingpage
 * --------------------------------------------------------------
 * Route: /closer-karriere
 *
 * Standalone landing page — fully independent from /masterofsales.
 * Uses existing MasterOfSales human-proof assets, semantic design tokens
 * (Cream/Gold/Ink, Cormorant + DM Sans), and the existing sticky AB-slot
 * infrastructure (useAbSlot → Thompson Sampling weights). No changes to
 * any existing component, route, CRO slot, tracking event, or funnel.
 *
 * Sections (1-9): Hero · Why-Wrong-Path · What-To-Expect · Who-For ·
 * Journey · Real-Insights · Process · FAQ · Final CTA
 *
 * Feature flag: MOS_REGISTER_ENABLED in src/lib/closer-karriere-flag.ts
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import RegisterForm from "@/components/closer-karriere/RegisterForm";
import StickyRegisterCta from "@/components/closer-karriere/StickyRegisterCta";

import {
  CheckCircle2,
  Compass,
  GraduationCap,
  Users,
  Sparkles,
  Briefcase,
  Target,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAbSlot } from "@/hooks/useAbSlot";
import { trackFunnelEvent } from "@/lib/track-event";
import { MOS_REGISTER_ENABLED } from "@/lib/closer-karriere-flag";

import heroAsset from "@/assets/lp-proof-p94/hero-B-conversation.jpg.asset.json";
import heroAltAsset from "@/assets/lp-proof-p94/hero-C-preparation.jpg.asset.json";
import heroCoachingAsset from "@/assets/lp-proof-p94/hero-D-coaching.jpg.asset.json";
import discoveryAsset from "@/assets/lp-proof-p94/beruf-discovery.jpg.asset.json";
import roleplayAsset from "@/assets/lp-proof-p94/training-B-roleplay-v3.jpg.asset.json";
import communityAsset from "@/assets/lp-proof-p94/community-C-live-training-room.jpg.asset.json";
import certAsset from "@/assets/lp-proof-p94/cert-D-milestone.jpg.asset.json";
import coachingAsset from "@/assets/lp-proof-p94/training-B-live-coaching.jpg.asset.json";
import journeyAsset from "@/assets/lp-proof-p94/transform-C-journey.jpg.asset.json";

// ────────────────────────────────────────────────────────────────────────────
// AB Slot definitions (sticky buckets, Thompson Sampling via ab_slot_weights)
// ────────────────────────────────────────────────────────────────────────────

const HERO_HEADLINE_SLOT = {
  slot: "mos_register_hero_headline",
  variants: [
    { id: "A_karriereweg" },
    { id: "B_pruefen" },
    { id: "C_eignung" },
  ],
} as const;

const HERO_HEADLINE_COPY: Record<string, string> = {
  A_karriereweg: "Finde heraus, ob der Karriereweg als Closer zu dir passt.",
  B_pruefen: "Prüfe in wenigen Minuten, ob professionelles Closing dein Weg ist.",
  C_eignung: "Eine ehrliche Standortbestimmung: Passt der Beruf Closer zu dir?",
};

const CTA_SLOT = {
  slot: "mos_register_cta",
  variants: [
    { id: "A_kostenlos" },
    { id: "B_jetzt" },
    { id: "C_eignung" },
  ],
} as const;

const CTA_COPY: Record<string, string> = {
  A_kostenlos: "Kostenlos registrieren",
  B_jetzt: "Jetzt registrieren",
  C_eignung: "Eignung prüfen",
};

const TRANSFORMATION_SLOT = {
  slot: "mos_register_transformation_angle",
  variants: [{ id: "A_kompetenz" }, { id: "B_entwicklung" }],
} as const;

const TRANSFORMATION_COPY: Record<string, { title: string; sub: string }> = {
  A_kompetenz: {
    title: "Vom orientierungslosen Einstieg zum professionellen Closer.",
    sub: "Ein strukturierter Karriereweg — Schritt für Schritt, mit Training, Praxis und Community.",
  },
  B_entwicklung: {
    title: "Ein klarer Entwicklungsweg statt loser Versprechen.",
    sub: "Konkrete Stationen, konkrete Fähigkeiten, konkrete Standortbestimmung.",
  },
};

const PROCESS_SLOT = {
  slot: "mos_register_process_angle",
  variants: [{ id: "A_schritte" }, { id: "B_prozess" }],
} as const;

const PROCESS_COPY: Record<string, string> = {
  A_schritte: "In fünf klaren Schritten zur Entscheidung.",
  B_prozess: "So läuft der Prozess nach deiner Registrierung ab.",
};

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function CloserKarriere() {
  if (!MOS_REGISTER_ENABLED) {
    return <Navigate to="/" replace />;
  }

  const heroSlot = useAbSlot(HERO_HEADLINE_SLOT);
  const ctaSlot = useAbSlot(CTA_SLOT);
  const transformationSlot = useAbSlot(TRANSFORMATION_SLOT);
  const processSlot = useAbSlot(PROCESS_SLOT);

  const heroHeadline = HERO_HEADLINE_COPY[heroSlot.variant] ?? HERO_HEADLINE_COPY.A_karriereweg;
  const ctaLabel = CTA_COPY[ctaSlot.variant] ?? CTA_COPY.A_kostenlos;
  const transformation = TRANSFORMATION_COPY[transformationSlot.variant] ?? TRANSFORMATION_COPY.A_kompetenz;
  const processHeadline = PROCESS_COPY[processSlot.variant] ?? PROCESS_COPY.A_schritte;

  useEffect(() => {
    document.title = "Ethical Top Closer™ — Karriereweg als Closer prüfen";
    const setMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta(
      "description",
      "Kostenlose Registrierung für Menschen, die professionelles Closing lernen möchten. Ehrliche Standortbestimmung, klarer Karriereweg, echte Praxis.",
    );
    setMeta("og:title", "Ethical Top Closer™ — Karriereweg als Closer", "property");
    setMeta(
      "og:description",
      "Finde in wenigen Minuten heraus, ob der Karriereweg als Closer zu dir passt.",
      "property",
    );

    trackFunnelEvent("closer_karriere_view", {
      funnel: "closer_karriere",
      ab_hero_headline: heroSlot.variant,
      ab_cta: ctaSlot.variant,
      ab_transformation: transformationSlot.variant,
      ab_process: processSlot.variant,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const trackCta = (position: string) => {
    trackFunnelEvent("closer_karriere_cta_click", {
      funnel: "closer_karriere",
      cta_position: position,
      ab_cta: ctaSlot.variant,
      ab_hero_headline: heroSlot.variant,
    });
  };

  const scrollToForm = (position: string) => {
    trackCta(position);
    if (typeof document === "undefined") return;
    const target =
      document.getElementById("register-form-inline") ??
      document.getElementById("register-form-final");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">

      <SectionHero
        headline={heroHeadline}
        ctaLabel={ctaLabel}
        onCta={() => scrollToForm("hero")}
      />

      <RegisterForm
        id="register-form-inline"
        position="inline"
        variant="light"
        eyebrow="Kostenlos registrieren"
        headline="Sichere dir deinen Zugang zum Karriereweg."
        subline="Name, E-Mail, WhatsApp — und du erhältst sofort den nächsten Schritt."
      />

      <SectionWhyWrongPath />

      <SectionWhatToExpect />

      <SectionWhoFor />

      <SectionJourney transformation={transformation} />

      <SectionRealInsights />

      <SectionProcess headline={processHeadline} />

      <SectionFaq />

      <RegisterForm
        id="register-form-final"
        position="final"
        variant="dark"
        eyebrow="Letzter Schritt"
        headline="Bereit für deinen Karriereweg?"
        subline="Trag dich ein und erhalte sofort den nächsten Schritt zugeschickt."
      />

      <SectionFinalCta ctaLabel={ctaLabel} onCta={() => scrollToForm("final")} />

      <FooterBar />

      <StickyRegisterCta />
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Hero
// ────────────────────────────────────────────────────────────────────────────

function SectionHero({
  headline,
  ctaLabel,
  onCta,
}: {
  headline: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <img
          src={heroAsset.url}
          alt="Echtes Closing-Gespräch im Training"
          className="h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/85" />
      </div>

      <div className="mx-auto flex min-h-[88vh] max-w-6xl flex-col items-center justify-center px-6 py-24 text-center md:py-32">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/80 backdrop-blur-sm">
          <Sparkles className="h-3 w-3" /> Ethical Top Closer™
        </span>

        <h1 className="font-serif text-4xl font-medium leading-[1.08] tracking-tight text-white md:text-6xl">
          {headline}
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">
          Kostenlose Registrierung für Menschen, die eine echte Fähigkeit lernen,
          professionell verkaufen und sich beruflich weiterentwickeln möchten.
        </p>

        <div className="mt-10">
          <Button
            type="button"
            size="lg"
            onClick={onCta}
            className="h-14 rounded-xl bg-accent px-10 text-base font-medium text-accent-foreground shadow-[0_10px_40px_-10px_hsl(var(--accent)/0.6)] hover:bg-accent/90"
          >
            {ctaLabel}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>


        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13px] text-white/70">
          {["Kostenlos", "Online", "Sofort verfügbar", "Unverbindlich"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> {t}
            </li>
          ))}
        </ul>

        <p className="mt-12 text-xs uppercase tracking-[0.25em] text-white/40">
          Selection over Pressure
        </p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Why Wrong Path
// ────────────────────────────────────────────────────────────────────────────

function SectionWhyWrongPath() {
  const items = [
    {
      icon: Compass,
      title: "Zu viele widersprüchliche Informationen",
      body: "Unzählige Stimmen, Methoden und Versprechen — am Ende fehlt eine klare Linie, an der man sich orientieren kann.",
    },
    {
      icon: Briefcase,
      title: "Keine echte Praxis",
      body: "Theoretisches Wissen ohne reale Gespräche, ohne Feedback und ohne strukturiertes Training führt selten zu Kompetenz.",
    },
    {
      icon: Target,
      title: "Kein klarer Karriereweg",
      body: "Ohne erkennbare Entwicklungsschritte bleibt die Frage offen: Wohin führt der Weg überhaupt?",
    },
  ];

  return (
    <section className="border-t border-border bg-background py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] uppercase tracking-[0.25em] text-accent">Standortbestimmung</span>
          <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Warum viele den falschen Weg gehen.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {items.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-border bg-card p-8 text-card-foreground transition-colors hover:border-accent/40"
            >
              <Icon className="h-6 w-6 text-accent" />
              <h3 className="mt-5 font-serif text-xl font-medium leading-snug">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-14 max-w-2xl text-center text-base italic leading-relaxed text-muted-foreground md:text-lg">
          „Genau deshalb bleiben viele Menschen orientierungslos, obwohl sie
          motiviert sind."
        </p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 3 — What To Expect
// ────────────────────────────────────────────────────────────────────────────

function SectionWhatToExpect() {
  const items = [
    {
      img: discoveryAsset.url,
      title: "Wie professionelle Verkaufsgespräche aufgebaut werden",
      body: "Du verstehst die Anatomie eines ehrlichen, strukturierten Closing-Gesprächs — von Eröffnung bis Entscheidung.",
    },
    {
      img: roleplayAsset.url,
      title: "Welche Fähigkeiten im Closing wirklich zählen",
      body: "Zuhören, qualifizieren, führen — und der Unterschied zwischen Druck und echter Klarheit.",
    },
    {
      img: coachingAsset.url,
      title: "Wie Training und Praxis kombiniert werden",
      body: "Roleplays, Live-Coaching und reale Gespräche bauen Kompetenz auf, die im Markt funktioniert.",
    },
    {
      img: heroAltAsset.url,
      title: "Wie du dich auf echte Kundengespräche vorbereitest",
      body: "Vorbereitung, Mindset und Routine — die unsichtbare Hälfte jedes erfolgreichen Gesprächs.",
    },
    {
      img: certAsset.url,
      title: "Welche Entwicklungsschritte notwendig sind",
      body: "Vom ersten Kontakt bis zum zertifizierten Closer — ein nachvollziehbarer Weg in klaren Stationen.",
    },
  ];

  return (
    <section className="border-t border-border bg-muted/30 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] uppercase tracking-[0.25em] text-accent">Inhalte</span>
          <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Was dich erwartet.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Keine allgemeinen Versprechen. Konkrete Inhalte und Fähigkeiten.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ img, title, body }) => (
            <article
              key={title}
              className="overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg"
            >
              <div className="aspect-[5/3] overflow-hidden bg-muted">
                <img
                  src={img}
                  alt={title}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="p-6">
                <h3 className="font-serif text-lg font-medium leading-snug">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Who For
// ────────────────────────────────────────────────────────────────────────────

function SectionWhoFor() {
  const items = [
    "Du suchst eine neue berufliche Richtung.",
    "Du möchtest eine echte Fähigkeit lernen.",
    "Du willst leistungsorientiert arbeiten.",
    "Du möchtest ortsunabhängig arbeiten.",
    "Du bist bereit, dich weiterzuentwickeln.",
  ];

  return (
    <section className="border-t border-border bg-background py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] uppercase tracking-[0.25em] text-accent">Eignung</span>
          <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Für wen das geeignet ist.
          </h2>
        </div>

        <ul className="mx-auto mt-14 grid max-w-4xl gap-4 md:grid-cols-2">
          {items.map((t) => (
            <li
              key={t}
              className="flex items-start gap-4 rounded-xl border border-border bg-card px-6 py-5 text-card-foreground"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <span className="text-[15px] leading-relaxed">{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Journey Timeline
// ────────────────────────────────────────────────────────────────────────────

function SectionJourney({
  transformation,
}: {
  transformation: { title: string; sub: string };
}) {
  const stops = [
    { label: "Start", note: "Orientierungslos, keine Struktur, keine verkaufsbezogene Fähigkeit." },
    { label: "Training", note: "Strukturierter Aufbau der Grundlagen — Methode statt Bauchgefühl." },
    { label: "Praxis", note: "Roleplays und reale Gespräche unter Anleitung." },
    { label: "Community", note: "Austausch, Feedback und gemeinsame Weiterentwicklung." },
    { label: "Kompetenz", note: "Reproduzierbare Ergebnisse durch gefestigte Fähigkeiten." },
    { label: "Professioneller Closer", note: "Eigenständige, ehrliche Gesprächsführung auf hohem Niveau." },
  ];

  return (
    <section className="relative border-t border-border bg-muted/40 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="text-[11px] uppercase tracking-[0.25em] text-accent">Entwicklungsweg</span>
            <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
              {transformation.title}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              {transformation.sub}
            </p>

            <ol className="mt-10 space-y-5">
              {stops.map((s, i) => (
                <li key={s.label} className="flex gap-5">
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-background font-serif text-sm text-accent">
                      {i + 1}
                    </span>
                    {i < stops.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-3">
                    <h3 className="font-serif text-lg font-medium leading-snug">{s.label}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.note}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <img
              src={journeyAsset.url}
              alt="Entwicklungsweg vom Einstieg zum professionellen Closer"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Real Insights (image grid)
// ────────────────────────────────────────────────────────────────────────────

function SectionRealInsights() {
  const tiles = [
    { img: discoveryAsset.url, label: "Discovery-Gespräch" },
    { img: roleplayAsset.url, label: "Roleplay-Training" },
    { img: communityAsset.url, label: "Community Sessions" },
    { img: certAsset.url, label: "Zertifizierung" },
    { img: coachingAsset.url, label: "Live-Coaching" },
    { img: heroCoachingAsset.url, label: "Praxisbegleitung" },
  ];

  return (
    <section className="border-t border-border bg-background py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] uppercase tracking-[0.25em] text-accent">Einblicke</span>
          <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Echte Einblicke in das System.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Keine Stockbilder. Keine Inszenierung. Tatsächliche Trainings, Gespräche und Community-Momente.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {tiles.map(({ img, label }) => (
            <figure key={label} className="group relative overflow-hidden rounded-2xl border border-border">
              <img
                src={img}
                alt={label}
                className="aspect-[4/3] h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                loading="lazy"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 py-4 text-sm font-medium text-white">
                {label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Process
// ────────────────────────────────────────────────────────────────────────────

function SectionProcess({ headline }: { headline: string }) {
  const steps = [
    { n: "01", title: "Registrieren", body: "Kostenlos, online, in unter zwei Minuten." },
    { n: "02", title: "Informationen erhalten", body: "Du bekommst Zugang zu konkreten Inhalten und Beispielen." },
    { n: "03", title: "Karriereweg verstehen", body: "Du siehst, wie der Weg vom Einstieg bis zum professionellen Closer aussieht." },
    { n: "04", title: "Eignung einschätzen", body: "Du gleichst ehrlich ab, ob dieser Weg zu deinen Zielen passt." },
    { n: "05", title: "Nächsten Schritt entscheiden", body: "Du entscheidest selbst, ob und wie du weitergehen möchtest." },
  ];

  return (
    <section className="border-t border-border bg-muted/30 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] uppercase tracking-[0.25em] text-accent">Prozess</span>
          <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            {headline}
          </h2>
        </div>

        <ol className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-5">
          {steps.map((s) => (
            <li
              key={s.n}
              className="rounded-2xl border border-border bg-card p-6 text-card-foreground"
            >
              <div className="font-serif text-xs uppercase tracking-[0.2em] text-accent">{s.n}</div>
              <h3 className="mt-4 font-serif text-lg font-medium leading-snug">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 8 — FAQ
// ────────────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Brauche ich Vorerfahrung?",
    a: "Nein. Der Karriereweg startet bei den Grundlagen. Wichtiger als Erfahrung ist die Bereitschaft, eine echte Fähigkeit zu lernen.",
  },
  {
    q: "Ist das für Anfänger geeignet?",
    a: "Ja. Der Aufbau ist so gestaltet, dass auch Menschen ohne Verkaufshintergrund Schritt für Schritt Kompetenz aufbauen.",
  },
  {
    q: "Wie viel Zeit muss ich investieren?",
    a: "Das hängt von deinem Tempo ab. Die Inhalte sind so strukturiert, dass kontinuierliche Praxis möglich ist — neben Beruf oder Studium.",
  },
  {
    q: "Ist die Registrierung kostenlos?",
    a: "Ja. Die Registrierung ist vollständig kostenlos und unverbindlich.",
  },
  {
    q: "Was passiert nach der Registrierung?",
    a: "Du erhältst Zugang zu Informationen über den Karriereweg, kannst deine Eignung einschätzen und entscheidest selbst über den nächsten Schritt.",
  },
  {
    q: "Gibt es Verpflichtungen?",
    a: "Nein. Die Registrierung verpflichtet zu nichts. Du entscheidest in jedem Schritt selbst.",
  },
];

function SectionFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="border-t border-border bg-background py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <span className="text-[11px] uppercase tracking-[0.25em] text-accent">FAQ</span>
          <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Häufige Fragen.
          </h2>
        </div>

        <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={isOpen}
                >
                  <span className="font-serif text-base font-medium md:text-lg">{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 text-[14px] leading-relaxed text-muted-foreground">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Final CTA
// ────────────────────────────────────────────────────────────────────────────

function SectionFinalCta({
  ctaLabel,
  onCta,
}: {
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <section className="relative isolate overflow-hidden border-t border-border">
      <div className="absolute inset-0 -z-10">
        <img
          src={heroCoachingAsset.url}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/70 to-black/90" />
      </div>

      <div className="mx-auto max-w-3xl px-6 py-28 text-center md:py-36">
        <ShieldCheck className="mx-auto h-7 w-7 text-accent" />
        <h2 className="mt-6 font-serif text-3xl font-medium leading-tight tracking-tight text-white md:text-5xl">
          Finde heraus, ob dieser Karriereweg zu deinen Zielen passt.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
          Ohne Druck. Ohne unrealistische Versprechen. Mit einer ehrlichen
          Einschätzung und klaren Informationen.
        </p>

        <div className="mt-10">
          <Button
            type="button"
            size="lg"
            onClick={onCta}
            className="h-14 rounded-xl bg-accent px-10 text-base font-medium text-accent-foreground shadow-[0_10px_40px_-10px_hsl(var(--accent)/0.6)] hover:bg-accent/90"
          >
            Jetzt {ctaLabel.toLowerCase()}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>


        <p className="mt-8 text-xs uppercase tracking-[0.25em] text-white/40">
          Ethical Top Closer™
        </p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Footer
// ────────────────────────────────────────────────────────────────────────────

function FooterBar() {
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-muted-foreground md:flex-row">
        <span>© {new Date().getFullYear()} Ethical Closer — Ethical Top Closer™</span>
        <nav className="flex items-center gap-6">
          <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
          <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
          <Link to="/agb" className="hover:text-foreground">AGB</Link>
        </nav>
      </div>
    </footer>
  );
}
