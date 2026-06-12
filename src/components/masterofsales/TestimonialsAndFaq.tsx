import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/track-event";
import { Calendar } from "lucide-react";

// ---------------------------------------------------------------------------
// A/B Test: FAQ-Antworten + CTA-Text
// Wir testen zwei Varianten für 2 FAQ-Einträge (Index 2 = "ethisches Closing"
// und Index 5 = "Was kostet"). Variante wird pro Browser-Session deterministisch
// zugewiesen und in sessionStorage persistiert. Tracking-Events tragen `variant`
// + `experiment` mit, sodass die Conversion zum Strategie-Call vergleichbar ist.
// ---------------------------------------------------------------------------

type FaqVariant = "A" | "B";
const EXPERIMENT_ID = "masterofsales_faq_v1";
const STORAGE_KEY = `etc:exp:${EXPERIMENT_ID}`;

type FaqAB = {
  a: string;
  ctaHeadline: string;
  ctaLabel: string;
};

// Indizes der FAQs, die im Test variieren
const AB_FAQS: Record<number, Record<FaqVariant, FaqAB>> = {
  2: {
    A: {
      a: 'Wir verkaufen nur an Menschen, die wir wirklich weiterbringen können. Keine Fake-Verknappung, keine emotionale Manipulation, keine Druck-Closes. Wenn ein Interessent nicht passt, sagen wir das offen — das schützt ihn und uns.',
      ctaHeadline: "Im 30-Min Strategie-Call prüfen wir Fit & Erfolgsaussichten — beidseitig.",
      ctaLabel: "Strategie-Call sichern",
    },
    B: {
      a: "Ethisches Closing heißt: Wir helfen jemandem zu kaufen — nicht, ihn zu überreden. Drei harte Regeln: keine erfundene Knappheit, keine Schuld- oder Angst-Trigger, keine Abschlüsse gegen erkennbares Bauchgefühl. Wer nicht passt, hört von uns ein klares Nein.",
      ctaHeadline: "Lerne im 30-Min Gespräch, wie ehrlicher Vertrieb in der Praxis aussieht — ohne Verkaufsdruck.",
      ctaLabel: "Jetzt ehrliches Gespräch buchen",
    },
  },
  5: {
    A: {
      a: 'Es gibt einen Einstiegsbeitrag in deine Ausbildung — Höhe und Modell besprechen wir transparent im Strategie-Call, weil sie von deinem Einstiegslevel abhängen. Wir verdienen zusätzlich an erfolgreich vermittelten Closern und an Partner-Provisionen. Wenn du nicht verdienst, verdienen wir nicht.',
      ctaHeadline: "Im 30-Min Strategie-Call prüfen wir Fit & Erfolgsaussichten — beidseitig.",
      ctaLabel: "Strategie-Call sichern",
    },
    B: {
      a: "Klare Antwort: Es gibt einen Einstiegsbeitrag, der zu deinem Level passt (L1–L3). Konkrete Zahlen nennen wir nur im Call, weil sie von deinem Einstiegslevel und deiner Verfügbarkeit abhängen — alles andere wäre unseriös. Unser Geschäftsmodell: Wir verdienen mit, wenn du verdienst. Kein Verdienst, keine Marge.",
      ctaHeadline: "Konkrete Zahlen, ehrliche Einschätzung — in 30 Minuten persönlich besprochen.",
      ctaLabel: "Zahlen im Strategie-Call klären",
    },
  },
};

// A/B-Test pausiert: Wir testen aktuell nur EINE Variable (Hero-Headline auf
// /masterofsales). Alle FAQ-Besucher sehen Variante A für stabile Baseline.
const assignVariant = (): FaqVariant => "A";

// HINWEIS — Stimmen anonymisiert.
// Es werden keine Namen, Alter, Städte oder Levels fabriziert. Sobald reale
// Mitglieder ihre Identität freigeben (Vorname · Alter · Stadt · ETC-Level),
// können diese Felder hier nachgepflegt werden.
const testimonials = [
  {
    quote:
      "Ich war skeptisch — bis zum dritten Call. Heute arbeite ich vier Tage die Woche, verdiene das Doppelte und schäme mich für nichts, was ich verkaufe.",
    name: "Mitglied · anonym",
    role: "Senior Closer · seit 14 Monaten",
    detail: "Vorher: Vertrieb in einer Versicherung",
  },
  {
    quote:
      "Es ist kein Coaching, es ist ein Karriereweg. Klare Stufen, klare KPIs, klare Erwartungen. Endlich ein Umfeld, das mich ernst nimmt.",
    name: "Mitglied · anonym",
    role: "Closer · seit 9 Monaten",
    detail: "Vorher: Marketing-Agentur",
  },
  {
    quote:
      "Was mich überzeugt hat: Sie haben mir auch ehrlich gesagt, dass es nicht für jeden passt. Genau das hat mir das Vertrauen gegeben einzusteigen.",
    name: "Mitglied · anonym",
    role: "Setter · seit 6 Monaten",
    detail: "Vorher: Selbstständig im Handwerk",
  },
];

const faqs = [
  {
    q: "Ist das ein Coaching, MLM oder ein klassisches Coaching-Programm?",
    a: "Nein. Wir sind eine Karriereplattform für ethischen Vertrieb. Du wirst zum Closer ausgebildet und vermittelt — an seriöse Premium-Partner, nicht an dein eigenes Netzwerk. Es gibt keine Strukturvertriebs-Logik und keine Pflicht, irgendetwas zu rekrutieren.",
  },
  {
    q: 'Ist das ein Coaching, MLM oder ein klassisches Coaching-Programm?',
    a: 'Nein. Wir sind eine Karriereplattform für ethischen Vertrieb. Du wirst zum Closer ausgebildet und vermittelt — an seriöse Premium-Partner, nicht an dein eigenes Netzwerk. Es gibt keine Strukturvertriebs-Logik und keine Pflicht, irgendetwas zu rekrutieren.',
  },
  {
    q: 'Was bedeutet „ethisches Closing" konkret?',
    a: 'Wir verkaufen nur an Menschen, die wir wirklich weiterbringen können. Keine Fake-Verknappung, keine emotionale Manipulation, keine Druck-Closes. Wenn ein Interessent nicht passt, sagen wir das offen — das schützt ihn und uns.',
  },
  {
    q: "Wie läuft der Weg bis zum Strategie-Call ab?",
    a: "1) Du bewirbst dich in 3–5 Minuten online. 2) Wir prüfen deine Antworten manuell innerhalb von 24h. 3) Bei Passung erhältst du einen Link, um deinen 30-Min Strategie-Call zu buchen. 4) Im Call prüfen wir Fit & Erfolgsaussichten — beidseitig.",
  },
  {
    q: "Was passiert im Strategie-Call?",
    a: "Kein Verkaufsgespräch. Wir nehmen uns 30 Minuten Zeit, um deine Situation, deine Ziele und deine Voraussetzungen zu verstehen. Du bekommst eine ehrliche Einschätzung, wie ein Karriereweg bei uns für dich aussehen würde — oder warum es aktuell nicht passt.",
  },
  {
    q: "Was kostet die Ausbildung und wie verdient ihr Geld?",
    a: "Es gibt einen Einstiegsbeitrag in deine Ausbildung — Höhe und Modell besprechen wir transparent im Strategie-Call, weil sie von deinem Einstiegslevel abhängen. Wir verdienen zusätzlich an erfolgreich vermittelten Closern und an Partner-Provisionen. Wenn du nicht verdienst, verdienen wir nicht.",
  },
  {
    q: "Brauche ich Vorerfahrung im Vertrieb?",
    a: "Nein. Etwa 60% unserer Closer hatten vorher keinen klassischen Vertriebshintergrund. Wichtiger sind: Sprachgefühl, Disziplin, Ehrlichkeit und die Bereitschaft, 8–12 Wochen konzentriert zu lernen.",
  },
  {
    q: "Wie schnell kann ich erste Ergebnisse sehen?",
    a: "Realistisch sind 4–8 Wochen bis zum ersten echten Abschluss, je nach Einstiegslevel und Einsatz. Wir versprechen keine Wundereinkommen — wir versprechen einen klaren, messbaren Karriereweg.",
  },
  {
    q: "Was, wenn ich mich bewerbe und es passt nicht?",
    a: "Dann sagen wir es dir ehrlich — entweder schon nach der Bewerbung oder spätestens im Strategie-Call. Es entstehen dir keine Kosten und kein Druck. Auswahl statt Druck ist nicht nur ein Slogan.",
  },
];

// CTA-Block mit Viewport-Tracking (IntersectionObserver)
// Feuert `faq_cta_view` einmal pro FAQ-Position pro Session — vergleichbar zu `faq_cta_click`.
type FaqCtaBlockProps = {
  index: number;
  question: string;
  ctaHeadline: string;
  ctaLabel: string;
  sourceSuffix: string;
  experiment_id?: string;
  variant?: FaqVariant;
};

const VIEW_DEDUP_KEY = "etc:faq:cta_viewed:v1";

const getViewedSet = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(VIEW_DEDUP_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const persistViewedSet = (set: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(VIEW_DEDUP_KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
};

const FaqCtaBlock = ({
  index,
  question,
  ctaHeadline,
  ctaLabel,
  sourceSuffix,
  experiment_id: experiment,
  variant,
}: FaqCtaBlockProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const dedupId = `${experiment ?? "default"}:${variant ?? "x"}:${index}`;
    if (getViewedSet().has(dedupId)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            trackFunnelEvent("faq_cta_view", {
              funnel: "masterofsales",
              question,
              position: index + 1,
              cta_label: ctaLabel,
              experiment_id: experiment,
              variant,
            });
            const next = getViewedSet();
            next.add(dedupId);
            persistViewedSet(next);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [index, question, ctaLabel, experiment, variant]);

  return (
    <div
      ref={ref}
      data-faq-cta-position={index + 1}
      className="mt-5 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4"
    >
      <p className="text-sm text-foreground/80">{ctaHeadline}</p>
      <Link
        to={`/apply/quiz?aud=men&source=masterofsales-faq-${index + 1}${sourceSuffix}`}
        onClick={() =>
          trackFunnelEvent("faq_cta_click", {
            funnel: "masterofsales",
            question,
            position: index + 1,
            cta_label: ctaLabel,
            experiment_id: experiment,
            variant,
          })
        }
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium tracking-wide text-background transition hover:opacity-90"
      >
        <Calendar className="h-4 w-4" />
        {ctaLabel}
      </Link>
    </div>
  );
};

const TestimonialsAndFaq = () => {
  const [lastOpen, setLastOpen] = useState<string | null>(null);
  const variant = useMemo<FaqVariant>(() => assignVariant(), []);

  // Render-FAQs: bei Test-Indizes Antwort durch Variante ersetzen
  const renderedFaqs = useMemo(
    () =>
      faqs.map((f, i) => {
        const ab = AB_FAQS[i]?.[variant];
        return ab ? { ...f, a: ab.a } : f;
      }),
    [variant],
  );

  // Exposure-Event: einmal pro Mount feuern, damit wir wissen wer welche Variante gesehen hat
  useEffect(() => {
    trackFunnelEvent("experiment_exposure", {
      experiment_id: EXPERIMENT_ID,
      variant,
      funnel: "masterofsales",
      tested_positions: Object.keys(AB_FAQS).map((k) => Number(k) + 1),
    });
  }, [variant]);

  return (
    <>
      {/* Testimonials */}
      <section className="border-y border-foreground/10 bg-background">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-10">
          <div className="mb-14 max-w-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-accent">
              Stimmen aus dem Karriereweg
            </p>
            <h2 className="mt-4 font-serif text-3xl leading-tight md:text-5xl">
              Echte Menschen. Echte Wege. Keine Inszenierung.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-foreground/70 md:text-lg">
              Wir zeigen dir nicht die lauten Erfolgsgeschichten — sondern die
              ruhigen, ehrlichen.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {testimonials.map((t) => (
              <article
                key={t.name}
                className="flex h-full flex-col rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-8 transition hover:border-accent/40 hover:bg-foreground/[0.04]"
              >
                <div
                  className="font-serif text-3xl leading-none text-accent"
                  aria-hidden
                >
                  &ldquo;
                </div>
                <p className="mt-4 text-base leading-relaxed text-foreground/85">
                  {t.quote}
                </p>
                <div className="mt-8 border-t border-foreground/10 pt-5">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-accent">
                    {t.role}
                  </p>
                  <p className="mt-2 text-xs text-foreground/55">{t.detail}</p>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-10 text-xs text-foreground/50">
            Aussagen anonymisiert auf Wunsch der Mitglieder. Identität dem
            Veranstalter bekannt. Wir fabrizieren weder Namen noch Personen.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-background">
        <div className="mx-auto max-w-3xl px-6 py-24 md:px-10">
          <div className="mb-12 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-accent">
              Ethik, Seriosität, Ablauf
            </p>
            <h2 className="mt-4 font-serif text-3xl leading-tight md:text-5xl">
              Die Fragen, die du dir gerade stellst.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-foreground/70 md:text-lg">
              Klar beantwortet — bevor du irgendetwas entscheidest.
            </p>
          </div>

          <Accordion
            type="single"
            collapsible
            className="w-full"
            onValueChange={(value) => {
              // Tracking-Konvention:
              // - `experiment_id` + `variant` werden IMMER mitgesendet (auch für Nicht-A/B-Items),
              //   damit wir je Variante auswerten können, welche FAQ-Items geöffnet wurden.
              // - `is_ab_item` markiert, ob dieser FAQ-Eintrag selbst Teil des A/B-Tests ist.
              // - `item_id` ist eine stabile, sprachunabhängige ID je FAQ-Position.
              const buildPayload = (idx: number, fallbackQuestion: string) => ({
                funnel: "masterofsales",
                experiment_id: EXPERIMENT_ID,
                variant,
                item_id: `faq_${idx + 1}`,
                position: idx + 1,
                total: faqs.length,
                question: faqs[idx]?.q ?? fallbackQuestion,
                is_ab_item: Boolean(AB_FAQS[idx]),
              });

              if (lastOpen && lastOpen !== value) {
                const idx = parseInt(lastOpen.replace("item-", ""), 10);
                trackFunnelEvent("faq_close", buildPayload(idx, lastOpen));
              }
              if (value) {
                const idx = parseInt(value.replace("item-", ""), 10);
                trackFunnelEvent("faq_open", buildPayload(idx, value));
                // Brief-Spec canonical alias (Micro-CRO Sprint).
                trackFunnelEvent("faq_expand", {
                  question: faqs[idx]?.q ?? value,
                  page: "masterofsales",
                  position: idx + 1,
                });
              }
              setLastOpen(value || null);
            }}
          >
            {renderedFaqs.map((f, i) => {
              const ab = AB_FAQS[i]?.[variant];
              const ctaHeadline =
                ab?.ctaHeadline ??
                "Im 30-Min Strategie-Call prüfen wir Fit & Erfolgsaussichten — beidseitig.";
              const ctaLabel = ab?.ctaLabel ?? "Strategie-Call sichern";
              const sourceSuffix = ab ? `-${variant.toLowerCase()}` : "";

              return (
                <AccordionItem
                  key={`item-${i}`}
                  value={`item-${i}`}
                  className="border-b border-foreground/10"
                >
                  <AccordionTrigger className="py-5 text-left font-serif text-lg leading-snug hover:no-underline md:text-xl">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-6 text-base leading-relaxed text-foreground/75">
                    {f.a}
                    <FaqCtaBlock
                      index={i}
                      question={f.q}
                      ctaHeadline={ctaHeadline}
                      ctaLabel={ctaLabel}
                      sourceSuffix={sourceSuffix}
                      experiment_id={ab ? EXPERIMENT_ID : undefined}
                      variant={ab ? variant : undefined}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          <p className="mt-10 text-center text-xs text-foreground/50">
            Noch eine Frage offen? Stell sie uns direkt im 30-Min Strategie-Call.
          </p>
        </div>
      </section>
    </>
  );
};

export default TestimonialsAndFaq;
