import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Phone, Search, Target, Lightbulb, Shield, HandshakeIcon, CheckCircle2 } from 'lucide-react';

interface FrameworkStep {
  phase: string;
  icon: typeof Phone;
  color: string;
  duration: string;
  goal: string;
  keyActions: string[];
  scripts: string[];
  doNot: string[];
}

const FRAMEWORK: FrameworkStep[] = [
  {
    phase: 'OPEN',
    icon: Phone,
    color: 'text-blue-400',
    duration: '2-3 Min',
    goal: 'Rapport aufbauen, Rahmen setzen, Kontrolle übernehmen.',
    keyActions: [
      'Begrüßung mit Energie und echtem Interesse',
      'Agenda des Calls klar kommunizieren',
      'Erlaubnis für direkte Fragen holen',
      'Erwartungen klären: „Am Ende wissen wir beide, ob es passt."',
    ],
    scripts: [
      '„Hey [Name], schön dass du dir die Zeit nimmst. Ich habe gesehen, dass du dich für [Thema] interessierst — erzähl mir kurz, was dich dazu gebracht hat."',
      '„Bevor wir starten: Ich stelle dir ein paar direkte Fragen, damit ich verstehe, ob und wie wir dir helfen können. Ist das okay?"',
      '„Am Ende unseres Gesprächs gibt es drei Möglichkeiten: Es passt perfekt, es passt nicht, oder der Zeitpunkt ist nicht richtig. Alles ist völlig okay."',
    ],
    doNot: [
      'Direkt über das Produkt reden',
      'Zu viel über dich selbst erzählen',
      'Den Lead zu früh pitchen',
    ],
  },
  {
    phase: 'PROBE',
    icon: Search,
    color: 'text-emerald-400',
    duration: '10-15 Min',
    goal: 'Situation, Problem, Impact und gewünschtes Ergebnis verstehen.',
    keyActions: [
      'SPIN-Fragen stellen (Situation → Problem → Implikation → Nutzen)',
      'Aktiv zuhören und zusammenfassen',
      'Emotionale Trigger identifizieren',
      'Pain quantifizieren (Geld, Zeit, Energie)',
    ],
    scripts: [
      '„Wie sieht dein Alltag aktuell aus, wenn es um [Thema] geht?"',
      '„Was ist die größte Herausforderung dabei?"',
      '„Wie wirkt sich das auf [Bereich] aus? Was kostet dich das?"',
      '„Wenn das Problem gelöst wäre — wie sähe dein Leben in 6 Monaten aus?"',
    ],
    doNot: [
      'Ja/Nein-Fragen stellen',
      'Antworten bewerten oder unterbrechen',
      'Eigene Meinung zu früh einbringen',
    ],
  },
  {
    phase: 'EDUCATE',
    icon: Lightbulb,
    color: 'text-amber-400',
    duration: '5-8 Min',
    goal: 'Die Lösung positionieren und den „Aha-Moment" erzeugen.',
    keyActions: [
      'Problem zusammenfassen und spiegeln',
      'Methode/Framework erklären (nicht Features)',
      'Social Proof einbauen: „Wir hatten einen Teilnehmer, der…"',
      'Brücke bauen: Problem → Lösung → Ergebnis',
    ],
    scripts: [
      '„Okay, lass mich zusammenfassen: Du bist bei [Situation], und das führt zu [Problem], was dich [Kosten/Impact] kostet. Richtig?"',
      '„Was wir machen ist Folgendes: [Methode in 2-3 Sätzen]."',
      '„[Name des Kunden] war in einer ähnlichen Situation — innerhalb von [Zeitraum] hat er/sie [Ergebnis] erreicht."',
    ],
    doNot: [
      'Alle Features aufzählen',
      'Zu lange über die Methode reden',
      'Den Lead mit Informationen überfluten',
    ],
  },
  {
    phase: 'NAVIGATE',
    icon: Shield,
    color: 'text-purple-400',
    duration: '5-10 Min',
    goal: 'Einwände proaktiv behandeln und Buying-Signals erkennen.',
    keyActions: [
      'Fragen, ob Bedenken bestehen',
      'Einwände isolieren: „Gibt es noch etwas außer [Einwand]?"',
      'Feel-Felt-Found oder Reframe-Technik nutzen',
      'Preis als Investment framen',
    ],
    scripts: [
      '„Was geht dir gerade durch den Kopf?"',
      '„Wenn [Einwand] kein Thema wäre — würdest du starten wollen?"',
      '„Ich verstehe das. Viele unserer besten Teilnehmer hatten am Anfang die gleiche Sorge. Was sie dann erlebt haben war…"',
      '„Wenn du das auf die Monate aufteilst, sind das [X] € pro Tag. Ist dir die Veränderung das wert?"',
    ],
    doNot: [
      'Einwände ignorieren oder abtun',
      'Defensiv werden',
      'Rabatte anbieten, bevor du den Wert erklärt hast',
    ],
  },
  {
    phase: 'COMMITMENT',
    icon: HandshakeIcon,
    color: 'text-accent',
    duration: '3-5 Min',
    goal: 'Entscheidung herbeiführen — ethisch und selbstbewusst.',
    keyActions: [
      'Zusammenfassung: Situation → Lösung → Ergebnis',
      'Trial Close: „Auf einer Skala von 1-10…"',
      'Alternativ-Close anbieten',
      'Next Steps klar kommunizieren',
    ],
    scripts: [
      '„Basierend auf allem, was du mir erzählt hast: Du willst [Ziel], [Problem] steht dir im Weg, und unsere Methode hat genau das für [Referenz] gelöst. Passt das soweit?"',
      '„Ich sehe zwei Optionen für dich: [Option A] oder [Option B]. Was fühlt sich richtiger an?"',
      '„Soll ich dir den Platz sichern? Dann starten wir mit [nächstem Schritt]."',
      '„Wie fühlt sich das an?"',
    ],
    doNot: [
      'Zu viel reden nach dem Close',
      'Unsicherheit zeigen',
      'Den Lead unter Druck setzen',
    ],
  },
];

export default function CallFramework() {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(['OPEN']));

  const toggle = (phase: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(phase) ? next.delete(phase) : next.add(phase);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Call Framework</h1>
        <p className="mt-1 text-sm text-muted-foreground">OPEN → PROBE → EDUCATE → NAVIGATE → COMMITMENT</p>
      </div>

      {/* Visual Pipeline */}
      <div className="mb-8 flex items-center gap-1 overflow-x-auto pb-2">
        {FRAMEWORK.map((step, i) => (
          <div key={step.phase} className="flex items-center">
            <button
              onClick={() => toggle(step.phase)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[12px] font-bold transition-all ${
                expandedPhases.has(step.phase)
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border/40 bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <step.icon className={`h-4 w-4 ${step.color}`} />
              {step.phase}
            </button>
            {i < FRAMEWORK.length - 1 && (
              <span className="mx-1 text-muted-foreground/30">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Phases Detail */}
      <div className="space-y-3">
        {FRAMEWORK.map((step, index) => {
          const isExpanded = expandedPhases.has(step.phase);
          return (
            <div key={step.phase} className="rounded-xl border border-border/40 bg-card overflow-hidden">
              <button
                onClick={() => toggle(step.phase)}
                className="flex w-full items-center gap-4 p-5 text-left"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 ${step.color}`}>
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground">PHASE {index + 1}</span>
                    <Badge variant="outline" className="text-[9px]">{step.duration}</Badge>
                  </div>
                  <h3 className="text-[15px] font-semibold text-foreground">{step.phase}</h3>
                  <p className="text-[12px] text-muted-foreground">{step.goal}</p>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>

              {isExpanded && (
                <div className="border-t border-border/30 px-5 pb-5 pt-4 space-y-5">
                  {/* Key Actions */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Key Actions</p>
                    <div className="space-y-1.5">
                      {step.keyActions.map((a, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                          <span className="text-[12px] text-foreground">{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scripts */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Beispiel-Skripte</p>
                    <div className="space-y-2">
                      {step.scripts.map((s, i) => (
                        <div key={i} className="rounded-lg border border-border/30 bg-muted/20 p-3">
                          <p className="text-[12px] text-foreground italic leading-relaxed">{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Don'ts */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-destructive/60 mb-2">❌ Vermeide</p>
                    <div className="space-y-1">
                      {step.doNot.map((d, i) => (
                        <p key={i} className="text-[12px] text-muted-foreground">• {d}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
