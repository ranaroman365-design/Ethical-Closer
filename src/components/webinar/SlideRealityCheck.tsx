import { motion } from "framer-motion";
import { SlideH2, SlideP, SlideSupport } from "./Slide";
import { useLanguage } from "./LanguageContext";
import realityCheckBg from "@/assets/slide-reality-check.jpg";

const SlideRealityCheck = () => {
  const { tx } = useLanguage();

  return (
    <section className="min-h-screen flex items-center justify-center snap-start relative overflow-hidden">
      <img src={realityCheckBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" />
      <div className="absolute inset-0 bg-background/85" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="container mx-auto max-w-3xl px-6 py-20 md:py-28 relative z-10"
      >
        <SlideH2>{tx("An honest reality check.", "Ein ehrlicher Reality-Check.")}</SlideH2>

        <div className="space-y-4 mt-8 mb-10">
          <p className="font-serif text-xl md:text-2xl opacity-80">
            {tx("High-Ticket Closing is not a magic shortcut.", "High-Ticket Closing ist keine magische Abkürzung.")}
          </p>
          <p className="font-serif text-xl md:text-2xl opacity-80">
            {tx("It is a skill.", "Es ist eine Fähigkeit.")}
          </p>
          <p className="font-sans text-base opacity-60 mt-4">
            {tx("And like every skill, it requires:", "Und wie jede Fähigkeit braucht sie:")}
          </p>
        </div>

        <ul className="space-y-3 mb-10">
          {["Training", tx("Practice", "Übung"), "Feedback", tx("Time", "Zeit")].map((item) => (
            <li key={item} className="flex items-start gap-3 font-sans text-base">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <span className="opacity-85">{item}</span>
            </li>
          ))}
        </ul>

        <div className="border-l-2 border-accent/30 pl-6 space-y-4 mb-10">
          <p className="font-sans text-base opacity-80">
            {tx("Most people do not fail because they lack talent.",
              "Die meisten Menschen scheitern nicht, weil sie zu wenig Talent haben.")}
          </p>
          <p className="font-sans text-base opacity-70">
            {tx("They fail because they try:", "Sie scheitern, weil sie versuchen:")}
          </p>
          <ul className="space-y-2">
            {[
              tx("to learn without structure", "ohne Struktur zu lernen"),
              tx("to practice without feedback", "ohne Feedback zu üben"),
              tx("to start without market access", "ohne Zugang zum Markt zu starten"),
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 font-sans text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive/50 shrink-0" />
                <span className="opacity-75">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-6 rounded-lg border border-accent/20 bg-card/50 backdrop-blur-sm mb-8">
          <p className="font-serif text-lg font-medium opacity-90 mb-3">
            {tx("That is exactly why we built this system.", "Genau deshalb haben wir dieses System aufgebaut.")}
          </p>
          <p className="font-sans text-base opacity-70 mb-4">
            {tx("Not just a course. But a complete path:", "Nicht nur ein Kurs. Sondern ein vollständiger Weg:")}
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              tx("Skill", "Fähigkeit"),
              tx("Practice", "Praxis"),
              tx("Network", "Netzwerk"),
              tx("Market access", "Marktzugang"),
            ].map((item) => (
              <span key={item} className="px-4 py-2 rounded-full border border-border bg-card font-sans text-sm">{item}</span>
            ))}
          </div>
        </div>

        <SlideSupport>
          {tx("If you are ready to build a real skill, closing can become one of the most valuable decisions of your professional career.",
            "Wenn du bereit bist, eine echte Fähigkeit aufzubauen, kann Closing eine der wertvollsten Entscheidungen deiner beruflichen Laufbahn werden.")}
        </SlideSupport>
      </motion.div>
    </section>
  );
};

export default SlideRealityCheck;
