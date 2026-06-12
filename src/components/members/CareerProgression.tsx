import { CheckCircle2, Lock, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { STAGE_ORDER, STAGE_LABELS, getUserLevel } from '@/components/members/CareerPath';

interface PhaseItem {
  label: { de: string; en: string };
  alwaysVisible?: boolean;
}

const LEVEL_PHASES: Record<number, PhaseItem[]> = {
  0: [
    { label: { de: 'Bewerbung eingereicht', en: 'Application submitted' } },
    { label: { de: 'Erstgespräch', en: 'Initial Call' } },
    { label: { de: 'Zweitgespräch', en: 'Second Call' } },
    { label: { de: 'Entscheidung', en: 'Decision' } },
  ],
  1: [
    { label: { de: 'Onboarding', en: 'Onboarding' } },
    { label: { de: 'Foundations', en: 'Foundations' } },
    { label: { de: 'Gesprächsführung', en: 'Conversation Skills' } },
    { label: { de: 'Einwandbehandlung (Basis)', en: 'Objection Handling (Basic)' } },
    { label: { de: 'Praxis', en: 'Practice' }, alwaysVisible: true },
    { label: { de: 'Zertifizierung', en: 'Certification' } },
  ],
  2: [
    { label: { de: 'Setter Foundations', en: 'Setter Foundations' } },
    { label: { de: 'Einwandbehandlung (Setter)', en: 'Objection Handling (Setter)' } },
    { label: { de: 'Setter Simulator', en: 'Setter Simulator' } },
    { label: { de: 'Call Framework', en: 'Call Framework' } },
    { label: { de: 'Praxis', en: 'Practice' }, alwaysVisible: true },
    { label: { de: 'Zertifizierung', en: 'Certification' } },
  ],
  3: [
    { label: { de: 'Setter Vertiefung', en: 'Setter Advanced' } },
    { label: { de: 'Closer Simulator', en: 'Closer Simulator' } },
    { label: { de: 'Praxis', en: 'Practice' }, alwaysVisible: true },
    { label: { de: 'Zertifizierung', en: 'Certification' } },
  ],
  4: [
    { label: { de: 'Closer Framework', en: 'Closer Framework' } },
    { label: { de: 'Closing Questions', en: 'Closing Questions' } },
    { label: { de: 'Einwandbehandlung (Advanced)', en: 'Objection Handling (Advanced)' } },
    { label: { de: 'Placement-Vorbereitung', en: 'Placement Preparation' } },
    { label: { de: 'Praxis', en: 'Practice' }, alwaysVisible: true },
  ],
  5: [
    { label: { de: 'Placement Ready', en: 'Placement Ready' } },
    { label: { de: 'Praxis', en: 'Practice' }, alwaysVisible: true },
  ],
  6: [
    { label: { de: 'Placed', en: 'Placed' } },
    { label: { de: 'Advanced Lab', en: 'Advanced Lab' } },
    { label: { de: 'Praxis', en: 'Practice' }, alwaysVisible: true },
  ],
  7: [
    { label: { de: 'KPI Dashboard', en: 'KPI Dashboard' } },
    { label: { de: 'Mentor Space', en: 'Mentor Space' } },
    { label: { de: 'Vollzugriff', en: 'Full Access' } },
  ],
  8: [
    { label: { de: 'Inner Circle', en: 'Inner Circle' } },
    { label: { de: 'Vollzugriff', en: 'Full Access' } },
  ],
};

type ItemStatus = 'completed' | 'active' | 'available' | 'locked';

export default function CareerProgression() {
  const { profile } = useAuth();
  const { lang, t } = useLanguage();
  const stage = (profile as any)?.business_stage || 'opener';
  const userLevel = getUserLevel(stage);

  const getItemStatus = (level: number, item: PhaseItem): ItemStatus => {
    if (level < userLevel) return 'completed';
    if (level > userLevel) return 'locked';
    if (item.alwaysVisible) return 'available';
    return 'active';
  };

  const statusIcon = (s: ItemStatus) => {
    switch (s) {
      case 'completed': return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
      case 'active': return <Circle className="h-3.5 w-3.5 text-accent fill-accent/20" />;
      case 'locked': return <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />;
      default: return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
  };

  // Show ALL past levels + current + next
  const visibleLevels = Object.entries(LEVEL_PHASES).filter(([lvlStr]) => {
    const lvl = Number(lvlStr);
    return lvl <= userLevel + 1;
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('dash_career_path')}
        </h2>
        <span className="text-[10px] font-medium text-muted-foreground">
          {STAGE_LABELS[stage]?.[lang] || stage}
        </span>
      </div>

      <div className="space-y-1.5">
        {visibleLevels.map(([lvlStr, items]) => {
          const lvl = Number(lvlStr);
          const isCurrent = lvl === userLevel;
          const isCompleted = lvl < userLevel;
          const isLocked = lvl > userLevel;

          return (
            <div
              key={lvl}
              className={cn(
                'rounded-xl border p-3 transition-colors',
                isCurrent && 'border-accent/30 bg-accent/[0.04]',
                isCompleted && 'border-border/30 bg-card',
                isLocked && 'border-border/20 bg-muted/30 opacity-70',
              )}
            >
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-2">
                <div className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  isCompleted && 'bg-primary/10 text-primary',
                  isCurrent && 'bg-accent/15 text-accent',
                  isLocked && 'bg-muted text-muted-foreground',
                )}>
                  {isCompleted ? <CheckCircle2 className="h-3 w-3" /> : lvl}
                </div>
                <span className={cn(
                  'text-[12px] font-semibold',
                  isLocked ? 'text-muted-foreground' : 'text-foreground',
                )}>
                  {STAGE_LABELS[STAGE_ORDER[lvl]]?.[lang] || `Step ${lvl}`}
                </span>
                {isCurrent && (
                  <span className="ml-auto shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                    {t('career_step_current')}
                  </span>
                )}
              </div>

              {/* Phase items */}
              {isLocked ? (
                <p className="pl-8 text-[11px] text-muted-foreground">
                  {t('career_step_next_desc')}
                </p>
              ) : (
                <div className="space-y-1 pl-8">
                  {items.map((item, i) => {
                    const status = getItemStatus(lvl, item);
                    return (
                      <div key={i} className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]',
                        status === 'active' && 'text-accent font-semibold bg-accent/[0.06]',
                        status === 'completed' && 'text-muted-foreground',
                        status === 'locked' && 'text-muted-foreground/40',
                        status === 'available' && 'text-foreground',
                      )}>
                        {statusIcon(status)}
                        <span>{item.label[lang]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
