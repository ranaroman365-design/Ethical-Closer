import { useLanguage } from '@/i18n/LanguageContext';
import { Trophy } from 'lucide-react';

interface Props {
  className?: string;
}

/**
 * Shown when a leaderboard / ranking has no real data yet.
 * Never fill with fake users — show honest empty state instead.
 */
export default function RankingEmptyState({ className }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 text-center ${className ?? ''}`}>
      <Trophy className="h-8 w-8 text-muted-foreground/50" />
      <div className="space-y-1 max-w-xs">
        <p className="text-sm font-medium text-foreground">
          {tl(
            'Die ersten echten Rankings erscheinen, sobald genügend Aktivität vorhanden ist.',
            'Real rankings will appear once there is enough activity.'
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {tl(
            'Sei einer der ersten sichtbaren Performer.',
            'Be one of the first visible performers.'
          )}
        </p>
      </div>
    </div>
  );
}
