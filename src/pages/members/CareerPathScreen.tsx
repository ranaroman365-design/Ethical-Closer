import { useMemo } from 'react';
import ApplicantAppointmentSection from '@/components/members/ApplicantAppointmentSection';
import { Link } from 'react-router-dom';
import { PRODUCT } from '@/config/product';
import { useAuth } from '@/hooks/useAuth';
import { useAcademyData } from '@/hooks/useAcademyData';
import { useKpis } from '@/hooks/useKpis';
import { motion } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, Lock,
  GraduationCap, Target, Briefcase, Award,
  LayoutDashboard, TrendingUp, Layers, Eye, Users, Crown,
} from 'lucide-react';
import { STAGE_ORDER, getUserLevel, STAGE_LABELS } from '@/components/members/CareerPath';
import { useLanguage } from '@/i18n/LanguageContext';

interface SubItem {
  label: { de: string; en: string };
  to: string;
  requiresCertified?: boolean;
  requiresPlacement?: boolean;
}

const LEVEL_SUB_ITEMS: Record<number, SubItem[]> = {
  0: [],
  1: [
    { label: { de: 'Training', en: 'Training' }, to: '/members/academy' },
    { label: { de: 'Community', en: 'Community' }, to: '/members/community' },
  ],
  2: [
    { label: { de: 'Training', en: 'Training' }, to: '/members/academy' },
    { label: { de: 'Call Framework', en: 'Call Framework' }, to: '/members/call-framework' },
    { label: { de: 'Community', en: 'Community' }, to: '/members/community' },
  ],
  3: [
    { label: { de: 'Zertifizierung', en: 'Certification' }, to: '/members/certification' },
    { label: { de: 'Community', en: 'Community' }, to: '/members/community' },
  ],
  4: [
    { label: { de: 'Closer Framework', en: 'Closer Framework' }, to: '/members/closer-framework' },
    { label: { de: 'Placement', en: 'Placement' }, to: '/members/placement' },
    { label: { de: 'Community', en: 'Community' }, to: '/members/closer-community' },
  ],
  5: [
    { label: { de: 'Advanced Lab', en: 'Advanced Lab' }, to: '/members/advanced-lab' },
    { label: { de: 'Placement Board', en: 'Placement Board' }, to: '/members/placement', requiresCertified: true },
  ],
  6: [
    { label: { de: 'Quarterly Crossing', en: 'Quarterly Crossing' }, to: '/members/quarterly-crossing', requiresPlacement: true },
  ],
  7: [
    { label: { de: 'Inner Circle', en: 'Inner Circle' }, to: '/members/inner-circle' },
  ],
  8: [
    { label: { de: 'Inner Circle', en: 'Inner Circle' }, to: '/members/inner-circle' },
  ],
};

const LEVEL_ICONS: Record<number, React.ComponentType<any>> = {
  0: Eye, 1: GraduationCap, 2: Target, 3: Users, 4: Briefcase,
  5: Award, 6: TrendingUp, 7: Layers, 8: Crown,
};

interface NextAction {
  label: { de: string; en: string };
  description: { de: string; en: string };
  to: string;
}

function getNextAction(profile: any, overallProgress: number): NextAction {
  if (!profile) return {
    label: { de: 'Onboarding starten', en: 'Start Onboarding' },
    description: { de: 'Schließe dein Onboarding ab, um loszulegen.', en: 'Complete your onboarding to get started.' },
    to: '/members/start',
  };

  if (!profile.onboarding_completed) {
    return {
      label: { de: 'Onboarding abschließen', en: 'Complete Onboarding' },
      description: { de: 'Vervollständige die Onboarding-Schritte.', en: 'Complete the onboarding steps.' },
      to: '/members/start',
    };
  }

  const stage = profile.business_stage || 'opener';

  if (stage === 'opener') return {
    label: { de: 'Training fortsetzen', en: 'Continue Training' },
    description: { de: 'Absolviere dein Training in der Academy.', en: 'Complete your training in the Academy.' },
    to: '/members/academy',
  };
  if (stage === 'setter') return {
    label: { de: 'Qualifikation abschließen', en: 'Complete Qualification' },
    description: { de: `Fortschritt: ${overallProgress}% — absolviere alle Module und die Zertifizierung.`, en: `Progress: ${overallProgress}% — complete all modules and certification.` },
    to: '/members/academy',
  };

  return {
    label: { de: 'Nächsten Schritt fortsetzen', en: 'Continue next step' },
    description: { de: 'Dein nächster Karriereschritt wartet.', en: 'Your next career step is waiting.' },
    to: '/members/dashboard',
  };
}

export default function CareerPathScreen() {
  const { profile, isAdmin } = useAuth();
  const { overallProgress } = useAcademyData();
  const { kpis } = useKpis();
  const { lang, t } = useLanguage();

  const stage = (profile as any)?.business_stage || 'opener';
  const userLevel = isAdmin ? 8 : getUserLevel(stage);
  const isCertified = (profile as any)?.certified || isAdmin;
  const isPlacementReady = (profile as any)?.placement_ready || isAdmin;
  const nextAction = getNextAction(profile, overallProgress);

  // Progressive unlock: past levels + current + immediate next only
  const visibleLevels = useMemo(() => {
    if (isAdmin) return [0, 1, 2, 3, 4, 5, 6, 7, 8];

    // L0 Prospect: show L1–L4 (up to Closer)
    if (userLevel === 0) return [1, 2, 3, 4];

    const levels: number[] = [];
    // All past levels
    for (let i = 1; i < userLevel; i++) levels.push(i);
    // Current
    levels.push(userLevel);
    // Immediate next only
    if (userLevel < STAGE_ORDER.length - 1) levels.push(userLevel + 1);
    return levels;
  }, [userLevel, isAdmin]);

  const isProspect = userLevel === 0 && !isAdmin;
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link
        to="/members/dashboard"
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <LayoutDashboard className="h-3 w-3" />
        {t('dash_back_to_dashboard')}
      </Link>

      {/* Appointment Section for Applicants */}
      <div className="mb-8">
        <ApplicantAppointmentSection />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-10"
      >
        {isProspect ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
              {tl('Dein Weg', 'Your Path')}
            </p>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mb-3">
              {tl(
                `${profile?.full_name?.split(' ')[0] ? `${profile.full_name.split(' ')[0]}, d` : 'D'}ein Weg zum Closer`,
                `${profile?.full_name?.split(' ')[0] ? `${profile.full_name.split(' ')[0]}, y` : 'Y'}our path to Closer`
              )}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tl(
                `${PRODUCT.name} ist kein Kurs. Es ist ein strukturierter Karriereweg — mit echtem Training, Zertifizierung und Vermittlung.`,
                `${PRODUCT.name} is not a course. It is a structured career path — with real training, certification, and placement.`
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
              {t('dash_next_step')}
            </p>
            <Link
              to={nextAction.to}
              className="group block rounded-xl border border-accent/30 bg-accent/[0.04] p-5 transition-all hover:border-accent/50 hover:shadow-md"
            >
              <p className="font-serif text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                {nextAction.label[lang]}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">{nextAction.description[lang]}</p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-accent">
                {t('dash_continue_step')} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </>
        )}
      </motion.div>

      {/* ── Erste Einnahmen — Earn While Learn Block ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="mb-12"
      >
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          {tl('Erste Einnahmen', 'First Earnings')}
        </p>
        <p className="mt-4 font-serif text-lg leading-relaxed text-foreground sm:text-xl">
          {tl(
            'Du kannst bereits in den ersten Wochen mit echten Leads arbeiten und Einnahmen erzielen — parallel zu deiner Entwicklung.',
            'You can start working with real leads and earning money in your first weeks — alongside your development.'
          )}
        </p>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {tl('Du lernst nicht zuerst alles —', 'You don\'t learn everything first —')}
          <br />
          {tl('du wächst durch echte Umsetzung.', 'you grow through real execution.')}
        </p>
        <Link
          to="/members/earn-dashboard"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80"
        >
          {tl('Mehr erfahren', 'Learn more')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </motion.section>

      {/* ── Einnahmen-Visualisierung ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        className="mb-14"
      >
        {/* Block 1 — Realitäts-Statement */}
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          {tl('Wie Einkommen entsteht', 'How Income Is Built')}
        </p>
        <p className="mt-4 font-serif text-lg leading-relaxed text-foreground sm:text-xl">
          {tl('Dein Einkommen entsteht nicht durch Theorie —', 'Your income isn\'t built through theory —')}
          <br />
          {tl('sondern durch echte Gespräche und Ergebnisse.', 'but through real conversations and results.')}
        </p>

        {/* Block 2 — Konkretes Beispiel */}
        <div className="mt-8 rounded-xl border border-border bg-card/50 px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            {tl('Beispiel', 'Example')}
          </p>
          <p className="text-sm leading-relaxed text-foreground">
            {tl('Wenn du pro Woche:', 'If you per week:')}
          </p>
          <div className="mt-2 space-y-1.5 pl-1">
            <p className="text-sm text-muted-foreground">→ {tl('5 Gespräche führst', '5 conversations')}</p>
            <p className="text-sm text-muted-foreground">→ {tl('davon 1–2 erfolgreich sind', '1–2 of which are successful')}</p>
          </div>
          <p className="mt-3 text-sm text-foreground">
            {tl('kannst du erste Einnahmen erzielen.', 'you can start earning.')}
          </p>
        </div>

        {/* Block 3 — Level-Based Income */}
        <div className="mt-10">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground mb-5">
            {tl('Dein Entwicklungspfad', 'Your Development Path')}
          </p>
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card/30 px-5 py-4">
              <p className="text-sm font-semibold text-foreground">Trainee / Setter</p>
              <p className="mt-1 text-xs text-muted-foreground">{tl('Erste Gespräche · erste Einnahmen', 'First conversations · first earnings')}</p>
            </div>
            <div className="rounded-xl border border-accent/20 bg-accent/[0.03] px-5 py-4">
              <p className="text-sm font-semibold text-foreground">Junior Closer</p>
              <p className="mt-1 font-serif text-base text-foreground">3.000€ – 8.000€ <span className="text-xs font-sans text-muted-foreground">/ {tl('Monat möglich', 'month possible')}</span></p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] px-5 py-4">
              <p className="text-sm font-semibold text-foreground">Senior Closer</p>
              <p className="mt-1 font-serif text-base text-foreground">6.000€ – 12.000€+ <span className="text-xs font-sans text-muted-foreground">/ {tl('Monat möglich', 'month possible')}</span></p>
            </div>
          </div>
        </div>

        {/* Block 4 — Mechanik */}
        <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
          {tl('Du wirst an echten Ergebnissen beteiligt.', 'You participate in real results.')}
          <br />
          {tl('Je besser deine Gespräche, desto höher dein Einkommen.', 'The better your conversations, the higher your income.')}
        </p>

        {/* CTA */}
        <Link
          to="/members/academy"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80"
        >
          {tl('Starte deinen nächsten Schritt', 'Start your next step')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        {/* ── BOOK — TERTIARY (optionales Lernmaterial) ── */}
        <div className="mt-8 rounded-xl border border-border bg-card/40 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
            {tl('Optionales Lernmaterial', 'Optional Reading')}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tl(
              'Vertiefe die Grundlagen mit dem Sales System — kostenlos für alle Teilnehmer.',
              'Deepen the fundamentals with the Sales System — free for all participants.'
            )}
          </p>
          <a
            href="/books/THE_SALES_SYSTEM.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent/80"
          >
            {tl('Buch ansehen', 'View book')}
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </motion.section>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
          {t('dash_career_path')}
        </p>
        <p className="text-[12px] text-muted-foreground mb-4">
          {t('dash_career_path_intro')}
        </p>
        <div className="space-y-2.5">
          {visibleLevels.map((lvl, idx) => {
            const isCompleted = lvl < userLevel;
            const isActive = lvl === userLevel;
            const isNext = lvl === userLevel + 1;
            const stageKey = STAGE_ORDER[lvl] || 'opener';
            const Icon = LEVEL_ICONS[lvl] || Crown;
            const subItems = LEVEL_SUB_ITEMS[lvl] || [];

            return (
              <motion.div
                key={lvl}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 + 0.3 }}
                className={`relative rounded-xl border p-4 transition-all ${
                  isActive
                    ? 'border-accent/40 bg-accent/[0.05]'
                    : isCompleted
                    ? 'border-primary/20 bg-primary/[0.02]'
                    : 'border-border/30 bg-muted/20 opacity-70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isCompleted ? 'bg-primary/10 text-primary' :
                    isActive ? 'bg-accent/15 text-accent' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> :
                     isNext ? <Lock className="h-3.5 w-3.5" /> :
                     <Icon className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-[14px] font-semibold ${isNext ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {/* Applicants see "Closer (Placement Track)" instead of "Junior Closer" for L4 */}
                        {isProspect && stageKey === 'junior_manager'
                          ? (lang === 'de' ? 'Closer (Placement Track)' : 'Closer (Placement Track)')
                          : (STAGE_LABELS[stageKey]?.[lang] || stageKey)}
                      </p>
                      {isActive && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                          {t('career_step_current')}
                        </span>
                      )}
                      {isCompleted && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          {t('career_step_completed')}
                        </span>
                      )}
                    </div>

                    {isNext && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t('career_step_next_desc')}
                      </p>
                    )}

                    {(isActive || isCompleted) && subItems.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {subItems.map((sub) => {
                          let subLocked = false;
                          if (sub.requiresCertified && !isCertified) subLocked = true;
                          if (sub.requiresPlacement && !isPlacementReady) subLocked = true;

                          if (subLocked && !isAdmin) {
                            return (
                              <span
                                key={sub.label[lang]}
                                className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-muted/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground cursor-not-allowed"
                              >
                                <Lock className="h-2.5 w-2.5" />
                                {sub.label[lang]}
                              </span>
                            );
                          }

                          return (
                            <Link
                              key={sub.label[lang]}
                              to={sub.to}
                              className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1 text-[10px] font-medium text-accent transition-all hover:bg-accent/10 hover:border-accent/40 hover:shadow-sm"
                            >
                              {sub.label[lang]}
                              <ArrowRight className="h-2.5 w-2.5" />
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
