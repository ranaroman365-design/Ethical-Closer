import { useState, useCallback } from 'react';
import { formatK } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { FlaskConical, Play, Loader2, CheckCircle2 as Check2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import KpiCareerDashboard from '@/components/members/KpiCareerDashboard';
import KpiTrendDashboard from '@/components/members/KpiTrendDashboard';
import DirectorOverview from '@/components/director/DirectorOverview';
import PartnerDashboard from '@/components/members/PartnerDashboard';
import ApplicantDashboard from '@/components/landing/ApplicantDashboard';

const PERSPECTIVES = [
  { key: 'prospect', label: 'L0 · Bewerber' },
  { key: 'opener', label: 'L1 · Trainee' },
  { key: 'setter', label: 'L2 · Setter' },
  { key: 'senior_associate', label: 'L3 · Senior Setter' },
  { key: 'junior_manager', label: 'L4 · Closer (Placement Track)' },
  { key: 'manager', label: 'L5 · Managing Closer' },
  { key: 'senior_manager', label: 'L6 · Senior Closer' },
  { key: 'director', label: 'L7 · Director' },
  { key: 'partner', label: 'L8 · Partner' },
  { key: 'simulation', label: '🧪 Simulation' },
  { key: 'stress', label: '🔥 Stress Test' },
];

interface Props {
  perspective: string;
  onChangePerspective: (p: string | null) => void;
}

export default function AdminPerspectiveSwitcher({ perspective, onChangePerspective }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [stressRunning, setStressRunning] = useState(false);
  const [stressResult, setStressResult] = useState<any>(null);

  const runSimulation = useCallback(async (clearPrev = false) => {
    setSimRunning(true); setSimResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('run-revenue-simulation', { body: { clear_previous: clearPrev } });
      if (error) throw error;
      setSimResult(data);
    } catch (e: any) { setSimResult({ error: e.message }); }
    finally { setSimRunning(false); }
  }, []);

  const runStressTest = useCallback(async (clearPrev = false) => {
    setStressRunning(true); setStressResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('run-stress-test', { body: { clear_previous: clearPrev } });
      if (error) throw error;
      setStressResult(data);
    } catch (e: any) { setStressResult({ error: e.message }); }
    finally { setStressRunning(false); }
  }, []);

  const perspectiveLabel = PERSPECTIVES.find(p => p.key === perspective)?.label ?? '';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mr-2">Admin-Perspektive:</span>
        {PERSPECTIVES.map(p => (
          <button key={p.key} onClick={() => onChangePerspective(p.key)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${perspective === p.key ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
            {p.label}
          </button>
        ))}
        <button onClick={() => onChangePerspective(null)}
          className="ml-2 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
          Eigene Ansicht
        </button>
      </div>

      {perspective === 'prospect' && <ApplicantDashboard status={{ stage: 'new', name: 'Admin Preview', email: 'admin@preview.local' }} />}
      {perspective === 'director' && <DirectorOverview />}
      {perspective === 'partner' && <PartnerDashboard />}

      {perspective === 'simulation' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-accent" />Revenue Simulation Mode
            </h2>
            <p className="text-sm text-muted-foreground mb-4">{tl('Generiert synthetische Leads, Calls, Commissions und validiert die gesamte KPI-Kette.', 'Generates synthetic leads, calls, commissions and validates the KPI chain.')}</p>
            <div className="flex items-center gap-3">
              <button onClick={() => runSimulation(false)} disabled={simRunning}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {simRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{tl('Simulation starten', 'Run Simulation')}
              </button>
              <button onClick={() => runSimulation(true)} disabled={simRunning}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
                {tl('Vorherige löschen & neu', 'Clear & re-run')}
              </button>
            </div>
          </div>
          {simResult && !simResult.error && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Director ROI Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Leads', value: simResult.director_roi?.total_leads },
                    { label: 'Won', value: simResult.director_roi?.total_won },
                    { label: 'Revenue', value: formatK(simResult.director_roi?.total_revenue ?? 0, '€') },
                    { label: 'Show Rate', value: `${simResult.director_roi?.overall_show_rate}%` },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg border border-border/40 bg-background p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                      <p className="text-lg font-bold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`rounded-xl border p-4 text-center ${simResult.all_validations_passed ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'}`}>
                <p className={`text-sm font-semibold ${simResult.all_validations_passed ? 'text-success' : 'text-destructive'}`}>
                  {simResult.all_validations_passed ? '✓ All validations passed' : '✗ Validation errors detected'}
                </p>
              </div>
            </div>
          )}
          {simResult?.error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm text-destructive font-medium">Error: {simResult.error}</p></div>}
        </div>
      )}

      {perspective === 'stress' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">🔥 Full System Stress Test</h2>
            <p className="text-sm text-muted-foreground mb-4">{tl('Testet Duplikate, ungültige Übergänge, Payout-Blocking und KPI-Containment.', 'Tests duplicates, invalid transitions, payout blocking, and KPI containment.')}</p>
            <div className="flex items-center gap-3">
              <button onClick={() => runStressTest(false)} disabled={stressRunning}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                {stressRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{tl('Stress Test starten', 'Run Stress Test')}
              </button>
              <button onClick={() => runStressTest(true)} disabled={stressRunning}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
                {tl('Vorherige löschen & neu', 'Clear & re-run')}
              </button>
            </div>
          </div>
          {stressResult && !stressResult.error && (
            <div className={`rounded-xl border p-4 text-center ${stressResult.summary?.all_passed ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'}`}>
              <p className={`text-sm font-semibold ${stressResult.summary?.all_passed ? 'text-success' : 'text-destructive'}`}>
                {stressResult.summary?.all_passed ? '✓ All stress tests passed' : `✗ ${stressResult.summary?.passed}/${stressResult.summary?.total_tests} passed`}
              </p>
            </div>
          )}
          {stressResult?.error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm text-destructive font-medium">Error: {stressResult.error}</p></div>}
        </div>
      )}

      {!['prospect', 'director', 'partner', 'simulation', 'stress'].includes(perspective) && (
        <div>
          <div className="mb-6 rounded-xl border border-accent/20 bg-accent/5 p-4">
            <p className="text-sm font-medium text-foreground">Ansicht: <span className="text-primary font-semibold">{perspectiveLabel}</span></p>
            <p className="text-xs text-muted-foreground mt-1">Performance-Dashboard für diese Karrierestufe.</p>
          </div>
          <KpiCareerDashboard />
          <div className="mt-6"><KpiTrendDashboard /></div>
        </div>
      )}
    </div>
  );
}
