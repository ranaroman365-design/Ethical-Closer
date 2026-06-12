import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";

const SelfDeterminationSection = () => {
  const { t } = useLanguage();

  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h2 className="mb-8 font-serif text-3xl font-semibold text-foreground md:text-4xl">
            {t('self_determination_headline')}
          </h2>

          <div className="mx-auto max-w-lg space-y-4 font-sans text-base leading-relaxed text-muted-foreground">
            <p className="whitespace-pre-line">{t('self_determination_body_1')}</p>
            <p>{t('self_determination_body_2')}</p>
            <p className="font-medium text-foreground">
              {t('self_determination_highlight')}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default SelfDeterminationSection;
