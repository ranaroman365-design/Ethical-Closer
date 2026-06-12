import { MessageSquare, TrendingUp, HelpCircle, Target } from 'lucide-react';

interface Props {
  level: number;
  context: 'dm' | 'community';
  lang: string;
  onSelect: (text: string) => void;
}

const DM_STARTERS: Record<string, { icon: React.ElementType; de: string; en: string }[]> = {
  low: [
    { icon: HelpCircle, de: 'Kannst du mir einen Tipp für meinen ersten Call geben?', en: 'Can you give me a tip for my first call?' },
    { icon: MessageSquare, de: 'Wie war dein erster Monat auf der Plattform?', en: 'How was your first month on the platform?' },
    { icon: Target, de: 'Was sollte ich als Erstes lernen?', en: 'What should I learn first?' },
  ],
  mid: [
    { icon: TrendingUp, de: 'Kannst du dir meinen letzten Call anhören und Feedback geben?', en: 'Can you listen to my last call and give feedback?' },
    { icon: Target, de: 'Wie gehst du mit dem Einwand "zu teuer" um?', en: 'How do you handle the "too expensive" objection?' },
    { icon: MessageSquare, de: 'Lass uns den nächsten Schritt koordinieren.', en: 'Let\'s coordinate the next step.' },
  ],
  high: [
    { icon: TrendingUp, de: 'Wie optimierst du deine Close Rate gerade?', en: 'How are you optimizing your close rate right now?' },
    { icon: Target, de: 'Welche KPI-Strategie funktioniert bei dir am besten?', en: 'Which KPI strategy works best for you?' },
    { icon: MessageSquare, de: 'Hast du Kapazität für eine kurze Abstimmung?', en: 'Do you have capacity for a quick sync?' },
  ],
  leadership: [
    { icon: TrendingUp, de: 'Wie skalierst du dein Team gerade?', en: 'How are you scaling your team right now?' },
    { icon: Target, de: 'Welche Recruiting-Strategie funktioniert aktuell?', en: 'Which recruiting strategy is working right now?' },
    { icon: MessageSquare, de: 'Können wir über Placement-Kapazitäten sprechen?', en: 'Can we talk about placement capacities?' },
  ],
};

const COMMUNITY_STARTERS: Record<string, { icon: React.ElementType; de: string; en: string }[]> = {
  low: [
    { icon: Target, de: '🎯 Was ist mein Fokus diese Woche?', en: '🎯 What\'s my focus this week?' },
    { icon: MessageSquare, de: '💡 Was hat mir diese Woche am meisten geholfen?', en: '💡 What helped me most this week?' },
  ],
  mid: [
    { icon: TrendingUp, de: '🏆 Mein größter Win diese Woche:', en: '🏆 My biggest win this week:' },
    { icon: HelpCircle, de: '📞 Härtester Einwand heute — wie würdet ihr reagieren?', en: '📞 Hardest objection today — how would you respond?' },
  ],
  high: [
    { icon: TrendingUp, de: '🏆 Deal-Win: Was war der entscheidende Hebel?', en: '🏆 Deal win: What was the key lever?' },
    { icon: Target, de: '📊 KPI-Update: Was hat sich verbessert und warum?', en: '📊 KPI update: What improved and why?' },
  ],
  leadership: [
    { icon: TrendingUp, de: '📈 Team-Performance Update', en: '📈 Team performance update' },
    { icon: Target, de: '🧠 Insight: Was funktioniert beim Onboarding neuer Closer?', en: '🧠 Insight: What works when onboarding new closers?' },
  ],
};

function getLevelBucket(level: number): string {
  if (level <= 1) return 'low';
  if (level <= 3) return 'mid';
  if (level <= 6) return 'high';
  return 'leadership';
}

export default function ConversationStarters({ level, context, lang, onSelect }: Props) {
  const bucket = getLevelBucket(level);
  const starters = context === 'dm' ? DM_STARTERS[bucket] : COMMUNITY_STARTERS[bucket];
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  return (
    <div className="space-y-1">
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5">
        {t('Gesprächsvorschläge', 'Conversation starters')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {starters.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={i}
              onClick={() => onSelect(lang === 'de' ? s.de : s.en)}
              className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-left"
            >
              <Icon className="h-3 w-3 shrink-0 text-primary/60" />
              <span className="line-clamp-1">{lang === 'de' ? s.de : s.en}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}