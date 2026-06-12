import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import {
  Crosshair, MessageSquare, Mic, BarChart3, Shield, TrendingUp, List,
} from 'lucide-react';

export type SimulatorTab = 'overview' | 'scenarios' | 'text' | 'voice' | 'review' | 'ethical' | 'progress';

interface TabDef {
  key: SimulatorTab;
  labelDe: string;
  labelEn: string;
  icon: React.ComponentType<any>;
}

const TABS: TabDef[] = [
  { key: 'overview', labelDe: 'Überblick', labelEn: 'Overview', icon: Crosshair },
  { key: 'scenarios', labelDe: 'Szenarien', labelEn: 'Scenarios', icon: List },
  { key: 'text', labelDe: 'Text-Modus', labelEn: 'Text Mode', icon: MessageSquare },
  { key: 'voice', labelDe: 'Sprach-Modus', labelEn: 'Voice Mode', icon: Mic },
  { key: 'review', labelDe: 'Auswertung', labelEn: 'Review', icon: BarChart3 },
  { key: 'ethical', labelDe: 'Ethical Score', labelEn: 'Ethical Score', icon: Shield },
  { key: 'progress', labelDe: 'Fortschritt', labelEn: 'Progress', icon: TrendingUp },
];

interface SimulatorShellProps {
  role: 'opener' | 'setter' | 'closer';
  roleLabelDe: string;
  roleLabelEn: string;
  descriptionDe: string;
  descriptionEn: string;
  children: (activeTab: SimulatorTab) => React.ReactNode;
  defaultTab?: SimulatorTab;
}

const ROLE_COLORS: Record<string, string> = {
  opener: 'text-blue-500',
  setter: 'text-amber-500',
  closer: 'text-primary',
};

export default function SimulatorShell({
  role, roleLabelDe, roleLabelEn, descriptionDe, descriptionEn, children, defaultTab = 'overview',
}: SimulatorShellProps) {
  const { lang } = useLanguage();
  const de = lang === 'de';
  const [activeTab, setActiveTab] = useState<SimulatorTab>(defaultTab);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
          {de ? 'Simulator' : 'Simulator'}
        </p>
        <h1 className={cn('font-serif text-2xl font-semibold tracking-tight text-foreground', ROLE_COLORS[role])}>
          {de ? roleLabelDe : roleLabelEn}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {de ? descriptionDe : descriptionEn}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-border/40 bg-card p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{de ? tab.labelDe : tab.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {children(activeTab)}
    </div>
  );
}
