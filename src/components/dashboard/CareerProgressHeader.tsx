import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getUserLevel, STAGE_LABELS, STAGE_ORDER } from '@/components/members/CareerPath';
import {
  getLevelForStage,
  KPI_THRESHOLDS,
  getKpiStatus,
} from '@/lib/kpi-config';
import { Badge } from '@/components/ui/badge';

interface NextActionConfig {
  label: { de: string; en: string };
  cta: { de: string; en: string };
  to: string;
}

/**
 * Single source of truth for the "Next Step" copy per level.
 * Mirrors the L0–L6 progression engine ("progress_state" logic) by
 * pointing each level to the dominant unlock activity.
 */
const NEXT_ACTION_BY_LEVEL: Record<number, NextActionConfig> = {
  0: {
    label: {
      de: 'Schließe deine Bewerbung ab, um den Trainee-Status freizuschalten.',
      en: 'Complete your application to unlock Trainee status.',
    },
    cta: { de: 'Bewerbung öffnen', en: 'Open application' },
    to: '/members/applicant-interview',
  },
  1: {
    label: {
      de: 'Schließe dein erstes Trainingsmodul ab, um den Trainee-Status freizuschalten.',
      en: 'Complete your first training module to unlock Trainee status.',
    },
    cta: { de: 'Zur Academy', en: 'Go to Academy' },
    to: '/members/academy',
  },
  2: {
    label: {
      de: 'Erfülle deine Setter-KPIs und starte die Zertifizierung, um Senior Setter zu werden.',
      en: 'Hit your Setter KPIs and start certification to become a Senior Setter.',
    },
    cta: { de: 'Zertifizierung starten', en: 'Start certification' },
    to: '/members/certification',
  },
  3: {
    label: {
      de: 'Erreiche Placement-Bereitschaft, um in den Closer-Track zu wechseln.',
      en: 'Reach placement readiness to move into the Closer track.',
    },
    cta: { de: 'Placement-Status', en: 'Placement status' },
    to: '/members/placement',
  },
  4: {
    label: {
      de: 'Schließe deine Closer-Zertifizierung ab, um Managing Closer zu werden.',
      en: 'Complete your Closer certification to become a Managing Closer.',
    },
    cta: { de: 'Zur Zertifizierung', en: 'Open certification' },
    to: '/members/certification',
  },
  5: {
    label: {
      de: 'Mentoriere aktiv und liefere Live-Deals, um Senior Closer zu werden.',
      en: 'Actively mentor and deliver live deals to reach Senior Closer.',
    },
    cta: { de: 'Closer Workspace', en: 'Closer workspace' },
    to: '/members/closer',
  },
  6: {
    label: {
      de: 'Halte deine Performance & nutze das Advanced Lab für den nächsten Sprung.',
      en: 'Sustain performance and use the Advanced Lab for the next jump.',
    },
    cta: { de: 'Advanced Lab', en: 'Advanced Lab' },
    to: '/members/advanced-lab',
  },
};

interface Props {
  stage: string;
  overallProgress: number;
  kpiValues: Record<string, number>;
  fullName?: string;
}

export default function CareerProgressHeader({
  stage,
  overallProgress,
  kpiValues,
  fullName,
}: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const level = getUserLevel(stage);
  const kpiLevel = getLevelForStage(stage);
  const stageLabel = STAGE_LABELS[stage]?.[lang] ?? stage;

  const nextStageKey = STAGE_ORDER[level + 1];
  const nextStageLabel = nextStageKey
    ? STAGE_LABELS[nextStageKey]?.[lang] ?? nextStageKey
    : null;

  // KPI completion: share of KPIs that are "green" for the current level.
  const kpiCompletion = useMemo(() => {
    const thresholds = KPI_THRESHOLDS[kpiLevel] ?? {};
    const keys = Object.keys(thresholds);
    if (keys.length === 0) return 100;
    const green = keys.filter(
      (k) => getKpiStatus(k as any, kpiValues[k] ?? 0, kpiLevel) === 'green',
    ).length;
    return Math.round((green / keys.length) * 100);
  }, [kpiLevel, kpiValues]);

  // Combined progress toward the next level (same weighting as PromotionReadiness).
  const combinedProgress = Math.min(
    100,
    Math.max(0, Math.round(overallProgress * 0.3 + kpiCompletion * 0.7)),
  );

  const nextAction =
    NEXT_ACTION_BY_LEVEL[level] ?? NEXT_ACTION_BY_LEVEL[1];

  const firstName = fullName?.split(' ')[0];

  return (
    <section
      aria-label={tl('Karriere-Fortschritt', 'Career progress')}
      className="mb-8 rounded-2xl border border-border/60 bg-card overflow-hidden"
    >
      {/* Header row: level + greeting */}
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {tl('Karriere-Fortschritt', 'Career Progress')}
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {firstName
              ? tl(`Hi ${firstName}, du bist auf `, `Hi ${firstName}, you're on `)
              : tl('Du bist aktuell auf ', "You're currently on ")}
            <span className="text-primary">
              L{level} · {stageLabel}
            </span>
          </h2>
          {nextStageLabel && (
            <p className="mt-1 text-sm text-muted-foreground">
              {tl('Nächste Stufe:', 'Next level:')}{' '}
              <span className="font-medium text-foreground">
                L{level + 1} · {nextStageLabel}
              </span>
            </p>
          )}
        </div>

        <Badge
          variant="outline"
          className="shrink-0 self-start border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold tracking-wide text-primary sm:self-center"
        >
          L{level} · {stageLabel}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="px-6 pb-5 sm:px-7">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {nextStageLabel
              ? tl(
                  `Fortschritt zu L${level + 1}`,
                  `Progress to L${level + 1}`,
                )
              : tl('Maximales Level erreicht', 'Max level reached')}
          </span>
          <span className="font-sans text-sm font-semibold tabular-nums text-foreground">
            {combinedProgress}%
          </span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={combinedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={tl(
            `Fortschritt zur nächsten Stufe: ${combinedProgress} Prozent`,
            `Progress to next level: ${combinedProgress} percent`,
          )}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
            style={{ width: `${combinedProgress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>
            {tl('Lernen', 'Learning')} {overallProgress}%
          </span>
          <span>
            {tl('KPIs', 'KPIs')} {kpiCompletion}%
          </span>
        </div>
      </div>

      {/* Next Action card */}
      <div className="border-t border-border/60 bg-surface-sunken/40 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {tl('Nächster Schritt', 'Next Action')}
              </p>
              <p className="mt-1 text-[15px] leading-snug text-foreground">
                {nextAction.label[lang]}
              </p>
            </div>
          </div>
          <Link
            to={nextAction.to}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {nextAction.cta[lang]}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
