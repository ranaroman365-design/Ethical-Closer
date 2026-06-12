import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Check, Target, Layers, TrendingUp, Zap, Users, Briefcase } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const STAGES = [
  { value: 'learning', label: 'Ich lerne (Level 1–2)' },
  { value: 'closing', label: 'Ich close (Level 3–4)' },
  { value: 'income', label: 'Ich generiere konstantes Einkommen' },
  { value: 'leading', label: 'Ich führe andere' },
  { value: 'offers', label: 'Ich betreibe eigene Offers' },
];

const ASSETS = [
  { value: 'skill', label: 'Mein eigener Skill (Closing)', icon: Target },
  { value: 'closers', label: 'Andere Closer', icon: Users },
  { value: 'offer', label: 'Ein Angebot / Produkt', icon: Briefcase },
  { value: 'network', label: 'Ein Netzwerk von Unternehmen', icon: Layers },
  { value: 'systems', label: 'Systeme / Infrastruktur', icon: Zap },
];

const GOALS = [
  { value: 'income', label: 'Höheres Einkommen (gleiches Modell)' },
  { value: 'leverage', label: 'Mehr Leverage (Team)' },
  { value: 'ownership', label: 'Eigener Umsatz (Offer)' },
  { value: 'portfolio', label: 'Mehrere Einkommensströme' },
  { value: 'system', label: 'System-Level Skalierung' },
];

const MODEL_MAP: Record<string, { title: string; description: string; model: string }> = {
  income: { title: 'Monetize Skill', model: 'Model 1', description: 'Du hast bereits Skill. Dein schnellstes Wachstum kommt durch Optimierung deiner Performance und höhere Deal Sizes.' },
  leverage: { title: 'Talent Leverage', model: 'Model 2', description: 'Du hast bereits Skill. Dein schnellstes Wachstum kommt durch Multiplikation über andere Menschen.' },
  ownership: { title: 'Offer Control', model: 'Model 3', description: 'Dein nächster Schritt: Kontrolliere das Angebot, nicht nur den Verkauf. Eigener Revenue statt Commission.' },
  portfolio: { title: 'Multi-Offer System', model: 'Model 4', description: 'Diversifiziere über mehrere Angebote mit geteilter Infrastruktur für reduziertes Risiko.' },
  system: { title: 'Platform Scale', model: 'Model 6', description: 'Skaliere das System selbst. Onboarde Directors, lizenziere Infrastruktur, baue Netzwerk-Effekte.' },
};

const REQUIRED_ASSETS: Record<string, string[]> = {
  income: ['skill'],
  leverage: ['skill', 'closers', 'systems'],
  ownership: ['skill', 'offer', 'systems'],
  portfolio: ['skill', 'offer', 'closers', 'network', 'systems'],
  system: ['skill', 'offer', 'closers', 'network', 'systems'],
};

const ACTION_PLANS: Record<string, string[]> = {
  income: ['Performance-KPIs optimieren', 'Closing-Rate auf 30%+ bringen', 'Deal Size erhöhen', 'Ethische Gesprächsführung vertiefen'],
  leverage: ['Setter–Closer Unit aufbauen', '30–50 zusätzliche Calls pro Woche', 'Awareness + Decision KPIs tracken', 'Zweiten Closer onboarden'],
  ownership: ['Eigenes Offer strukturieren', 'Pricing und Positionierung definieren', 'Closer-Team zuweisen', 'Conversion-Funnel aufbauen'],
  portfolio: ['Zweites Offer identifizieren', 'Team-Struktur über Offers skalieren', 'Shared Infrastructure aufbauen', 'Revenue-Diversifikation messen'],
  system: ['Platform-Lizenzmodell entwickeln', 'Director-Onboarding systematisieren', 'Revenue-Share-Strukturen aufsetzen', 'Netzwerk-Effekte aktivieren'],
};

const COMMITMENT_OPTIONS = [
  { value: 'commit', label: 'Ich setze diesen Plan um', icon: Check },
  { value: 'refine', label: 'Ich möchte ihn verfeinern', icon: Target },
  { value: 'not_ready', label: 'Ich bin noch nicht bereit', icon: ArrowLeft },
];

export default function ScalingPlanWizard() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [userStage, setUserStage] = useState('');
  const [activeAssets, setActiveAssets] = useState<string[]>([]);
  const [targetGoal, setTargetGoal] = useState('');
  const [commitment, setCommitment] = useState('');

  const toggleAsset = (val: string) => {
    setActiveAssets(prev => prev.includes(val) ? prev.filter(a => a !== val) : [...prev, val]);
  };

  const model = MODEL_MAP[targetGoal];
  const required = REQUIRED_ASSETS[targetGoal] || [];
  const missing = required.filter(a => !activeAssets.includes(a));
  const missingLabels = missing.map(m => ASSETS.find(a => a.value === m)?.label || m);
  const actions = ACTION_PLANS[targetGoal] || [];

  const canNext = () => {
    if (step === 0) return !!userStage;
    if (step === 1) return activeAssets.length > 0;
    if (step === 2) return !!targetGoal;
    return true;
  };

  if (!started) {
    return (
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-6 sm:p-8 text-center">
          <h2 className="font-serif text-xl font-semibold text-foreground sm:text-2xl">
            Define Your Scaling Path
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Turn understanding into a clear strategy.
          </p>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
            Du skalierst nicht, indem du mehr lernst. Du skalierst, indem du entscheidest, was du kontrollieren willst.
          </p>
          <button
            onClick={() => setStarted(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start My Plan <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.section>
    );
  }

  const TOTAL_STEPS = 7;

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          My Scaling Plan™ — Schritt {step + 1} / {TOTAL_STEPS}
        </p>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden mb-6">
        <motion.div
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step 0: Current Position */}
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">Wo stehst du gerade?</h3>
              <div className="space-y-2">
                {STAGES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setUserStage(s.value)}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                      userStage === s.value
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-accent/40'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Current Assets */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">Was nutzt du heute?</h3>
              <div className="space-y-2">
                {ASSETS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => toggleAsset(a.value)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                      activeAssets.includes(a.value)
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-accent/40'
                    }`}
                  >
                    <a.icon className="h-4 w-4 shrink-0" />
                    {a.label}
                    {activeAssets.includes(a.value) && <Check className="ml-auto h-4 w-4 text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Desired Level */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">Was willst du kontrollieren?</h3>
              <div className="space-y-2">
                {GOALS.map(g => (
                  <button
                    key={g.value}
                    onClick={() => setTargetGoal(g.value)}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                      targetGoal === g.value
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-accent/40'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Model Match */}
          {step === 3 && model && (
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">Dein Scaling Model</h3>
              <Card className="border-accent/30 bg-accent/5">
                <CardContent className="p-6 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{model.model}</p>
                  <p className="font-serif text-xl font-semibold text-foreground">{model.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{model.description}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 4: Gap Analysis */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">Was fehlt dir noch?</h3>
              {missing.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {missingLabels.map((l, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-foreground">
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                        {l}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Skalierung bedeutet nicht, mehr zu tun. Es bedeutet, das fehlende Stück hinzuzufügen.
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm text-foreground">Du hast alle erforderlichen Assets. Zeit, sie zu aktivieren.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Action Plan */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">Dein nächster Move</h3>
              <div className="space-y-2">
                {actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm text-foreground">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                      {i + 1}
                    </span>
                    {a}
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Zeitrahmen: <span className="font-semibold text-foreground">30–60 Tage</span> bis zum nächsten Level</p>
              </div>
            </div>
          )}

          {/* Step 6: Commitment */}
          {step === 6 && (
            <div className="space-y-4">
              <h3 className="font-serif text-lg font-semibold text-foreground">Mach es real</h3>
              <p className="text-sm text-muted-foreground">
                Klarheit ohne Handlung verändert nichts. Entscheide, was du als Nächstes umsetzt.
              </p>
              <div className="space-y-2">
                {COMMITMENT_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setCommitment(c.value)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all ${
                      commitment === c.value
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-accent/40'
                    }`}
                  >
                    <c.icon className="h-4 w-4" />
                    {c.label}
                  </button>
                ))}
              </div>
              {commitment === 'commit' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
                  <Check className="mx-auto mb-2 h-6 w-6 text-primary" />
                  <p className="font-serif text-sm font-semibold text-foreground">Plan gespeichert.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tracke deinen Fortschritt im KPI Dashboard.</p>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ArrowLeft className="h-3 w-3" /> Zurück
        </button>
        {step < TOTAL_STEPS - 1 && (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            Weiter <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </motion.section>
  );
}
