import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { Link } from "react-router-dom";
import { trackHomeCta } from "@/lib/home-tracking";
import { useExperiment, EXPERIMENTS } from "@/lib/experiments";

const learnings = {
  de: [
    "Wie High-Ticket Closing real funktioniert",
    "Welche Voraussetzungen erfüllt sein müssen",
    "Wie der 9–5 Übergang praktisch aussieht",
    "Welche Fehler 90 % machen",
    "Ob dieses Modell für dich geeignet ist",
  ],
  en: [
    "How high-ticket closing actually works",
    "What prerequisites you need",
    "How the 9-to-5 transition works in practice",
    "The mistakes 90% of people make",
    "Whether this model is right for you",
  ],
};

const MasterclassBlock = () => {
  const { tx, lang } = useLanguage();
  const items = learnings[lang];

  // A/B test: ladder (default — quiz with intent) vs. control (legacy direct route)
  const variant = useExperiment(EXPERIMENTS.LADDER_VS_ROUTE);
  const isLadder = variant === "ladder";

  const destination = isLadder ? "/start/quiz?intent=masterclass" : "/start/masterclass";
  const ctaLabel = isLadder
    ? tx("Qualifizieren & Masterclass freischalten", "Qualify & Unlock the Masterclass")
    : tx("Jetzt Zugang zur Masterclass sichern", "Get Access to the Masterclass");
  const subline = isLadder
    ? tx("60 Sekunden · Kein Risiko · Sofortiger Zugang", "60 seconds · No risk · Instant access")
    : tx("Kein Risiko · Sofortiger Zugang · Jederzeit pausierbar", "No risk · Instant access · Pause anytime");

  return (
    <section className="bg-card py-20 md:py-28">
      <div className="container mx-auto max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-8 flex items-center justify-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
            <span className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-destructive">
              {tx('Masterclass jetzt verfügbar', 'Masterclass now available')}
            </span>
          </div>

          <h2 className="mb-8 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
            {tx('In dieser Masterclass lernst du:', 'In this Masterclass you will learn:')}
          </h2>

          <ul className="mb-8 space-y-3">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 text-accent">•</span>
                <span className="font-sans text-base text-foreground">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mb-10 flex flex-wrap items-center justify-center gap-6 font-sans text-sm text-muted-foreground">
            <span>{tx('Dauer:', 'Duration:')} <span className="font-medium text-foreground">{tx('32 Minuten', '32 minutes')}</span></span>
            <span className="hidden sm:inline">·</span>
            <span>
              {isLadder
                ? tx('Zugriff direkt nach 60-Sekunden-Qualifikation', 'Access right after 60-second qualification')
                : tx('Direkter Zugriff', 'Direct access')}
            </span>
          </div>

          <div className="text-center">
            <Link
              to={destination}
              onClick={() =>
                trackHomeCta(
                  isLadder ? "primary_quiz" : "masterclass",
                  "masterclass_block",
                  destination,
                  {
                    cta_type: "soft_yes",
                    intent: "masterclass",
                    experiment_id: EXPERIMENTS.LADDER_VS_ROUTE.id,
                    variant,
                  },
                )
              }
              className="rounded-sm bg-primary px-10 py-4 font-sans text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90 inline-block"
            >
              {ctaLabel}
            </Link>
            <p className="mt-3 font-sans text-xs text-muted-foreground">{subline}</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default MasterclassBlock;
