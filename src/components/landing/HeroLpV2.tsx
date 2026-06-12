/**
 * HeroLpV2 — Above-the-fold variant B for the public root (`/`).
 *
 * STRICTLY ADDITIVE. Used only when the sticky multivariant slot
 * `home_hero_lp` resolves to `lp_v2`. LP V1 (the original RootRouterV3 hero)
 * is rendered for every other case.
 *
 * Scope:
 *   • Headline, Subheadline, Kicker, CTA label, Hero messaging
 *   • Same primary CTA target (/apply) and same secondary CTA target (/webinar)
 *     → Funnel-Source, Tracking, Attribution, Pixel/CAPI, Quiz, Booking all
 *       unchanged.
 *
 * Brand voice (per spec):
 *   direkt · ehrlich · analytisch · ruhig · klar
 *   keine Coach-Floskeln, keine Hype-Versprechen, keine Buzzwords.
 *
 * Triggers:
 *   Neugier · Selbstdiagnose · Fehlende Klarheit · Karrierepotenzial ·
 *   Selbstbestimmung · Perspektivwechsel · Klartext statt Hype.
 *
 * Resonance target:
 *   "Das spricht genau mein Problem an."
 */
import { Link } from "react-router-dom";
import { trackHomeCta } from "@/lib/home-tracking";
import { useLanguage } from "@/i18n/LanguageContext";
import MiniCareerFlow from "@/components/landing/MiniCareerFlow";

const VARIANT = { funnel: "root", experiment_id: "root_v3", hero_variant: "lp_v2" } as const;

export default function HeroLpV2() {
  const { tx } = useLanguage();

  return (
    <section
      data-home-section="hero"
      data-hero-variant="lp_v2"
      className="border-b border-border/40 bg-background"
    >
      <div className="container mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          {/* LEFT — Diagnose-first messaging */}
          <div className="text-left">
            <p className="mb-5 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {tx(
                "Eignungsprüfung · Karriereweg Closing",
                "Suitability check · Closing career path",
              )}
            </p>

            <h1 className="font-serif text-4xl font-medium leading-[1.1] text-foreground md:text-5xl lg:text-6xl">
              {tx(
                "Du willst mehr — aber dir fehlt der nächste klare Schritt.",
                "You want more — but the next clear step is missing.",
              )}
            </h1>

            <p className="mt-6 font-sans text-lg leading-relaxed text-foreground/85 md:text-xl">
              {tx(
                "In 2 Minuten siehst du, ob Closing wirklich zu dir passt — und welcher Karriereweg realistisch ist.",
                "In 2 minutes you'll see if closing actually fits you — and which career path is realistic.",
              )}
            </p>

            <p className="mt-3 font-sans text-base leading-relaxed text-muted-foreground md:text-lg">
              {tx(
                "Keine Motivation. Keine Versprechen. Eine ehrliche Standortbestimmung.",
                "No motivation talk. No promises. An honest assessment of where you stand.",
              )}
            </p>

            {/* Diagnostic strip — three short, calm self-recognition lines */}
            <ul className="mt-8 space-y-2 font-sans text-sm leading-relaxed text-foreground/80 md:text-base">
              <li className="flex items-start gap-2">
                <span className="mt-1 text-[hsl(var(--accent))]">·</span>
                {tx(
                  "Du arbeitest viel, aber das Einkommen wächst nicht in dem Tempo, das du willst.",
                  "You work hard, but income doesn't grow at the pace you want.",
                )}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-[hsl(var(--accent))]">·</span>
                {tx(
                  "Du hast Potenzial, aber kein System, das es in Ergebnisse übersetzt.",
                  "You have potential, but no system that turns it into results.",
                )}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 text-[hsl(var(--accent))]">·</span>
                {tx(
                  "Du willst Klartext, keine Coaches, die dir Träume verkaufen.",
                  "You want straight talk, not coaches selling you dreams.",
                )}
              </li>
            </ul>
          </div>

          {/* RIGHT — Mini Career Flow (unchanged, same proof element as V1) */}
          <div className="md:pl-4">
            <MiniCareerFlow />
          </div>
        </div>

        {/* CTA Block */}
        <div className="mt-12 flex flex-col items-center justify-center gap-3 md:mt-16">
          <p className="mb-2 max-w-2xl text-center font-serif text-base italic leading-snug text-foreground/80 md:text-lg">
            {tx(
              "Die meisten verlieren keine Zeit an mangelnder Fähigkeit — sondern an fehlender Klarheit darüber, wo sie stehen.",
              "Most people don't lose time to a lack of skill — they lose it to a lack of clarity about where they stand.",
            )}
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link
              to="/apply"
              onClick={() =>
                trackHomeCta("primary_apply", "hero_primary", "/apply", {
                  cta_type: "primary",
                  ...VARIANT,
                })
              }
              className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-4 text-base font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
            >
              {tx("Standort prüfen · 2 Min.", "Check your standing · 2 min.")}
            </Link>
            <Link
              to="/webinar"
              onClick={() =>
                trackHomeCta("webinar", "hero_primary", "/webinar", {
                  cta_type: "secondary",
                  ...VARIANT,
                })
              }
              className="inline-flex items-center justify-center rounded-sm border border-border bg-transparent px-6 py-3 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground hover:border-foreground/40"
            >
              {tx("Erst verstehen → Masterclass", "Understand first → Masterclass")}
            </Link>
          </div>

          <p className="font-sans text-xs text-muted-foreground">
            {tx(
              "Keine Zahlung · Keine Verpflichtung · Ehrliche Auswertung",
              "No payment · No commitment · Honest evaluation",
            )}
          </p>

          {/* Perspective shift — calm, analytical close */}
          <div className="mt-8 max-w-2xl space-y-3 border-t border-border/40 pt-6 text-center font-sans text-sm leading-relaxed text-muted-foreground md:text-base">
            <p>
              {tx(
                "Closing ist keine Abkürzung. Es ist eine Fähigkeit — und ein Karriereweg, der bezahlt wird, wenn du ihn ernst nimmst.",
                "Closing is no shortcut. It's a skill — and a career path that pays when you take it seriously.",
              )}
            </p>
            <p>
              {tx(
                "Die Prüfung ist nicht der Verkauf. Sie ist die ehrliche Antwort auf die Frage: lohnt sich dieser Weg für dich?",
                "The check isn't the sale. It's the honest answer to one question: is this path worth it for you?",
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
