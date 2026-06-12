import { useState } from 'react';
import { PRODUCT } from '@/config/product';
import { Link } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, PlayCircle, CheckCircle2,
  Lock, BookOpen, Eye, EyeOff, Info,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useAcademyData } from '@/hooks/useAcademyData';
import { useLanguage } from '@/i18n/LanguageContext';
import AcademyPhase9Upsell from '@/components/members/AcademyPhase9Upsell';
import ScalingCareerPaths from '@/components/members/ScalingCareerPaths';
import { normalizeBusinessStage } from '@/lib/stage-utils';

/** KPI hints per phase */
const PHASE_KPI_HINTS: Record<number, { de: string; en: string }> = {
  1: { de: 'Grundlage für alle KPIs — Onboarding-Abschluss beeinflusst deine Startgeschwindigkeit.', en: 'Foundation for all KPIs — onboarding completion impacts your starting speed.' },
  2: { de: 'Beeinflusst: Close Rate, Qualification Accuracy, Ethical Alignment Score.', en: 'Impacts: Close Rate, Qualification Accuracy, Ethical Alignment Score.' },
  3: { de: 'Beeinflusst: Show-Up Rate, Booking Conversion, Response Time.', en: 'Impacts: Show-Up Rate, Booking Conversion, Response Time.' },
  4: { de: 'Beeinflusst: Objection Resolution Rate, Decision Conversion Rate.', en: 'Impacts: Objection Resolution Rate, Decision Conversion Rate.' },
  5: { de: 'Beeinflusst: Earnings per Call, Close Rate, Follow-Up Rate.', en: 'Impacts: Earnings per Call, Close Rate, Follow-Up Rate.' },
  6: { de: 'Beeinflusst: Certification Readiness, Overall Score.', en: 'Impacts: Certification Readiness, Overall Score.' },
  7: { de: 'Beeinflusst: Placement Readiness, CRM Hygiene Score.', en: 'Impacts: Placement Readiness, CRM Hygiene Score.' },
  8: { de: 'Beeinflusst: Revenue Closed, Pipeline Value.', en: 'Impacts: Revenue Closed, Pipeline Value.' },
  9: { de: 'Integration aller Skills — zeigt dir dein Gesamtbild und nächste Schritte.', en: 'Integration of all skills — shows your full picture and next steps.' },
};

export default function Academy() {
  const { profile, isAdmin } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;
  const {
    phases, loading, isModuleCompleted, getModulesForPhase,
    totalModules, completedModules, overallProgress,
  } = useAcademyData();

  const currentPhase = profile?.current_phase ?? 1;
  const [expandedPhases, setExpandedPhases] = useState<number[]>([currentPhase]);
  const [adminViewAsUser, setAdminViewAsUser] = useState(false);

  const adminFullAccess = isAdmin && !adminViewAsUser;

  const stage = normalizeBusinessStage(profile?.business_stage || 'opener');
  const levelNum = getLevelFromStage(stage);
  const showScalingSection = adminFullAccess || levelNum >= 5;

  const maxPhaseForLevel = adminFullAccess ? 9 : (levelNum <= 1 ? 3 : levelNum <= 2 ? 6 : 9);

  const onboardingDone = (profile as any)?.onboarding_completed === true;

  const togglePhase = (id: number) => {
    setExpandedPhases(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!adminFullAccess && !onboardingDone) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground mb-4">Academy</h1>
        <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
          <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-2">{t('Akademie gesperrt', 'Academy Locked')}</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {t('Bevor du mit der Akademie starten kannst, schließe bitte zuerst die Mission-Section und dein Onboarding vollständig ab.', 'Before you can start the Academy, please complete the Mission section and your onboarding first.')}
          </p>
          <Link to="/members/start" className="inline-block mt-4 text-xs font-medium text-primary hover:underline">
            → {t('Zum Onboarding', 'Go to Onboarding')}
          </Link>
        </div>
      </div>
    );
  }

  const displayProgress = adminFullAccess ? 100 : overallProgress;
  const displayCompleted = adminFullAccess ? totalModules : completedModules;

  const phase9 = phases.find(p => p.sort_order === 9);
  const phase9Modules = phase9 ? getModulesForPhase(phase9.id) : [];
  const phase9AllDone = phase9Modules.length > 0 && phase9Modules.every(m => isModuleCompleted(m.id));
  const showPhase9Upsell = adminFullAccess || (phase9 && (phase9AllDone || currentPhase >= 9));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Academy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`Deine strukturierte Ausbildung zum ${PRODUCT.name}.`, `Your structured training to become an ${PRODUCT.name}.`)}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setAdminViewAsUser(prev => !prev)}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {adminViewAsUser ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {adminViewAsUser ? t('User-Ansicht', 'User View') : t('Admin-Ansicht', 'Admin View')}
          </button>
        )}
      </div>

      {/* Overall Progress */}
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-border/40 bg-card p-4">
        <BookOpen className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{displayCompleted} {t('von', 'of')} {totalModules} {t('Modulen', 'Modules')}</span>
            <span className="font-semibold text-accent">{displayProgress}%</span>
          </div>
          <Progress value={displayProgress} className="h-1.5 bg-muted" />
        </div>
      </div>

      {/* Phase Accordion */}
      <div className="space-y-3">
        {phases.map(phase => {
          const expanded = expandedPhases.includes(phase.id);
          const phaseModules = getModulesForPhase(phase.id);
          const phaseCompleted = adminFullAccess
            ? phaseModules.length
            : phaseModules.filter(m => isModuleCompleted(m.id)).length;
          const phaseProgress = phaseModules.length > 0
            ? Math.round((phaseCompleted / phaseModules.length) * 100)
            : 0;
          const levelCapped = phase.sort_order > maxPhaseForLevel;
          const unlocked = adminFullAccess || (phase.sort_order <= currentPhase && !levelCapped);
          const kpiHint = PHASE_KPI_HINTS[phase.sort_order];

          return (
            <div key={phase.id} className="rounded-xl border border-border/40 bg-card overflow-hidden">
              <button
                onClick={() => unlocked && togglePhase(phase.id)}
                className={cn(
                  'flex w-full items-center gap-3 p-4 text-left transition-colors',
                  unlocked ? 'hover:bg-muted/30 cursor-pointer' : 'opacity-60 cursor-not-allowed'
                )}
              >
                {unlocked ? (
                  expanded
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-foreground">
                      {t('Phase', 'Phase')} {phase.sort_order}: {phase.name}
                    </span>
                    {phaseProgress === 100 && phaseModules.length > 0 && (
                      <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
                        {t('Abgeschlossen', 'Completed')}
                      </Badge>
                    )}
                    {kpiHint && unlocked && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[250px] text-[11px]">
                          {t(kpiHint.de, kpiHint.en)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {unlocked && (
                    <div className="mt-1.5 flex items-center gap-3">
                      <Progress value={phaseProgress} className="h-1 flex-1 bg-muted" />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {phaseCompleted}/{phaseModules.length}
                      </span>
                    </div>
                  )}
                  {!unlocked && levelCapped && (
                    <p className="mt-1 text-[11px] text-muted-foreground/50">
                      {levelNum <= 1
                        ? t('Wird auf dem nächsten Level freigeschaltet.', 'Unlocked at the next level.')
                        : t('Diese Phase wird ab Level 3 freigeschaltet.', 'This phase unlocks from Level 3.')}
                    </p>
                  )}
                  {!unlocked && !levelCapped && (
                    <p className="mt-1 text-[11px] text-muted-foreground/50">
                      {t(`Wird freigeschaltet, sobald du Phase ${phase.sort_order - 1} abschließt.`, `Unlocks once you complete Phase ${phase.sort_order - 1}.`)}
                    </p>
                  )}
                </div>
              </button>

              {expanded && unlocked && (
                <div className="border-t border-border/30 px-2 py-1.5">
                  {phaseModules.length === 0 ? (
                    <div className="px-3 py-6 text-center">
                      <p className="text-[12px] text-muted-foreground">
                        {t('Module werden bald verfügbar sein. Arbeite weiter an deinen aktuellen Phasen.', 'Modules will be available soon. Keep working on your current phases.')}
                      </p>
                    </div>
                  ) : (
                    phaseModules.map((mod, i) => {
                      const done = adminFullAccess || isModuleCompleted(mod.id);
                      return (
                        <Link
                          key={mod.id}
                          to={`/members/academy/${mod.id}`}
                          className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/40"
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                          )}
                          <p className={cn(
                            'text-[13px] font-medium flex-1',
                            done ? 'text-muted-foreground' : 'text-foreground'
                          )}>
                            {i + 1}. {mod.title}
                          </p>
                        </Link>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showPhase9Upsell && <AcademyPhase9Upsell />}
      {showScalingSection && <ScalingCareerPaths />}
    </div>
  );
}

function getLevelFromStage(stage: string): number {
  const map: Record<string, number> = {
    prospect: 0,
    opener: 1,
    setter: 2,
    associate_setter: 2,
    senior_associate: 3,
    senior_setter: 3,
    junior_manager: 4,
    manager: 5,
    senior_manager: 6,
    director: 7,
    partner: 8,
  };
  return map[stage] ?? 1;
}
