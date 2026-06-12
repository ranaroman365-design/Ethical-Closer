import { Clock, Zap, ArrowRight } from 'lucide-react';
import { useTimebox } from '@/hooks/useTimebox';
import { useLanguage } from '@/i18n/LanguageContext';

export default function BoosterOfferCard() {
  const { timebox } = useTimebox();
  const { lang } = useLanguage();

  if (!timebox) return null;

  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  // Show time progress bar for active users (not behind schedule)
  if (!timebox.behind_schedule) {
    // Only show if > 50% through timebox
    if (timebox.progress_pct < 50) return null;

    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {tl('Zeitfenster', 'Time Window')}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{tl(`Woche ${timebox.weeks_elapsed}`, `Week ${timebox.weeks_elapsed}`)}</span>
          <span>{tl(`${timebox.weeks_remaining} Wochen verbleibend`, `${timebox.weeks_remaining} weeks remaining`)}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              timebox.progress_pct >= 85 ? 'bg-destructive' :
              timebox.progress_pct >= 70 ? 'bg-[hsl(39,76%,49%)]' :
              'bg-primary'
            }`}
            style={{ width: `${timebox.progress_pct}%` }}
          />
        </div>
        {timebox.progress_pct >= 85 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {tl(
              'Dein Zeitfenster läuft bald ab. Fokussiere dich auf die verbleibenden Anforderungen.',
              'Your time window is closing soon. Focus on remaining requirements.'
            )}
          </p>
        )}
      </div>
    );
  }

  // Behind schedule: show booster offer
  return (
    <div className="rounded-xl border border-[hsl(39,76%,49%)]/30 bg-[hsl(39,76%,49%)]/[0.04] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(39,76%,49%)]/10">
          <Zap className="h-4 w-4 text-[hsl(39,76%,49%)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(39,76%,49%)] mb-1">
            {tl('Booster verfügbar', 'Booster Available')}
          </p>
          <p className="text-sm font-medium text-foreground leading-snug">
            {tl(
              'Dein reguläres Zeitfenster ist überschritten. Der Booster gibt dir zusätzliche Unterstützung.',
              'Your regular time window has passed. The Booster provides additional support.'
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tl(
              `Woche ${timebox.weeks_elapsed} von ${timebox.timebox_weeks} — Verlängerung aktiv`,
              `Week ${timebox.weeks_elapsed} of ${timebox.timebox_weeks} — Extension active`
            )}
          </p>
          <button
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[hsl(39,76%,49%)] px-3 py-1.5 text-[11px] font-medium text-white transition-all hover:bg-[hsl(39,76%,55%)]"
          >
            {tl('Booster-Optionen ansehen', 'View booster options')}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
