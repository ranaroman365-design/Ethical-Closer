import { motion } from "framer-motion";
import { SlideH2, SlideP, SlideSupport } from "./Slide";
import { useLanguage } from "./LanguageContext";
import marketOpportunityBg from "@/assets/slide-market-opportunity.jpg";

const SlideMarketOpportunity = () => {
  const { tx } = useLanguage();

  return (
    <section className="min-h-screen flex items-center justify-center snap-start relative overflow-hidden">
      <img src={marketOpportunityBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" />
      <div className="absolute inset-0 bg-background/85" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="container mx-auto max-w-3xl px-6 py-20 md:py-28 relative z-10"
      >
        <SlideH2>{tx("A market most people never see.", "Ein Markt, den die meisten Menschen nie sehen.")}</SlideH2>

        <SlideP>
          {tx("Over the last ten years, a new market has emerged.", "In den letzten zehn Jahren ist ein neuer Markt entstanden.")}
        </SlideP>
        <p className="font-serif text-xl md:text-2xl opacity-80 mb-8">
          {tx("Premium offers sold online.", "Premium-Angebote, die online verkauft werden.")}
        </p>

        <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mb-4">
          {tx("These markets are growing globally:", "Diese Märkte wachsen weltweit:")}
        </p>
        <div className="flex flex-wrap gap-3 mb-10">
          {["Coaching", tx("Education", "Weiterbildung"), "Consulting", tx("Health", "Gesundheit"), tx("Personal development", "Persönlichkeitsentwicklung"), tx("Financial education", "Finanzbildung"), "Premium Services"].map((item) => (
            <span key={item} className="px-4 py-2 rounded-full border border-border bg-card/50 font-sans text-sm">{item}</span>
          ))}
        </div>

        <p className="font-sans text-sm opacity-60 mb-4">
          {tx("Many of these programs cost:", "Viele dieser Programme kosten:")}
        </p>
        <div className="flex flex-wrap gap-4 mb-10">
          {["3.000 €", "5.000 €", "10.000 €", tx("or more", "oder mehr")].map((item) => (
            <span key={item} className="font-serif text-2xl font-semibold opacity-80">{item}</span>
          ))}
        </div>

        <div className="p-6 rounded-lg border border-accent/20 bg-card/50 backdrop-blur-sm mb-8">
          <p className="font-sans text-base opacity-80 mb-3">
            {tx("And these offers are almost never sold by buttons.", "Und diese Angebote werden fast nie durch Buttons verkauft.")}
          </p>
          <p className="font-serif text-xl font-semibold">
            {tx("They are decided in conversations.", "Sie werden in Gesprächen entschieden.")}
          </p>
        </div>

        <div className="border-l-2 border-accent/30 pl-6 mb-8">
          <p className="font-sans text-base opacity-80 mb-2">
            {tx("This is exactly where the demand for a skill arises:", "Genau dort entsteht der Bedarf für eine Fähigkeit:")}
          </p>
          <p className="font-serif text-2xl md:text-3xl font-semibold">High-Ticket Closing.</p>
        </div>

        <SlideP>
          {tx("When a market grows, so does the need for people who can lead these conversations professionally.",
            "Wenn ein Markt wächst, wächst auch der Bedarf an Menschen, die diese Gespräche professionell führen können.")}
        </SlideP>

        <SlideSupport>
          {tx("Not everyone builds a business. But many businesses need good closers.",
            "Nicht jeder baut ein Unternehmen. Aber viele Unternehmen brauchen gute Closers.")}
        </SlideSupport>
      </motion.div>
    </section>
  );
};

export default SlideMarketOpportunity;
