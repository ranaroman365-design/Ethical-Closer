import { Sparkles, BookOpen, Target, TrendingUp, Users } from 'lucide-react';
import { PRODUCT } from '@/config/product';

interface Props {
  level: number;
  userName: string;
  lang: string;
}

const WELCOME_CONFIG: Record<string, { icon: React.ElementType; titleDe: string; titleEn: string; messageDe: string; messageEn: string; tipDe: string; tipEn: string }> = {
  low: {
    icon: BookOpen,
    titleDe: `Willkommen bei ${PRODUCT.name}`,
    titleEn: `Welcome to ${PRODUCT.name}`,
    messageDe: 'Schön, dass du hier bist! Dein erster Schritt: Schließe die Orientierung ab und starte mit den Grundlagen.',
    messageEn: 'Great to have you here! Your first step: Complete the orientation and start with the fundamentals.',
    tipDe: '💡 Tipp: Nutze den 1:1 Chat, um dich mit deinem Mentor zu verbinden.',
    tipEn: '💡 Tip: Use the 1:1 chat to connect with your mentor.',
  },
  setter: {
    icon: Target,
    titleDe: 'Willkommen im Setter-Bereich',
    titleEn: 'Welcome to the Setter Area',
    messageDe: 'Hier geht es um Qualifizierung, Kontaktaufnahme und den Aufbau deiner Setter-Skills.',
    messageEn: 'This is about qualification, outreach, and building your setter skills.',
    tipDe: '📞 Tipp: Teile deine Call-Learnings in der Community — andere profitieren davon.',
    tipEn: '📞 Tip: Share your call learnings in the community — others benefit from it.',
  },
  closer: {
    icon: TrendingUp,
    titleDe: 'Willkommen im Closer-Bereich',
    titleEn: 'Welcome to the Closer Area',
    messageDe: 'Performance, Deals und KPI-Optimierung. Hier zählt Execution.',
    messageEn: 'Performance, deals, and KPI optimization. Execution matters here.',
    tipDe: '📊 Tipp: Halte deine KPIs im Blick und nutze den Call-Simulator für Training.',
    tipEn: '📊 Tip: Keep an eye on your KPIs and use the call simulator for training.',
  },
  leadership: {
    icon: Users,
    titleDe: 'Willkommen im Leadership-Bereich',
    titleEn: 'Welcome to the Leadership Area',
    messageDe: 'Skalierung, Team-Aufbau und strategische Steuerung. Dein Impact multipliziert sich hier.',
    messageEn: 'Scaling, team building, and strategic management. Your impact multiplies here.',
    tipDe: '🧠 Tipp: Nutze das Director-Dashboard für Team-KPIs und Placement-Übersicht.',
    tipEn: '🧠 Tip: Use the Director Dashboard for team KPIs and placement overview.',
  },
};

function getConfigKey(level: number): string {
  if (level <= 1) return 'low';
  if (level <= 3) return 'setter';
  if (level <= 6) return 'closer';
  return 'leadership';
}

export default function WelcomeMessage({ level, userName, lang }: Props) {
  const config = WELCOME_CONFIG[getConfigKey(level)];
  const Icon = config.icon;
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t(config.titleDe, config.titleEn)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {userName ? `${t('Hallo', 'Hello')}, ${userName.split(' ')[0]}` : t('Hallo', 'Hello')}
          </p>
        </div>
        <Sparkles className="ml-auto h-4 w-4 text-primary/40" />
      </div>
      <p className="text-[12px] text-foreground/80 leading-relaxed">
        {t(config.messageDe, config.messageEn)}
      </p>
      <p className="text-[11px] text-primary/70 leading-relaxed">
        {t(config.tipDe, config.tipEn)}
      </p>
    </div>
  );
}