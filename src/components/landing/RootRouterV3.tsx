/**
 * ROOT v3 — System Router.
 *
 * Role: TRUST + CLARITY + ROUTING. Does NOT convert.
 *
 * Exactly ONE primary CTA -> /apply (A/B test entry, sets funnel_source=apply_direct).
 * Exactly ONE secondary CTA -> /webinar (warm nurture).
 *
 * No new funnels, no backend changes, no attribution logic touched. Session id
 * + funnel_source are preserved automatically by /apply and /webinar mounts
 * (see src/lib/funnel-source.ts + src/lib/attribution-session.ts).
 *
 * Tracking: every event carries
 *   funnel: "root", page_path: "/", experiment_id: "root_v3"
 * via trackHomeCta()/trackHomeSection() with explicit overrides.
 */
import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { trackHomeCta } from "@/lib/home-tracking";
import { trackFunnelEvent } from "@/lib/track-event";
import { useLanguage } from "@/i18n/LanguageContext";
import josuePortrait from "@/assets/josue-portrait.jpeg";
import CareerFlowMap from "@/components/landing/CareerFlowMap";
import CareerFlowCopy from "@/components/landing/CareerFlowCopy";
import SystemStorySection from "@/components/landing/SystemStorySection";
import MiniCareerFlow from "@/components/landing/MiniCareerFlow";
import HeroLpV2 from "@/components/landing/HeroLpV2";
import { useCopyVariant } from "@/lib/cro/useCopyVariant";
import { getAbSlot } from "@/lib/ab-multivariant";

const VARIANT = { funnel: "root", experiment_id: "root_v3" } as const;

/**
 * LP V1 vs LP V2 — sticky multivariant slot.
 *
 * Resolved once per browser session; the assignment is written to
 * localStorage so EVERY downstream funnel event automatically carries
 * `ab_slots: "home_hero_lp:lp_vN"` via `getActiveSlotSummary()` in
 * `src/lib/track-event.ts`. The `ab-winner-rollup` edge function rolls
 * those rows up into `ab_slot_weights`, and the Winner Engine dashboard
 * picks the variant up automatically with the canonical reward formula
 * (Booking ×12 · HQL ×8 · Lead ×4 · QC ×2 · QS ×1) and Wilson-lower
 * confidence — no tracking/CRM/pixel/attribution changes needed.
 *
 * Both variants start at equal base weight; the auto-rollup gradually
 * shifts weight toward the winner while keeping a natural exploration
 * floor (variants are never fully zeroed unless explicitly paused).
 */
const HOME_HERO_SLOT = {
  slot: "home_hero_lp",
  variants: [
    { id: "lp_v1", baseWeight: 0.5 },
    { id: "lp_v2", baseWeight: 0.5 },
  ],
} as const;

const Section = ({
  k,
  className = "",
  children,
}: {
  k: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <section
    data-home-section={k}
    className={`border-b border-border/40 ${className}`}
  >
    <div className="container mx-auto max-w-4xl px-6 py-20 md:py-28">{children}</div>
  </section>
);

const PrimaryCta = ({ location }: { location: string }) => {
  // A/B test only the non-final-cta primary label. Final CTA stays fixed
  // because it sits at the bottom-of-page conversion moment.
  const ctaLabel = useCopyVariant("cta_label_v1", "Eignung prüfen", "label");
  const label = location === "final_cta" ? "Jetzt Bewerbung starten" : ctaLabel;
  return (
    <Link
      to="/apply"
      onClick={() =>
        trackHomeCta("primary_apply", location, "/apply", {
          cta_type: location === "final_cta" ? "final" : location === "hero_primary" ? "primary" : "secondary",
          ...VARIANT,
        })
      }
      className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-4 text-base font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
    >
      {label}
    </Link>
  );
};

const SecondaryCta = ({ location }: { location: string }) => (
  <Link
    to="/webinar"
    onClick={() =>
      trackHomeCta("webinar", location, "/webinar", {
        cta_type: location === "masterclass_block" ? "soft_yes" : "secondary",
        intent: location === "masterclass_block" ? "masterclass" : null,
        ...VARIANT,
      })
    }
    className="inline-flex items-center justify-center rounded-sm border border-border bg-transparent px-6 py-3 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground hover:border-foreground/40"
  >
    {location === "final_cta" ? "Masterclass ansehen" : "Erst verstehen → Masterclass"}
  </Link>
);

/**
 * Force-override for QA/preview: `?lp=v1` or `?lp=v2` overrides the sticky
 * allocation for THIS session only and marks it as `forced=true` so the
 * rollup excludes it from real KPIs. Persisted via sessionStorage so a
 * hard reload keeps the chosen variant.
 */
function readForcedHeroVariant(): "lp_v1" | "lp_v2" | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("lp");
    if (q === "v1" || q === "v2") {
      const variant = q === "v2" ? "lp_v2" : "lp_v1";
      sessionStorage.setItem("etc:lp_force_variant", variant);
      return variant;
    }
    const stored = sessionStorage.getItem("etc:lp_force_variant");
    if (stored === "lp_v1" || stored === "lp_v2") return stored;
  } catch { /* ignore */ }
  return null;
}

export default function RootRouterV3() {
  const { tx } = useLanguage();

  // A/B: LP V1 vs LP V2 (sticky session bucket, equal base weight).
  const heroBucket = useMemo(() => getAbSlot(HOME_HERO_SLOT as unknown as { slot: string; variants: { id: string; baseWeight?: number }[] }), []);
  const forcedVariant = useMemo(() => readForcedHeroVariant(), []);
  const effectiveVariant = forcedVariant ?? heroBucket.variant;
  const isLpV2 = effectiveVariant === "lp_v2";
  const isForced = forcedVariant !== null;

  // Fire one explicit `experiment_exposure` event per session — but NEVER
  // for forced QA sessions, so previews don't contaminate the rollup.
  const exposureFired = useRef(false);
  useEffect(() => {
    if (exposureFired.current) return;
    exposureFired.current = true;
    if (typeof window === "undefined") return;
    if (isForced) return;
    const sessionKey = `exposure_fired_${HOME_HERO_SLOT.slot}_v1`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      /* ignore — duplicate exposure is harmless, rollup dedupes by session */
    }
    void trackFunnelEvent("experiment_exposure", {
      funnel: "root",
      experiment_id: HOME_HERO_SLOT.slot,
      variant: heroBucket.variant,
      ab_slots: `${HOME_HERO_SLOT.slot}:${heroBucket.variant}`,
      page_path: "/",
    });
  }, [heroBucket.variant, isForced]);

  // A/B: hero headline (first line only, V1 only). Subline stays fixed.
  const heroHeadline = useCopyVariant(
    "hero_copy_v1",
    "Werde High-Ticket Closer —",
    "headline",
  );
  // A/B: trust card order. "default" = control, "income_first" = highest income first.
  const trustOrderKey = useCopyVariant<string>("trust_order_v1", "default", "order");

  return (
    <>
      {/* 1. HERO — LP V1 (current) vs LP V2 (diagnose-first). Sticky bucket. */}
      {isLpV2 ? (
        <HeroLpV2 />
      ) : (
      <section
        data-home-section="hero"
        data-hero-variant="lp_v1"
        className="border-b border-border/40 bg-background"
      >
        <div className="container mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            {/* LEFT — Message */}
            <div className="text-left">
              <p className="mb-5 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Ethical Top Closer · Performance-System
              </p>
              <h1 className="font-serif text-4xl font-medium leading-[1.1] text-foreground md:text-5xl lg:text-6xl">
                {tx(heroHeadline, "Become a high-ticket closer —")}
                <br />
                <span className="text-muted-foreground">
                  {tx(
                    "über einen strukturierten, bezahlten Karriereweg.",
                    "through a structured, paid progression."
                  )}
                </span>
              </h1>
              <p className="mt-6 font-sans text-lg leading-relaxed text-foreground/80 md:text-xl">
                {tx("Lernen. Anwenden. Verdienen.", "Learn. Apply. Earn.")}
              </p>
              <p className="mt-2 font-sans text-base leading-relaxed text-muted-foreground md:text-lg">
                {tx(
                  "Schritt für Schritt vom Bewerber zum platzierten Closer — innerhalb eines echten Systems.",
                  "Move step by step from applicant to placed closer — inside a real system."
                )}
              </p>


              {/* Trust strip */}
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm text-foreground/80">
                <li className="flex items-center gap-2">
                  <span className="text-[hsl(var(--accent))]">✓</span> Structured path
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[hsl(var(--accent))]">✓</span> Real client calls
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[hsl(var(--accent))]">✓</span> Performance-based income
                </li>
              </ul>
            </div>

            {/* RIGHT — Mini Career Flow */}
            <div className="md:pl-4">
              <MiniCareerFlow />
            </div>
          </div>

          {/* CTA Block — full width below */}
          <div className="mt-12 flex flex-col items-center justify-center gap-3 md:mt-16">
            {/* Identity Shift — above CTA */}
            <p className="mb-2 max-w-xl text-center font-serif text-base italic leading-snug text-foreground/80 md:text-lg">
              {tx(
                "Die wenigsten erreichen dieses Level. Nicht weil sie es nicht könnten — sondern weil sie nie ein System wie dieses betreten.",
                "Most people never reach this level. Not because they can't — but because they never enter a system like this."
              )}
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <PrimaryCta location="hero_primary" />
              <SecondaryCta location="hero_primary" />
            </div>
            <p className="font-sans text-xs text-muted-foreground">
              {tx("Unter 2 Minuten · Keine Verpflichtung", "Takes less than 2 minutes · No commitment")}
            </p>

            {/* Control vs Chaos + Irreversibility — below CTA */}
            <div className="mt-8 max-w-xl space-y-3 border-t border-border/40 pt-6 text-center font-sans text-sm leading-relaxed text-muted-foreground md:text-base">
              <p>
                {tx(
                  "Ohne Struktur bleiben die meisten stehen. Das ist der Unterschied: ein System, das dich vorwärts bewegt.",
                  "Without structure, most people stay stuck. This is the difference: a system that moves you forward."
                )}
              </p>
              <p>
                {tx(
                  "Du kannst versuchen, es allein herauszufinden. Oder du gehst durch ein System, das bereits funktioniert.",
                  "You can try to figure this out alone. Or you can move through a system that already works."
                )}
              </p>
            </div>
          </div>
        </div>
      </section>
      )}



      {/* 2. MECHANISM */}
      <Section k="mechanism">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">
          So verdienst du als Closer Geld
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">Mechanik</h3>
            <ul className="mt-4 space-y-3 font-sans text-base text-foreground">
              <li>Produkte: <span className="font-medium">3.000 € – 20.000 €</span></li>
              <li>Provision: <span className="font-medium">10–20 % pro Abschluss</span></li>
              <li>Start: 1–3 Abschlüsse / Monat</li>
              <li>Später: 3–6+ Abschlüsse / Monat</li>
            </ul>
            <p className="mt-6 font-serif text-2xl text-foreground">
              1.500 € – 8.000 €+ <span className="text-base text-muted-foreground">monatlich</span>
            </p>
          </div>
          <div>
            <h3 className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">Woher die Deals kommen</h3>
            <ul className="mt-4 space-y-3 font-sans text-base text-foreground">
              <li>Partnernetzwerk mit laufenden Kampagnen</li>
              <li>Bestehende, vorqualifizierte Leads</li>
              <li>Keine Kaltakquise am Anfang</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 2.5 — CAREER FLOW MAP™ (visual progression Applicant → Placed Closer) */}
      <CareerFlowMap />

      {/* 2.5b — CAREER FLOW COPY (Verstehen → Vertrauen → Entscheidung) */}
      <CareerFlowCopy />

      {/* 2.6 — SYSTEM STORY (Revenue · Intelligence · Talent — one connected system) */}
      <SystemStorySection />

      {/* 3. STEP FLOW */}
      <Section k="process_steps">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">So läuft der Einstieg</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {[
            ["01", "Bewerbung", "Du sendest deine Eignungsprüfung."],
            ["02", "Prüfung", "Wir bewerten Eignung & Ernsthaftigkeit."],
            ["03", "Gespräch", "Persönliches Strategiegespräch."],
            ["04", "Start", "Onboarding + erste echte Calls."],
          ].map(([n, t, d]) => (
            <li key={n} className="border-l border-border pl-4">
              <div className="font-serif text-2xl text-foreground/40">{n}</div>
              <div className="mt-2 font-sans text-sm font-medium text-foreground">{t}</div>
              <div className="mt-1 font-sans text-sm text-muted-foreground">{d}</div>
            </li>
          ))}
        </ol>
        <p className="mt-10 font-serif text-xl italic text-foreground/80">
          „Du bewirbst dich — wir entscheiden.“
        </p>
      </Section>

      {/* 4. TRUST / REAL PROOF */}
      <Section k="trust">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">Echte Closer. Echte Zahlen.</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {(() => {
            const cards = [
              {
                name: "Daniel S.",
                before: "Vertrieb Außendienst, ausgebrannt",
                after: "Senior Closer, ortsunabhängig",
                income: "+ 6.400 € / Monat",
                quote: "Erste 30 Tage kein Deal. Woche 6: drei Closes. Heute: planbar.",
              },
              {
                name: "Natalie S.",
                before: "Marketing-Angestellte",
                after: "Closer im Partnernetzwerk",
                income: "+ 3.100 € / Monat",
                quote: "Ich rede mit Leuten, die wirklich Hilfe wollen. Kein Pitch. Kein Druck.",
              },
              {
                name: "Thomas K.",
                before: "Selbständig, schwankendes Einkommen",
                after: "Performance-Closer L6",
                income: "+ 8.200 € / Monat",
                quote: "Das System gibt mir die Calls. Ich liefere die Abschlüsse. Fertig.",
              },
            ];
            // A/B: trust_order_v1 — "income_first" reorders highest income first.
            const ordered =
              trustOrderKey === "income_first"
                ? [cards[2], cards[0], cards[1]]
                : cards;
            return ordered.map((p) => (
            <div key={p.name} className="border border-border p-6">
              <div className="font-serif text-lg font-medium text-foreground">{p.name}</div>
              <div className="mt-3 font-sans text-xs text-muted-foreground">VORHER</div>
              <div className="font-sans text-sm text-foreground">{p.before}</div>
              <div className="mt-3 font-sans text-xs text-muted-foreground">HEUTE</div>
              <div className="font-sans text-sm text-foreground">{p.after}</div>
              <div className="mt-4 font-serif text-xl text-foreground">{p.income}</div>
              <p className="mt-4 border-t border-border pt-4 font-sans text-sm italic text-muted-foreground">
                „{p.quote}“
              </p>
            </div>
            ));
          })()}
        </div>
      </Section>

      {/* 5. SELECTION */}
      <Section k="selection">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">Für wen das nicht ist.</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div>
            <h3 className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">Nicht für dich, wenn …</h3>
            <ul className="mt-4 space-y-2 font-sans text-base text-foreground">
              <li>· du keine echten Gespräche führen willst</li>
              <li>· du schnelles, müheloses Geld erwartest</li>
              <li>· du keine Verantwortung übernehmen willst</li>
            </ul>
          </div>
          <div>
            <h3 className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">Für dich, wenn …</h3>
            <ul className="mt-4 space-y-2 font-sans text-base text-foreground">
              <li>· du eine echte Fähigkeit aufbauen willst</li>
              <li>· du nach Leistung bezahlt werden willst</li>
              <li>· du Ownership über deine Zahlen willst</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 6. PROGRAM SIMPLIFIED */}
      <Section k="program">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">Das Programm in einem Bild.</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div className="border border-border p-6">
            <div className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">Woche 1–2</div>
            <div className="mt-3 font-serif text-xl text-foreground">Training + erste Calls</div>
          </div>
          <div className="border border-border p-6">
            <div className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">Woche 3–4</div>
            <div className="mt-3 font-serif text-xl text-foreground">Closing + Feedback-Loops</div>
          </div>
          <div className="border border-border p-6">
            <div className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">Danach</div>
            <div className="mt-3 font-serif text-xl text-foreground">Deals über Partnernetzwerk</div>
          </div>
        </div>
      </Section>

      {/* 7. PSYCHOLOGICAL SHIFT */}
      <Section k="shift" className="bg-card">
        <p className="mx-auto max-w-3xl text-center font-serif text-2xl leading-relaxed text-foreground md:text-3xl">
          Das ist kein Online-Geld-System.
          <br />
          Das ist eine Fähigkeit, für die du bezahlt wirst.
        </p>
      </Section>

      {/* 8. FOUNDER */}
      <Section k="founder">
        <div className="grid items-center gap-10 md:grid-cols-[auto,1fr]">
          <img
            src={josuePortrait}
            alt="Josué — Founder Ethical Top Closer"
            loading="lazy"
            className="h-40 w-40 rounded-sm object-cover md:h-56 md:w-56"
          />
          <div>
            <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">
              Warum dieses System existiert
            </h2>
            <p className="mt-6 font-sans text-base leading-relaxed text-foreground md:text-lg">
              Closing ist eine echte Fähigkeit — keine Abkürzung, kein Online-Geld-Trick.
              Ich habe ETC gebaut, weil der Markt voll ist mit Systemen, die Hoffnung verkaufen
              statt Ergebnisse. Hier zählen echte Gespräche, echte Deals, echte Provision.
            </p>
            <p className="mt-4 font-sans text-sm uppercase tracking-[0.2em] text-muted-foreground">
              Josué · Founder
            </p>
          </div>
        </div>
      </Section>

      {/* 9. PHILOSOPHY (ETHICAL CLOSING) */}
      <Section k="philosophy">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">
          Was Ethical Closing wirklich bedeutet
        </h2>
        <ul className="mt-10 grid gap-4 font-sans text-base text-foreground md:grid-cols-2">
          <li className="border-l border-border pl-4">Kein Druckverkauf.</li>
          <li className="border-l border-border pl-4">Keine Manipulation.</li>
          <li className="border-l border-border pl-4">Nur Angebote, die Menschen wirklich weiterbringen.</li>
          <li className="border-l border-border pl-4">Verantwortung für das Ergebnis — nicht nur für den Abschluss.</li>
        </ul>
        <p className="mt-10 font-serif text-xl italic text-foreground/80 md:text-2xl">
          Langfristig gewinnen nur ehrliche Systeme.
        </p>
      </Section>

      {/* 10. COMMUNITY */}
      <Section k="community">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">
          Mit wem du hier arbeitest
        </h2>
        <p className="mt-6 max-w-2xl font-sans text-base text-muted-foreground md:text-lg">
          Ambitionierte, leistungsorientierte Menschen. Keine Anfänger-Mindset-Gruppe.
          Fokus auf Performance, klare Zahlen und Eigenverantwortung.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { role: "Closer · L4", context: "Ehemals Außendienst, jetzt remote", line: "Hier wird über Zahlen gesprochen, nicht über Gefühle." },
            { role: "Setter · L2", context: "Quereinstieg aus Gastronomie", line: "Niemand wartet darauf, dass du motiviert wirst." },
            { role: "Senior Closer · L6", context: "Vorher selbständig", line: "Das ist kein Kurs. Das ist ein Performance-Team." },
          ].map((p) => (
            <div key={p.role} className="border border-border p-6">
              <div className="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">{p.role}</div>
              <div className="mt-2 font-sans text-sm text-foreground">{p.context}</div>
              <p className="mt-4 border-t border-border pt-4 font-sans text-sm italic text-muted-foreground">
                „{p.line}“
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* 11. FAQ (COMPACT) */}
      <Section k="faq">
        <h2 className="font-serif text-3xl font-medium text-foreground md:text-4xl">Häufige Fragen</h2>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {[
            { q: "Brauche ich Erfahrung im Verkauf?", a: "Nein. Wir trainieren dich von Grund auf. Wichtig sind Disziplin und die Bereitschaft, echte Gespräche zu führen." },
            { q: "Wie schnell verdiene ich Geld?", a: "Erste Closes meist in Woche 4–8. Planbares Einkommen ab Monat 2–3 — abhängig von deiner Konsequenz." },
            { q: "Muss ich selbst Kunden finden?", a: "Nein. Du closter über unser Partnernetzwerk mit vorqualifizierten Leads. Keine Kaltakquise am Start." },
            { q: "Wie läuft die Zusammenarbeit ab?", a: "Onboarding, Training, dann echte Calls mit Feedback-Loops. Tägliche Standups, wöchentliche Reviews, klare Zahlen." },
            { q: "Gibt es eine Garantie?", a: "Nein. Garantien gibt es nur in Systemen, die Hoffnung verkaufen. Wir garantieren das System — die Ergebnisse hängen an dir." },
            { q: "Wie viel Zeit muss ich investieren?", a: "Mindestens 15–20 Stunden / Woche. Wer Vollzeit einsteigt, kommt schneller in planbares Einkommen." },
          ].map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-sans text-base font-medium text-foreground">
                {item.q}
                <span className="ml-4 font-serif text-xl text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* 12. FINAL CTA */}
      <Section k="final_cta">
        <div className="text-center">
          <h2 className="font-serif text-3xl font-medium text-foreground md:text-5xl">
            Bereit für die Eignungsprüfung?
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-base text-muted-foreground">
            Wenn du verstanden hast, wie das System funktioniert — bewirb dich. Wenn nicht — sieh zuerst die Masterclass.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <PrimaryCta location="final_cta" />
            <SecondaryCta location="final_cta" />
          </div>
        </div>
      </Section>
    </>
  );
}
