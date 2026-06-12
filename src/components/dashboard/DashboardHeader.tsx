import { Shield } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { getUserLevel, STAGE_LABELS } from '@/components/members/CareerPath';

interface Props {
  profile: any;
  stage: string;
  isAdmin: boolean;
  onOpenPerspective: () => void;
}

export default function DashboardHeader({ profile, stage, isAdmin, onOpenPerspective }: Props) {
  const { lang } = useLanguage();
  const userLevel = getUserLevel(stage);
  const stageLabel = STAGE_LABELS[stage]?.[lang] || stage;
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  return (
    <div className="mb-10 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {tl('Performance Dashboard', 'Performance Dashboard')}
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {tl(
            `Willkommen, ${profile?.full_name?.split(' ')[0] || 'Member'}`,
            `Welcome, ${profile?.full_name?.split(' ')[0] || 'Member'}`
          )}
        </h1>
      </div>
      <div className="flex items-center gap-2 mt-2 sm:mt-0">
        {isAdmin && (
          <button
            onClick={onOpenPerspective}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/5 px-3 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors"
          >
            <Shield className="h-3 w-3" />
            Alle Dashboards anzeigen
          </button>
        )}
        <span className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">
          {stageLabel}
        </span>
      </div>
    </div>
  );
}
