import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Building2, ArrowRight, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';

const PATHS = [
  {
    icon: Users,
    title: { de: 'Internes Team aufbauen', en: 'Build Internal Team' },
    desc: { de: 'Rekrutiere und entwickle eigene Closer innerhalb der Plattform.', en: 'Recruit and develop your own closers within the platform.' },
    to: '/members/director-workspace',
  },
  {
    icon: Building2,
    title: { de: 'Externe Partnerunternehmen', en: 'External Partner Companies' },
    desc: { de: 'Nutze die Plattform als Infrastruktur für externe Unternehmen.', en: 'Use the platform as infrastructure for external companies.' },
    to: '/members/partner-hub',
  },
  {
    icon: Layers,
    title: { de: 'Associate Director Track', en: 'Associate Director Track' },
    desc: { de: 'Externe Closer, die die Plattform kommerziell nutzen und Teams aufbauen.', en: 'External closers who use the platform commercially and build teams.' },
    to: '/members/director-onboarding',
  },
];

export default function ScaleHub() {
  const { profile, isAdmin } = useAuth();
  const { lang } = useLanguage();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="h-5 w-5 text-accent" />
          <h1 className="font-serif text-xl font-bold text-foreground">
            {lang === 'de' ? 'Scale Hub' : 'Scale Hub'}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          {lang === 'de'
            ? 'Dein nächster Schritt nach dem Placement: Skaliere dein Business mit der Plattform.'
            : 'Your next step after placement: Scale your business with the platform.'}
        </p>
      </motion.div>

      <div className="space-y-4">
        {PATHS.map((path, i) => {
          const Icon = path.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 + 0.2 }}
            >
              <Link
                to={path.to}
                className="group flex items-start gap-4 rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-accent/40 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                    {path.title[lang]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{path.desc[lang]}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-10 rounded-xl border border-accent/20 bg-accent/[0.03] p-5"
      >
        <p className="text-xs font-semibold text-accent mb-1">
          {lang === 'de' ? 'Partner Track' : 'Partner Track'}
        </p>
        <p className="text-xs text-muted-foreground">
          {lang === 'de'
            ? 'Bringe Partnerunternehmen auf die Plattform und werde Associate Partner → Equity Partner → Managing Partner.'
            : 'Bring partner companies onto the platform and become Associate Partner → Equity Partner → Managing Partner.'}
        </p>
      </motion.div>
    </div>
  );
}
