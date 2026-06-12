import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useBrandConfig } from '@/hooks/useBrandConfig';
import { useLanguage } from '@/i18n/LanguageContext';
import { roleLabel } from '@/lib/canonical-roles';
import { getLevelForStage } from '@/lib/kpi-config';
import { getDefaultRouteForStage } from '@/lib/smart-routing';
import { ChevronRight } from 'lucide-react';

/* ─────────────────────────  CONSTANTS  ───────────────────────── */

export const ENTRYFLOW_SESSION_KEY = 'entryflow_seen_this_session';
export const ENTRYFLOW_ROUTE = '/members/entryflow';

const QUOTES_DE = [
  'Heute ist ein guter Tag, einen Schritt vorwärts zu gehen.',
  'Klarheit schafft Fortschritt.',
  'Handle mit Absicht.',
  'Mach den Tag eines anderen Menschen besser.',
  'Deine Energie bestimmt dein Ergebnis.',
  'Konstanz schlägt Intensität.',
  'Vertraue dem Prozess — und dir selbst.',
  'Kleine Schritte, große Ergebnisse.',
  'Ruhe ist eine Superkraft.',
  'Zeig dich. Sei präsent. Liefere ab.',
  'Die besten Closer sind die ruhigsten.',
  'Fortschritt, nicht Perfektion.',
  'Disziplin ist Freiheit.',
  'Jeder Call ist eine Chance zu wachsen.',
  'Fokussiere die Person, nicht den Pitch.',
  'Dein nächstes Level braucht deine nächste Disziplin.',
  'Atmen. Fokus. Ausführen.',
  'Erfolg liebt Vorbereitung.',
  'Sei der Grund, warum jemand Ja sagt — zu sich selbst.',
  'Exzellenz ist eine Gewohnheit, kein Ereignis.',
];

const QUOTES_EN = [
  'Today is a good day to take a step forward.',
  'Clarity creates progress.',
  'Act with intention.',
  "Make someone else's day better.",
  'Your energy determines your outcome.',
  'Consistency beats intensity.',
  'Trust the process — and yourself.',
  'Small steps, big results.',
  'Calm is a superpower.',
  'Show up. Be present. Deliver.',
  'The best closers are the calmest.',
  'Progress, not perfection.',
  'Discipline is freedom.',
  'Every call is a chance to grow.',
  'Focus on the person, not the pitch.',
  'Your next level requires your next discipline.',
  'Breathe. Focus. Execute.',
  'Success loves preparation.',
  'Be the reason someone says yes — to themselves.',
  'Excellence is a habit, not an event.',
];

function getDailyQuote(quotes: string[]): string {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return quotes[dayOfYear % quotes.length];
}

const isDev = import.meta.env.DEV;
function devLog(msg: string) {
  if (isDev) console.log(`[Entryflow] ${msg}`);
}

/* ──────────────────  NEXT-STEP RESOLUTION (deterministic)  ────────────────── */

interface NextStep {
  title_de: string;
  title_en: string;
  href: string;
}

function resolveNextStep(level: number, isAdmin: boolean, profile: any): NextStep {
  const ns = profile?.next_step ?? profile?.recommended_action;
  if (ns && typeof ns === 'object' && ns.href) {
    return {
      title_de: ns.title_de ?? ns.title ?? 'Nächsten Schritt fortsetzen',
      title_en: ns.title_en ?? ns.title ?? 'Continue your next step',
      href: String(ns.href),
    };
  }

  if (isAdmin) {
    return {
      title_de: 'Admin-Workspace öffnen',
      title_en: 'Open admin workspace',
      href: '/members/admin-workspace',
    };
  }
  if (level <= 0) {
    return {
      title_de: 'Bewerbungsinterview vorbereiten',
      title_en: 'Prepare your interview',
      href: '/members/interview',
    };
  }
  if (level <= 2) {
    return {
      title_de: 'Nächstes Academy-Modul abschließen',
      title_en: 'Complete your next academy module',
      href: '/members/academy',
    };
  }
  if (level <= 5) {
    return {
      title_de: 'Heutige Calls vorbereiten',
      title_en: 'Prepare today\'s calls',
      href: '/members/start',
    };
  }
  return {
    title_de: 'Operator-Cockpit öffnen',
    title_en: 'Open operator cockpit',
    href: '/members/dashboard/performance/operator-control',
  };
}

/* ─────────────────────────  COMPONENT  ───────────────────────── */

export default function EntryScreen() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, isLoading } = useAuth();
  const { lang } = useLanguage();
  const { branding } = useBrandConfig();

  /** Screen phase: 'quote' (Screen 1) → 'overview' (Screen 2) */
  const [phase, setPhase] = useState<'quote' | 'overview'>('quote');
  const [showQuoteButton, setShowQuoteButton] = useState(false);
  const [showOverviewButtons, setShowOverviewButtons] = useState(false);
  const [ready, setReady] = useState(false);

  const stage = (profile as any)?.business_stage ?? 'opener';
  const level = useMemo(() => {
    if (isAdmin) return 7;
    return getLevelForStage(stage);
  }, [stage, isAdmin]);

  const quote = useMemo(
    () => getDailyQuote(lang === 'de' ? QUOTES_DE : QUOTES_EN),
    [lang],
  );

  const targetDashboard = useMemo(
    () => getDefaultRouteForStage(stage, isAdmin),
    [stage, isAdmin],
  );

  const nextStep = useMemo(
    () => resolveNextStep(level, isAdmin, profile),
    [level, isAdmin, profile],
  );

  // Admin bypass
  const adminBypass =
    isAdmin &&
    (typeof window !== 'undefined' &&
      (window as any).__ADMIN_BYPASS_ENTRYFLOW__ === true ||
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('admin_bypass_entryflow') === 'true'));

  // Per-login session gate
  useEffect(() => {
    if (isLoading) return;
    if (!user) return;

    devLog('login detected');

    if (adminBypass) {
      devLog('admin bypass active → dashboard');
      navigate(targetDashboard, { replace: true });
      return;
    }

    let seen: string | null = null;
    try { seen = sessionStorage.getItem(ENTRYFLOW_SESSION_KEY); } catch { /* ignore */ }

    if (seen === user.id) {
      devLog('already seen this session');
      navigate(targetDashboard, { replace: true });
      return;
    }

    devLog('showing entry flow');
    try { sessionStorage.setItem(ENTRYFLOW_SESSION_KEY, user.id); } catch { /* ignore */ }
    setReady(true);
  }, [isLoading, user, adminBypass, navigate, targetDashboard]);

  // Delayed button for quote screen (600ms)
  useEffect(() => {
    if (!ready || phase !== 'quote') return;
    const t = setTimeout(() => setShowQuoteButton(true), 600);
    return () => clearTimeout(t);
  }, [ready, phase]);

  // Instant buttons for overview screen
  useEffect(() => {
    if (phase === 'overview') {
      setShowOverviewButtons(true);
    }
  }, [phase]);

  if (isLoading || !ready) return null;

  const t = (de: string, en: string) => (lang === 'de' ? de : en);

  const handleStartFromQuote = () => {
    devLog('quote → overview');
    setPhase('overview');
  };

  const handleContinue = () => {
    devLog('continuing to next step');
    navigate(nextStep.href, { replace: true });
  };

  const handleDashboard = () => {
    devLog('continuing to dashboard');
    navigate('/members/dashboard', { replace: true });
  };

  const pathLevels = buildPathLevels(level);

  /* ─── SCREEN 1: Daily Quote ─── */
  if (phase === 'quote') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background overflow-y-auto">
        {/* dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 0.5px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.0, ease: 'easeOut' }}
          className="relative z-10 flex w-full max-w-xl flex-col items-center px-6 py-12 text-center"
        >
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-16"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/60">
              {branding.product_name}
            </span>
          </motion.div>

          {/* Quote */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, delay: 0.3 }}
            className="font-serif text-xl sm:text-2xl italic font-medium leading-relaxed text-foreground/90 max-w-lg"
          >
            „{quote}"
          </motion.p>

          {/* Label removed — only the quote text is shown */}

          {/* Start button — delayed */}
          <AnimatePresence>
            {showQuoteButton && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="mt-14"
              >
                <button
                  onClick={handleStartFromQuote}
                  className="rounded-full border border-foreground/20 bg-foreground px-10 py-3 text-[13px] font-medium tracking-wide text-background transition-all hover:bg-foreground/90 active:scale-[0.97]"
                >
                  {t('Starten', 'Start')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  /* ─── SCREEN 2: Entry Overview (career level + next step) ─── */
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background overflow-y-auto">
      {/* dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 0.5px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 flex w-full max-w-2xl flex-col items-center px-6 py-12 text-center"
      >
        {/* Greeting + Level */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mb-8"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            {t('Willkommen zurück', 'Welcome back')}
            {profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </p>
          <p className="mt-3 font-serif text-2xl font-light text-foreground">
            {roleLabel(level, 'external', lang)}
            <span className="ml-2 text-muted-foreground/60">· L{Math.max(0, level)}</span>
          </p>
        </motion.div>

        {/* Career path mini-flow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-4 flex w-full items-center justify-center gap-2 sm:gap-3 text-[11px] sm:text-xs"
        >
          {pathLevels.map((lvl, i) => {
            const isCurrent = lvl === level;
            return (
              <div key={`${lvl}-${i}`} className="flex items-center gap-2 sm:gap-3">
                <div
                  className={`rounded-full border px-3 py-1.5 sm:px-4 sm:py-2 transition-colors ${
                    isCurrent
                      ? 'border-foreground/30 bg-foreground/5 text-foreground'
                      : 'border-border/40 text-muted-foreground/70'
                  }`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider">
                    L{Math.max(0, lvl)}
                  </span>
                  <span className="ml-1.5">{roleLabel(lvl, 'external', lang)}</span>
                </div>
                {i < pathLevels.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                )}
              </div>
            );
          })}
        </motion.div>

        {/* Next recommended action */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-10 w-full max-w-md rounded-md border border-border/40 bg-card/40 px-5 py-4 text-left"
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            {t('Nächster Schritt', 'Next step')}
          </p>
          <p className="mt-1.5 text-sm text-foreground/90">
            {nextStep.title_de && lang === 'de' ? nextStep.title_de : nextStep.title_en}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t(
              'Schließe deinen nächsten Schritt ab, um deinen Karriereweg fortzusetzen.',
              'Complete your next step to continue your career path.',
            )}
          </p>
        </motion.div>

        {/* CTAs */}
        <AnimatePresence>
          {showOverviewButtons && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
            >
              <button
                onClick={handleContinue}
                className="rounded-full border border-foreground/20 bg-foreground px-8 py-3 text-[13px] font-medium tracking-wide text-background transition-all hover:bg-foreground/90 active:scale-[0.97]"
              >
                {t('Nächsten Schritt starten', 'Start next step')}
              </button>
              <button
                onClick={handleDashboard}
                className="rounded-full border border-border/50 bg-card/60 px-8 py-3 text-[13px] font-medium tracking-wide text-foreground transition-all hover:bg-card hover:border-accent/30 active:scale-[0.97]"
              >
                {t('Weiter zum Dashboard', 'Continue to dashboard')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** Build a 3-step path: previous (if any) → current → next (if any). */
function buildPathLevels(level: number): number[] {
  const lo = Math.max(0, level - 1);
  const hi = Math.min(8, level + 1);
  const out: number[] = [];
  for (let i = lo; i <= hi; i += 1) out.push(i);
  return out;
}
