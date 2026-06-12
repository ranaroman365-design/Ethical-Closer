import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { RotateCcw, ArrowRight } from 'lucide-react';

interface Props {
  lastAction?: string | null;
}

export default function ReturnPrompt({ lastAction }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const prompt = useMemo(() => {
    if (!lastAction) return null;
    const map: Record<string, { text: string; link: string }> = {
      call: { text: tl('Call-Training fortsetzen', 'Continue call training'), link: '/members/practice' },
      module: { text: tl('Modul weitermachen', 'Continue module'), link: '/members/academy' },
      message: { text: tl('Community öffnen', 'Open community'), link: '/members/community' },
      lead: { text: tl('Lead-Pool prüfen', 'Check lead pool'), link: '/members/pool' },
      booking: { text: tl('Nächsten Call vorbereiten', 'Prepare next call'), link: '/members/closer-workspace' },
    };
    return map[lastAction] ?? null;
  }, [lastAction, lang]);

  if (!prompt) return null;

  return (
    <Link
      to={prompt.link}
      className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card/80 px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm"
    >
      <RotateCcw className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {tl('Weitermachen', 'Continue')}
        </p>
        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
          {prompt.text}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
    </Link>
  );
}
