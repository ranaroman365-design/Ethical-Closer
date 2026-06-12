import { motion } from 'framer-motion';
import { PRODUCT } from '@/config/product';
import { Link } from 'react-router-dom';
import {
  GraduationCap, Target, Briefcase, Users, Award, DollarSign,
  MessageCircle, Play, ArrowRight, Lock,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';

const FEATURES = [
  {
    icon: GraduationCap,
    title: { de: 'Academy', en: 'Academy' },
    desc: {
      de: 'Strukturiertes Training in Phasen — vom ersten Gespräch bis zur Zertifizierung.',
      en: 'Structured training in phases — from your first conversation to certification.',
    },
  },
  {
    icon: DollarSign,
    title: { de: 'Earn while you learn', en: 'Earn while you learn' },
    desc: {
      de: 'Starte direkt mit echten Leads und sammle erste Einnahmen — parallel zu deiner Ausbildung.',
      en: 'Start with real leads and earn your first income alongside your training.',
    },
  },
  {
    icon: Target,
    title: { de: 'Simulatoren', en: 'Simulators' },
    desc: {
      de: 'AI-gestützte Gesprächssimulationen für Opener, Setter und Closer.',
      en: 'AI-powered conversation simulations for Openers, Setters, and Closers.',
    },
  },
  {
    icon: Briefcase,
    title: { de: 'Workspaces', en: 'Workspaces' },
    desc: {
      de: 'Dein operativer Arbeitsbereich mit Lead-Management, KPIs und Echtzeit-Daten.',
      en: 'Your operational workspace with lead management, KPIs, and real-time data.',
    },
  },
  {
    icon: Users,
    title: { de: 'Community', en: 'Community' },
    desc: {
      de: 'Zugang zu deiner Stufen-Community, Mentoren und direktem Austausch.',
      en: 'Access to your level community, mentors, and direct exchange.',
    },
  },
  {
    icon: Award,
    title: { de: 'Zertifizierung', en: 'Certification' },
    desc: {
      de: 'Nachweis deiner Qualifikation — Voraussetzung für Placement und Karrierefortschritt.',
      en: 'Proof of your qualification — prerequisite for placement and career progression.',
    },
  },
  {
    icon: MessageCircle,
    title: { de: 'Karriereweg & Placement', en: 'Career Path & Placement' },
    desc: {
      de: 'Ein klarer Weg vom Trainee bis zum Partner — mit realen Vermittlungsmöglichkeiten.',
      en: 'A clear path from Trainee to Partner — with real placement opportunities.',
    },
  },
];

export default function PortalPreview() {
  const { lang } = useLanguage();
  const { profile } = useAuth();
  const firstName = (profile as any)?.full_name?.split(' ')[0] || '';
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-10"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
          {tl('Vorschau', 'Preview')}
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mb-3">
          {tl(
            firstName ? `${firstName}, das erwartet dich im Portal` : 'Das erwartet dich im Portal',
            firstName ? `${firstName}, what awaits you inside` : 'What awaits you inside the portal'
          )}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {tl(
            `${PRODUCT.name} ist mehr als ein Kurs. Es ist eine professionelle Karriere-Infrastruktur — mit Training, Praxis, Zertifizierung und echten Vermittlungsmöglichkeiten.`,
            `${PRODUCT.name} is more than a course. It is a professional career infrastructure — with training, practice, certification, and real placement opportunities.`
          )}
        </p>
      </motion.div>

      {/* Video placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="mb-10 rounded-xl border border-border/40 bg-card overflow-hidden"
      >
        <div className="flex aspect-video items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <Play className="h-6 w-6 text-accent ml-0.5" />
            </div>
            <p className="text-xs font-medium">
              {tl('Einführungsvideo — demnächst verfügbar', 'Intro video — coming soon')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Feature grid */}
      <div className="space-y-3">
        {FEATURES.map((feat, i) => {
          const Icon = feat.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 + 0.25 }}
              className="rounded-xl border border-border/40 bg-card p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-foreground mb-1">
                    {feat.title[lang]}
                  </p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    {feat.desc[lang]}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-10 rounded-xl border border-accent/20 bg-accent/[0.04] p-6 text-center"
      >
        <Lock className="mx-auto h-5 w-5 text-muted-foreground mb-3" />
        <p className="font-serif text-lg font-semibold text-foreground mb-2">
          {tl('Voller Zugang nach dem Gespräch', 'Full access after your conversation')}
        </p>
        <p className="text-[12px] text-muted-foreground mb-4">
          {tl(
            'Nach deinem Klarheitsgespräch werden alle Bereiche für dich freigeschaltet.',
            'After your clarity conversation, all areas will be unlocked for you.'
          )}
        </p>
        <Link
          to="/members/interview"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:shadow-md hover:shadow-primary/20"
        >
          {tl('Zum Bewerbungsgespräch', 'Go to interview')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>
    </div>
  );
}
