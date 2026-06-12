import { Sparkles, X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRadiantTrigger } from '@/hooks/useRadiantTrigger';
import { useLanguage } from '@/i18n/LanguageContext';

const TRIGGER_ICONS: Record<string, string> = {
  performance_drop: '📉',
  inactivity: '⏸️',
  booster_active: '⏱️',
  emotional_friction: '🧠',
};

const TRIGGER_CTA: Record<string, { de: string; en: string }> = {
  performance_drop: { de: 'Performance stabilisieren', en: 'Stabilize performance' },
  inactivity: { de: 'Zurück in den Flow', en: 'Get back in flow' },
  booster_active: { de: 'Booster aktivieren', en: 'Activate booster' },
  emotional_friction: { de: 'Unterstützung ansehen', en: 'View support' },
};

export default function RadiantSuggestionCard() {
  const { activeTrigger, dismiss } = useRadiantTrigger();
  const { lang } = useLanguage();

  if (!activeTrigger) return null;

  const emoji = TRIGGER_ICONS[activeTrigger.trigger_type] || '✨';
  const cta = TRIGGER_CTA[activeTrigger.trigger_type] || { de: 'Mehr erfahren', en: 'Learn more' };

  return (
    <div className="relative rounded-xl border border-accent/20 bg-gradient-to-br from-accent/[0.04] to-transparent p-5 transition-all">
      {/* Dismiss */}
      <button
        onClick={() => dismiss(activeTrigger.id)}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-lg">
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
              Radiant
            </span>
          </div>
          <p className="text-sm font-medium text-foreground leading-snug">
            {activeTrigger.trigger_reason}
          </p>
          <Link
            to="/members/radiant"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-[11px] font-medium text-accent transition-all hover:bg-accent/10 hover:border-accent/40"
          >
            {cta[lang]}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
