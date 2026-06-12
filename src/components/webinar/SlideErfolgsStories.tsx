import { motion } from "framer-motion";
import { SlideH2, SlideP, SlideSupport } from "./Slide";
import { useLanguage } from "./LanguageContext";
import erfolgsStoriesBg from "@/assets/slide-erfolgs-stories.jpg";

const SlideErfolgsStories = () => {
  const { tx } = useLanguage();

  return (
    <section className="min-h-screen flex items-center justify-center snap-start relative overflow-hidden">
      <img src={erfolgsStoriesBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" />
      <div className="absolute inset-0 bg-background/85" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="container mx-auto max-w-3xl px-6 py-20 md:py-28 relative z-10"
      >
        <SlideH2>{tx("Maybe you recognize yourself here.", "Vielleicht erkennst du dich hier wieder.")}</SlideH2>

        <div className="space-y-4 mt-8">
          <p className="font-sans text-base opacity-80">Thomas {tx("is", "ist")} 41.</p>
          <p className="font-sans text-base opacity-80">
            {tx("Project manager at a good company.", "Projektmanager in einem guten Unternehmen.")}
          </p>
          <p className="font-sans text-base opacity-80">
            {tx("Stable income.", "Stabiles Einkommen.")}
          </p>
          <p className="font-sans text-base opacity-80">
            {tx("Solid resume.", "Ordentlicher Lebenslauf.")}
          </p>
          <p className="font-sans text-base opacity-80">
            {tx("Essentially did everything right.", "Eigentlich alles richtig gemacht.")}
          </p>
        </div>

        <p className="font-serif text-xl md:text-2xl italic opacity-80 mt-10 mb-6">
          {tx("And yet, at some point he realizes:", "Und trotzdem merkt er irgendwann:")}
        </p>
        <p className="font-serif text-2xl md:text-3xl font-semibold mb-8">
          {tx("Something no longer fits.", "Etwas passt nicht mehr.")}
        </p>

        <p className="font-sans text-base opacity-70 mb-4">
          {tx("The job is not bad. But:", "Der Job ist nicht schlecht. Aber:")}
        </p>
        <ul className="space-y-3 mb-8">
          {[
            tx("Too little freedom", "Zu wenig Freiheit"),
            tx("Too little creative control", "Zu wenig Gestaltungsspielraum"),
            tx("Too much time for money", "Zu viel Zeit gegen Geld"),
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 font-sans text-base">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <span className="opacity-85">{item}</span>
            </li>
          ))}
        </ul>

        <p className="font-serif text-lg italic opacity-70 mb-10">
          {tx('And the quiet question in the background: "Was that it?"',
            'Und die leise Frage im Hintergrund: „War das schon alles?"')}
        </p>

        <div className="border-l-2 border-accent/30 pl-6 space-y-4 mb-10">
          <p className="font-sans text-base opacity-80">
            {tx("Then he discovers a concept he never knew before:", "Dann entdeckt er ein Konzept, das er vorher nicht kannte:")}
          </p>
          <p className="font-serif text-xl font-semibold">High-Ticket Closing.</p>
          <p className="font-sans text-sm opacity-60">
            {tx("A skill. No own product. No social media pressure. Not self-employment in the traditional sense.",
              "Eine Fähigkeit. Kein eigenes Produkt. Kein Social-Media-Druck. Keine Selbstständigkeit im klassischen Sinn.")}
          </p>
        </div>

        <p className="font-sans text-sm opacity-60 mb-2">
          {tx("He starts learning. Alongside his job. He learns:", "Er beginnt, sich damit zu beschäftigen. Neben seinem Job. Er lernt:")}
        </p>
        <ul className="space-y-3 mb-8">
          {[
            tx("How buying decisions actually happen", "Wie Kaufentscheidungen wirklich entstehen"),
            tx("How to lead conversations with structure", "Wie man Gespräche strukturiert führt"),
            tx("How to guide people through important decisions", "Wie man Menschen bei wichtigen Entscheidungen begleitet"),
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 font-sans text-base">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <span className="opacity-85">{item}</span>
            </li>
          ))}
        </ul>

        <div className="p-6 rounded-lg border border-accent/20 bg-card/50 backdrop-blur-sm mb-8">
          <p className="font-sans text-base opacity-80 mb-2">
            {tx("A few months later, he leads his first conversations. Then the first closes.",
              "Ein paar Monate später führt er seine ersten Gespräche. Dann die ersten Abschlüsse.")}
          </p>
          <p className="font-serif text-lg font-medium">
            {tx("Not overnight. But step by step.", "Nicht über Nacht. Aber Schritt für Schritt.")}
          </p>
          <p className="font-sans text-sm opacity-60 mt-3">
            {tx("Today he works: partly remote, with significantly more freedom, and a skill he can use anywhere.",
              "Heute arbeitet er: teilweise remote, mit deutlich mehr Freiheit, und einer Fähigkeit, die er überall einsetzen kann.")}
          </p>
        </div>

        <SlideSupport>
          {tx("Not every path looks exactly like this. But for many people, it starts right here: with the decision to learn a new skill.",
            "Nicht jeder Weg sieht genau so aus. Aber für viele Menschen beginnt er genau hier: Mit der Entscheidung, eine neue Fähigkeit zu lernen.")}
        </SlideSupport>
      </motion.div>
    </section>
  );
};

export default SlideErfolgsStories;
