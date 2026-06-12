import { motion } from "framer-motion";
import {
  trackProofClick,
  trackProofView,
  useProofViewTracker,
  type ProofType,
} from "@/lib/home-tracking";

/**
 * Each entry carries a stable `id` so analytics events
 * (`home_proof_view` / `home_proof_click`) can be sliced per asset
 * across deploys without depending on copy or order.
 */
const testimonials = [
  { id: "sarah_m", name: "Sarah M.", role: "Quereinsteigerin, vorher Marketing", quote: "Zum ersten Mal fühlt sich Verkaufen nicht falsch an. Ich schließe jetzt mit Klarheit – und die Kunden danken mir dafür." },
  { id: "tobias_k", name: "Tobias K.", role: "ehem. Unternehmensberater", quote: "Endlich eine Ausbildung, die Verkauf als Handwerk behandelt. Kein Hype, keine leeren Versprechen." },
  { id: "lena_r", name: "Lena R.", role: "Freelancerin, Coaching-Branche", quote: "Meine Abschlussquote hat sich verdoppelt – und ich schlafe besser, weil ich weiß, dass meine Kunden wirklich passen." },
  { id: "markus_d", name: "Markus D.", role: "Sales, SaaS", quote: "Die Skripte und Frameworks sind Gold wert. Endlich Struktur statt Bauchgefühl." },
  { id: "julia_w", name: "Julia W.", role: "Quereinsteigerin, vorher HR", quote: "Ich hätte nie gedacht, dass Closing ethisch sein kann. Dieses Programm hat meine Sicht komplett verändert." },
  { id: "christian_b", name: "Christian B.", role: "Closer, High-Ticket", quote: "Praxis, Feedback, klare Standards – genau das hat mir bei anderen Ausbildungen gefehlt." },
];

const metrics = [
  { id: "income_uplift", label: "Einkommenssteigerung (Ø)", value: "+2.800 €/Monat" },
  { id: "close_rate", label: "Abschlussquote (Teilnehmer-Ø)", value: "38 %" },
  { id: "price_confidence", label: "Sicherer in Preisgesprächen", value: "94 %" },
];

const LOCATION = "testimonials";

/** Single metric tile with one-shot view tracking. */
const MetricTile = ({
  m,
  index,
}: {
  m: (typeof metrics)[number];
  index: number;
}) => {
  const ref = useProofViewTracker<HTMLDivElement>({
    proofId: m.id,
    proofType: "metric",
    location: LOCATION,
    position: index,
    extra: { metric_value: m.value },
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      onClick={() =>
        trackProofClick({
          proofId: m.id,
          proofType: "metric",
          location: LOCATION,
          position: index,
          extra: { metric_value: m.value },
        })
      }
      className="cursor-pointer rounded-sm border border-accent/30 bg-background p-6 text-center transition-colors hover:border-accent/60"
    >
      <p className="mb-1 font-serif text-2xl font-semibold text-accent">{m.value}</p>
      <p className="font-sans text-xs text-muted-foreground">{m.label}</p>
    </motion.div>
  );
};

/** Single testimonial card with view + click tracking. */
const TestimonialCard = ({
  t,
  index,
}: {
  t: (typeof testimonials)[number];
  index: number;
}) => {
  const proofType: ProofType = "testimonial_card";
  const ref = useProofViewTracker<HTMLDivElement>({
    proofId: t.id,
    proofType,
    location: LOCATION,
    position: index,
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      onClick={() =>
        trackProofClick({
          proofId: t.id,
          proofType,
          location: LOCATION,
          position: index,
        })
      }
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          trackProofClick({
            proofId: t.id,
            proofType,
            location: LOCATION,
            position: index,
          });
        }
      }}
      className="cursor-pointer rounded-sm border border-border bg-background p-6 transition-colors hover:border-accent/40"
    >
      <p className="mb-4 font-sans text-sm italic leading-relaxed text-muted-foreground">
        „{t.quote}"
      </p>
      <div>
        <p className="font-sans text-sm font-medium text-foreground">{t.name}</p>
        <p className="font-sans text-xs text-muted-foreground">{t.role}</p>
      </div>
    </motion.div>
  );
};

const TestimonialsSection = () => {
  // Block-level view event — fires once when the testimonials grid scrolls in.
  const blockRef = useProofViewTracker<HTMLDivElement>(
    {
      proofId: "testimonials_block",
      proofType: "testimonial_card",
      location: LOCATION,
      extra: { variant: "block" },
    },
    0.2,
  );

  return (
    <section className="bg-card py-20 md:py-28">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center"
          onViewportEnter={() =>
            trackProofView({
              proofId: "testimonials_header",
              proofType: "testimonial_card",
              location: LOCATION,
              extra: { variant: "header" },
            })
          }
        >
          <h2 className="mb-4 font-serif text-3xl font-semibold text-foreground md:text-4xl">
            Ergebnisse &amp; Stimmen
          </h2>
          <p className="mx-auto mb-14 max-w-md font-sans text-sm text-muted-foreground">
            Ergebnisse variieren je nach Einsatz &amp; Ausgangslage.
          </p>
        </motion.div>

        {/* Metrics */}
        <div className="mx-auto mb-14 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {metrics.map((m, i) => (
            <MetricTile key={m.id} m={m} index={i} />
          ))}
        </div>

        {/* Testimonial cards */}
        <div
          ref={blockRef}
          className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {testimonials.map((t, i) => (
            <TestimonialCard key={t.id} t={t} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
