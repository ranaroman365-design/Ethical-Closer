import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { Link } from "react-router-dom";
import { trackHomeCta } from "@/lib/home-tracking";

const BewerbungCta = () => {
  const { tx } = useLanguage();

  return (
    <section className="bg-background py-16 md:py-20">
      <div className="container mx-auto max-w-2xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="mb-6 font-serif text-2xl font-semibold text-foreground md:text-3xl">
            {tx('Bereit, den nächsten Schritt zu gehen?', 'Ready to take the next step?')}
          </p>
          <Link
            to="/start/quiz"
            onClick={() => trackHomeCta("primary_quiz", "bewerbung_cta", "/start/quiz", { cta_type: "secondary" })}
            className="rounded-sm bg-accent px-10 py-4 font-sans text-sm font-medium tracking-wide text-accent-foreground transition-opacity hover:opacity-90 inline-block"
          >
            {tx('Eignung prüfen', 'Check Your Fit')}
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

export default BewerbungCta;
