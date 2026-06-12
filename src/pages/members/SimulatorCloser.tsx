import { lazy, Suspense } from 'react';
import SimulatorShell, { type SimulatorTab } from '@/components/simulator/SimulatorShell';
import EthicalScorePanel from '@/components/simulator/EthicalScorePanel';
import { useLanguage } from '@/i18n/LanguageContext';
import { Crosshair, Mic, Target } from 'lucide-react';

const CloserSimulatorLegacy = lazy(() => import('./CloserSimulator'));
const EthicalSimulatorLegacy = lazy(() => import('./EthicalSimulator'));
const VoiceSimulatorLegacy = lazy(() => import('./VoiceSimulator'));

function OverviewPanel() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <Crosshair className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-lg font-semibold text-foreground">Closer Simulator</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {de
            ? 'Trainiere den kompletten Entscheidungsprozess: Einwandbehandlung, Commitment-Verankerung und ethisches Closing. Beinhaltet den Ethical Top Closer Modus mit Awareness-basierter Gesprächsführung.'
            : 'Train the full decision process: objection handling, commitment anchoring, and ethical closing. Includes the Ethical Top Closer mode with awareness-based conversation.'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Crosshair, de: 'Text-Modus', en: 'Text Mode', descDe: 'Entscheidungssimulation & Ethical Closer', descEn: 'Decision simulation & Ethical Closer' },
          { icon: Mic, de: 'Sprach-Modus', en: 'Voice Mode', descDe: 'KPI-gesteuertes Stimmtraining', descEn: 'KPI-driven voice training' },
          { icon: Target, de: 'Ethical Score', en: 'Ethical Score', descDe: 'Druckfrei · Wahrheitsbasiert · Fit-Validierung', descEn: 'Pressure-free · Truth-based · Fit validation' },
        ].map((item, i) => (
          <div key={i} className="rounded-xl border border-border/40 bg-card p-4">
            <item.icon className="h-4 w-4 text-accent mb-2" />
            <p className="text-[13px] font-semibold text-foreground">{de ? item.de : item.en}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{de ? item.descDe : item.descEn}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressPanel() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  return (
    <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
      <Target className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
      <h3 className="text-[14px] font-semibold text-foreground mb-1">{de ? 'Fortschritt' : 'Progress'}</h3>
      <p className="text-sm text-muted-foreground">
        {de ? 'Absolviere Szenarien, um deinen Fortschritt hier zu sehen.' : 'Complete scenarios to see your progress here.'}
      </p>
    </div>
  );
}

export default function SimulatorCloserPage() {
  return (
    <SimulatorShell
      role="closer"
      roleLabelDe="Closer Simulator"
      roleLabelEn="Closer Simulator"
      descriptionDe="Entscheidungsprozess · Einwände · Commitment · Close-Qualität"
      descriptionEn="Decision process · Objections · Commitment · Close quality"
    >
      {(tab: SimulatorTab) => {
        switch (tab) {
          case 'overview': return <OverviewPanel />;
          case 'scenarios':
          case 'text':
            return (
              <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>}>
                <div className="space-y-6">
                  <CloserSimulatorLegacy />
                </div>
              </Suspense>
            );
          case 'voice':
            return (
              <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>}>
                <VoiceSimulatorLegacy />
              </Suspense>
            );
          case 'review':
            return (
              <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>}>
                <EthicalSimulatorLegacy />
              </Suspense>
            );
          case 'ethical': return <EthicalScorePanel />;
          case 'progress': return <ProgressPanel />;
          default: return null;
        }
      }}
    </SimulatorShell>
  );
}
