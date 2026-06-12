import { motion } from "framer-motion";
import { PRODUCT } from '@/config/product';
import { useLanguage } from "@/i18n/LanguageContext";
import { Link } from "react-router-dom";
import { trackHomeCta } from "@/lib/home-tracking";

const FinalCta = () => {
  const { t, tx } = useLanguage();

  return (
    <section className="bg-primary py-20 md:py-28">
      <div className="container mx-auto max-w-2xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="mb-6 font-serif text-3xl font-semibold text-primary-foreground md:text-4xl">
            {t('final_cta_headline')}
          </h2>

          <div className="mb-8">
            <Link
              to="/start/quiz"
              onClick={() => trackHomeCta("primary_quiz", "final_cta", "/start/quiz", { cta_type: "final" })}
              className="rounded-sm bg-accent px-10 py-4 font-sans text-sm font-medium tracking-wide text-accent-foreground transition-opacity hover:opacity-90 inline-block"
            >
              {t('final_cta_button')}
            </Link>
          </div>

          <p className="font-sans text-xs text-primary-foreground/60">
            {PRODUCT.brandLine}
          </p>
          <p className="mt-1 font-sans text-xs text-primary-foreground/50">
            {tx(
              'Keine Einkommensgarantie. Ergebnisse hängen von Einsatz und Markt ab.',
              'No income guarantee. Results depend on effort and market conditions.'
            )}
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default FinalCta;
