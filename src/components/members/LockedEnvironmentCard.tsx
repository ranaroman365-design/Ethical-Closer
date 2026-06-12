import { Lock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

interface Props {
  title: string;
  description: string;
  unlockHint: string;
  to: string;
  level: number;
  requiredLevel: number;
}

/**
 * Shows a locked premium environment with pull mechanic.
 * Visible but not accessible — creates aspiration.
 */
export default function LockedEnvironmentCard({ title, description, unlockHint, to, level, requiredLevel }: Props) {
  const { lang } = useLanguage();
  const isUnlocked = level >= requiredLevel;
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  if (isUnlocked) {
    return (
      <Link
        to={to}
        className="group flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.02] p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.04]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ArrowRight className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground group-hover:text-primary transition-colors">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{description}</p>
        </div>
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-muted/30 p-4 opacity-75">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Lock className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-muted-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground/60 truncate">{description}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/50 italic pl-12">
        🔒 {unlockHint}
      </p>
    </div>
  );
}
