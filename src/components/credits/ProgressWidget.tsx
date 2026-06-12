import { Link } from 'react-router-dom';
import { useCreditEngine, computeNextActions } from '@/hooks/useCreditEngine';
import { useLanguage } from '@/i18n/LanguageContext';
import { Sparkles, ChevronRight, Lock } from 'lucide-react';

interface Props {
  variant?: 'full' | 'compact';
  className?: string;
}

const LEVEL_NAMES = ['Community Member', 'Trainee', 'Operator', 'Performer', 'Closer', 'Pro', 'Elite'];

export default function ProgressWidget({ variant = 'full', className }: Props) {
  const { profile, nextRequirement, loading } = useCreditEngine();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === 'de' ? de : en);

  if (loading || !profile) {
    return (
      <div className={`rounded-2xl border border-border/40 bg-card p-4 ${className ?? ''}`}>
        <div className="h-16 animate-pulse rounded bg-muted/30" />
      </div>
    );
  }

  const lvl = profile.credit_level;
  const nextLvl = nextRequirement?.level;
  const nextActions = computeNextActions(profile, lang as 'de' | 'en');

  const creditsTarget = nextRequirement?.credits ?? profile.credits_balance;
  const creditPct = nextRequirement
    ? Math.min(100, Math.round((profile.credits_balance / creditsTarget) * 100))
    : 100;

  // Compact variant — for community feed top
  if (variant === 'compact') {
    return (
      <div className={`rounded-xl border border-border/40 bg-card px-3 py-2.5 ${className ?? ''}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[12px] font-semibold text-foreground">{profile.credits_balance}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-400">L{lvl}</span>
            {nextRequirement && (
              <div className="hidden sm:flex items-center gap-1.5">
                <div className="h-1 w-20 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${creditPct}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">→ L{nextLvl}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`rounded-2xl border border-border/40 bg-card p-5 ${className ?? ''}`}>
      {/* Section 1: Credit Display */}
      <div className="flex items-baseline gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span className="font-serif text-2xl font-semibold text-foreground tabular-nums">{profile.credits_balance}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Credits</span>
        <span className="ml-auto rounded-full bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          L{lvl} · {LEVEL_NAMES[lvl] ?? '—'}
        </span>
      </div>

      {/* Section 2: Progress Bar */}
      {nextRequirement && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[11px] text-muted-foreground">
              {profile.credits_balance} / {creditsTarget} → L{nextLvl} {LEVEL_NAMES[nextLvl ?? 0] ?? ''}
            </span>
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{creditPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500" style={{ width: `${creditPct}%` }} />
          </div>
        </div>
      )}

      {/* Section 3: Next Actions */}
      {nextActions.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('Nächste Schritte', 'Next Steps')}
          </p>
          <div className="space-y-1.5">
            {nextActions.map(a => {
              const inner = (
                <>
                  <span className="text-[12px] text-foreground">{a.label}</span>
                  {a.href && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </>
              );
              return a.href ? (
                <Link key={a.key} to={a.href} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-2 transition-colors hover:border-amber-500/40 hover:bg-amber-500/5">
                  {inner}
                </Link>
              ) : (
                <div key={a.key} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-2">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 4: Level Status */}
      {nextRequirement && (
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
          <p className="col-span-2 mb-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('Anforderungen für L', 'Requirements for L')}{nextLvl}
          </p>
          <Requirement label={t('Credits', 'Credits')} cur={profile.credits_balance} tgt={nextRequirement.credits} />
          <Requirement label="Posts" cur={profile.posts_count} tgt={nextRequirement.posts} />
          <Requirement label={t('Kommentare', 'Comments')} cur={profile.comments_count} tgt={nextRequirement.comments} />
          <Requirement label="Calls" cur={profile.calls_count} tgt={nextRequirement.calls} />
          {nextRequirement.top_answers && (
            <Requirement label={t('Top Antworten', 'Top Answers')} cur={profile.top_answers_count} tgt={nextRequirement.top_answers} />
          )}
        </div>
      )}

      {!nextRequirement && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">{t('Maximum Level erreicht — Elite Performer', 'Max level reached — Elite Performer')}</span>
        </div>
      )}
    </div>
  );
}

function Requirement({ label, cur, tgt }: { label: string; cur: number; tgt: number }) {
  const done = cur >= tgt;
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${done ? 'text-emerald-600' : 'text-foreground'}`}>{Math.min(cur, tgt)} / {tgt}</span>
    </div>
  );
}

/** Small reusable lock indicator for gated content */
export function LockedHint({ requiredLevel, requiredCredits, lang = 'de' }: { requiredLevel?: number; requiredCredits?: number; lang?: 'de' | 'en' }) {
  const t = (de: string, en: string) => (lang === 'de' ? de : en);
  const parts: string[] = [];
  if (requiredLevel !== undefined) parts.push(`L${requiredLevel}`);
  if (requiredCredits !== undefined) parts.push(`${requiredCredits} Credits`);
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
      <Lock className="h-3 w-3" />
      {t('Gesperrt — benötigt', 'Locked — requires')} {parts.join(' ' + t('oder', 'or') + ' ')}
    </div>
  );
}
