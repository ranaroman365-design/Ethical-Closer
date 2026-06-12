import type { UserState } from '@/hooks/useUserState';
import { useLanguage } from '@/i18n/LanguageContext';

const STATE_CONFIG: Record<UserState, { de: string; en: string; emoji: string; color: string }> = {
  new:        { de: 'Neustarter',           en: 'New',           emoji: '🌱', color: 'text-muted-foreground border-border' },
  learning:   { de: 'Im Training',          en: 'Learning',      emoji: '📖', color: 'text-accent border-accent/30' },
  committed:  { de: 'Committed',            en: 'Committed',     emoji: '🎯', color: 'text-primary border-primary/30' },
  stuck:      { de: 'Support empfohlen',    en: 'Support needed', emoji: '⏸️', color: 'text-destructive border-destructive/30' },
  unstable:   { de: 'Stabilisierung',       en: 'Stabilizing',   emoji: '📊', color: 'text-[hsl(39,76%,49%)] border-[hsl(39,76%,49%)]/30' },
  performing: { de: 'Performer',            en: 'Performing',    emoji: '🔥', color: 'text-success border-success/30' },
  scaling:    { de: 'Scaling',              en: 'Scaling',       emoji: '🚀', color: 'text-primary border-primary/40' },
  leading:    { de: 'Leader',               en: 'Leading',       emoji: '👑', color: 'text-accent border-accent/40' },
};

export default function StateIndicator({ state }: { state: UserState }) {
  const { lang } = useLanguage();
  const cfg = STATE_CONFIG[state];
  const label = lang === 'de' ? cfg.de : cfg.en;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[11px] font-medium ${cfg.color}`}>
      <span>{cfg.emoji}</span>
      {label}
    </span>
  );
}
