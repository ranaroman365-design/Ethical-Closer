import { lazy, Suspense } from 'react';
import SimulatorShell, { type SimulatorTab } from '@/components/simulator/SimulatorShell';
import EthicalScorePanel from '@/components/simulator/EthicalScorePanel';
import { useLanguage } from '@/i18n/LanguageContext';
import { MessageCircle, Mic, Target } from 'lucide-react';

// Re-use the existing OpenerSimulator for the text mode
const OpenerSimulatorLegacy = lazy(() => import('./OpenerSimulator'));
const VoiceSimulatorLegacy = lazy(() => import('./VoiceSimulator'));

function OverviewPanel() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <MessageCircle className="h-5 w-5 text-blue-500" />
          <h2 className="font-serif text-lg font-semibold text-foreground">Opener Simulator</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {de
            ? 'Trainiere den Erstkontakt mit Leads über verschiedene Kanäle. Übe Hook Precision, Context Framing, Curiosity Loops und emotionale Kalibrierung. Jeder Versuch wird mit dem Ethical Closing Score bewertet.'
            : 'Train first contact with leads across channels. Practice hook precision, context framing, curiosity loops, and emotional calibration. Every attempt is evaluated with the Ethical Closing Score.'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: MessageCircle, de: 'Text-Modus', en: 'Text Mode', descDe: 'Chat-basiertes Training mit AI-Leads', descEn: 'Chat-based training with AI leads' },
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

function VoicePlaceholder() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  return (
    <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">{de ? 'Lädt…' : 'Loading…'}</div>}>
      <VoiceSimulatorLegacy />
    </Suspense>
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
        {de
          ? 'Absolviere Szenarien, um deinen Fortschritt hier zu sehen.'
          : 'Complete scenarios to see your progress here.'}
      </p>
    </div>
  );
}

export default function SimulatorOpener() {
  return (
    <SimulatorShell
      role="opener"
      roleLabelDe="Opener Simulator"
      roleLabelEn="Opener Simulator"
      descriptionDe="Erstkontakt · Aufmerksamkeit · Vertrauen · Qualifizierungsstart"
      descriptionEn="First contact · Attention · Trust · Qualification start"
    >
      {(tab: SimulatorTab) => {
        switch (tab) {
          case 'overview': return <OverviewPanel />;
          case 'scenarios':
          case 'text':
            return (
              <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>}>
                <OpenerSimulatorLegacy />
              </Suspense>
            );
          case 'voice': return <VoicePlaceholder />;
          case 'review':
            return (
              <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>}>
                <OpenerSimulatorLegacy />
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
