import { motion } from "framer-motion";
import { SlideH2, SlideP, SlideSupport } from "./Slide";
import { useLanguage } from "./LanguageContext";
import decisionMomentBg from "@/assets/slide-decision-moment.jpg";

const SlideDecisionMoment = () => {
  const { tx } = useLanguage();

  return (
    <section className="min-h-screen flex items-center justify-center snap-start relative overflow-hidden">
      <img src={decisionMomentBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" />
      <div className="absolute inset-0 bg-background/85" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="container mx-auto max-w-3xl px-6 py-20 md:py-28 relative z-10"
      >
        <SlideH2>{tx("In the end, it is a decision.", "Am Ende ist es eine Entscheidung.")}</SlideH2>

        <div className="space-y-4 mt-8 mb-10">
          <p className="font-sans text-base opacity-80">
            {tx("Not the decision for a program.", "Nicht die Entscheidung für ein Programm.")}
          </p>
          <p className="font-serif text-xl md:text-2xl opacity-80">
            {tx("But the decision whether you want to build a skill that can change your professional life.",
              "Sondern die Entscheidung, ob du eine Fähigkeit aufbauen willst, die dein berufliches Leben verändern kann.")}
          </p>
        </div>

        <div className="border-l-2 border-accent/30 pl-6 space-y-4 mb-10">
          <p className="font-sans text-sm opacity-60">
            {tx("Many people stop exactly at this point. They think:", "Viele Menschen bleiben genau an diesem Punkt stehen. Sie denken:")}
          </p>
          {[
            tx('"Maybe later."', '„Vielleicht später."'),
            tx('"Maybe next year."', '„Vielleicht nächstes Jahr."'),
            tx('"Maybe when everything is calmer."', '„Vielleicht wenn alles ruhiger ist."'),
          ].map((item) => (
            <p key={item} className="font-serif text-lg italic opacity-70">{item}</p>
          ))}
        </div>

        <div className="p-6 rounded-lg border border-accent/20 bg-card/50 backdrop-blur-sm mb-10">
          <p className="font-serif text-lg font-medium opacity-90 mb-3">
            {tx("But the truth is:", "Aber die Wahrheit ist:")}
          </p>
          <p className="font-serif text-xl md:text-2xl font-semibold">
            {tx("The right moment rarely feels perfect.", "Der richtige Moment fühlt sich selten perfekt an.")}
          </p>
          <p className="font-sans text-sm opacity-60 mt-4">
            {tx('The people who actually change something do not say: "I\'ll give it a try."',
              'Die Menschen, die tatsächlich etwas verändern, sagen nicht: „Ich probiere es mal."')}
          </p>
          <p className="font-serif text-lg font-medium mt-2">
            {tx('They say: "If I do this, I do it right."',
              '„Wenn ich das mache, dann mache ich es richtig."')}
          </p>
        </div>

        <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mb-6">
          {tx("Today is not about pressure. Today is about clarity.", "Heute geht es nicht um Druck. Heute geht es um Klarheit.")}
        </p>

        <div className="grid sm:grid-cols-2 gap-6 mb-10">
          <div className="p-6 rounded-lg border border-border/50 bg-card/50">
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-muted-foreground mb-3">
              {tx("Option 1", "Option 1")}
            </p>
            <p className="font-sans text-base opacity-80">
              {tx("You continue as before. That is completely fine. Many people do that.",
                "Du gehst einfach weiter wie bisher. Das ist völlig in Ordnung. Viele Menschen tun das.")}
            </p>
          </div>
          <div className="p-6 rounded-lg border border-accent/30 bg-card/50">
            <p className="font-sans text-xs uppercase tracking-[0.15em] text-accent mb-3">
              {tx("Option 2", "Option 2")}
            </p>
            <p className="font-sans text-base opacity-80">
              {tx("You seriously explore whether this path could be right for you.",
                "Du prüfst ernsthaft, ob dieser Weg zu dir passen könnte.")}
            </p>
          </div>
        </div>

        <SlideSupport>
          {tx("And that is exactly what the next step is for. A conversation.",
            "Und genau dafür gibt es den nächsten Schritt. Ein Gespräch.")}
        </SlideSupport>
      </motion.div>
    </section>
  );
};

export default SlideDecisionMoment;
