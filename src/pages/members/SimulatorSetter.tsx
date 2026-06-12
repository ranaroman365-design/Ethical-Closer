import { lazy, Suspense } from 'react';
import SimulatorShell, { type SimulatorTab } from '@/components/simulator/SimulatorShell';
import EthicalScorePanel from '@/components/simulator/EthicalScorePanel';
import { useLanguage } from '@/i18n/LanguageContext';
import { Phone, Mic, Target } from 'lucide-react';

const SetterSimulatorLegacy = lazy(() => import('./SetterSimulator'));
const VoiceSimulatorLegacy = lazy(() => import('./VoiceSimulator'));

function OverviewPanel() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <Phone className="h-5 w-5 text-amber-500" />
          <h2 className="font-serif text-lg font-semibold text-foreground">Setter Simulator</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {de
            ? 'Trainiere Qualifizierung, SPIN-Fragen, BANT-Analyse und Closer-Übergabe. Jeder Versuch wird mit dem Ethical Closing Score bewertet.'
            : 'Train qualification, SPIN questions, BANT analysis, and closer handover. Every attempt is evaluated with the Ethical Closing Score.'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Phone, de: 'Text-Modus', en: 'Text Mode', descDe: 'Setter-Calls simulieren', descEn: 'Simulate setter calls' },
          { icon: Mic, de: 'Sprach-Modus', en: 'Voice Mode', descDe: 'Stimmtraining mit AI-Feedback', descEn: 'Voice training with AI feedback' },
          { icon: Target, de: 'Ethical Score', en: 'Ethical Score', descDe: 'Qualitätsstandard für jeden Versuch', descEn: 'Quality standard for every attempt' },
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

export default function SimulatorSetterPage() {
  return (
    <SimulatorShell
      role="setter"
      roleLabelDe="Setter Simulator"
      roleLabelEn="Setter Simulator"
      descriptionDe="Qualifizierung · Terminbereitschaft · Filtering · Übergabe"
      descriptionEn="Qualification · Appointment readiness · Filtering · Handover"
    >
      {(tab: SimulatorTab) => {
        switch (tab) {
          case 'overview': return <OverviewPanel />;
          case 'scenarios':
          case 'text':
            return (
              <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>}>
                <SetterSimulatorLegacy />
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
                <SetterSimulatorLegacy />
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
