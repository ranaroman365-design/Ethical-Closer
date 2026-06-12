import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Brain, Database, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';

type State = 'not_enough_data' | 'collecting_signal' | 'learning_active';

interface Stats {
  totalCalls: number;
  callsWithTranscript: number;
  transcriptRate: number;
  callAnalysisRows: number;
  callOutcomesRows: number;
  patternInsights: number;
  aiScriptBlocks: number;
  state: State;
}

/**
 * Truth-only AI Learning status. No simulated state.
 * Rules:
 *  - learning_active : transcript_rate >= 30% AND outcomes > 0 AND (pattern_insights > 0 OR ai_script_blocks > 0)
 *  - collecting_signal : transcript_rate >= 30% AND outcomes > 0
 *  - not_enough_data : everything else
 */
export default function AILearningStatusBanner() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [callsHead, transcriptHead, analysisHead, outcomesHead, patternsHead, scriptBlocksHead] =
          await Promise.all([
            supabase.from('calls').select('id', { count: 'exact', head: true }).eq('is_simulation', false),
            supabase
              .from('calls')
              .select('id', { count: 'exact', head: true })
              .eq('is_simulation', false)
              .not('transcript', 'is', null),
            supabase.from('call_analysis').select('id', { count: 'exact', head: true }),
            supabase.from('call_outcomes').select('id', { count: 'exact', head: true }),
            supabase.from('copilot_pattern_insights' as any).select('id', { count: 'exact', head: true }),
            supabase
              .from('script_blocks' as any)
              .select('id', { count: 'exact', head: true })
              .eq('source', 'AI_PATTERN'),
          ]);

        const totalCalls = callsHead.count ?? 0;
        const callsWithTranscript = transcriptHead.count ?? 0;
        const callAnalysisRows = analysisHead.count ?? 0;
        const callOutcomesRows = outcomesHead.count ?? 0;
        const patternInsights = patternsHead.count ?? 0;
        const aiScriptBlocks = scriptBlocksHead.count ?? 0;
        const transcriptRate = totalCalls > 0 ? (callsWithTranscript / totalCalls) * 100 : 0;

        let state: State = 'not_enough_data';
        if (transcriptRate >= 30 && callOutcomesRows > 0) {
          state = patternInsights > 0 || aiScriptBlocks > 0 ? 'learning_active' : 'collecting_signal';
        }

        if (!active) return;
        setStats({
          totalCalls,
          callsWithTranscript,
          transcriptRate: Math.round(transcriptRate * 10) / 10,
          callAnalysisRows,
          callOutcomesRows,
          patternInsights,
          aiScriptBlocks,
          state,
        });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {de ? 'AI-Learning Status wird geladen…' : 'Loading AI learning status…'}
      </div>
    );
  }

  if (!stats) return null;

  const meta = {
    not_enough_data: {
      icon: AlertTriangle,
      label: de ? 'AI Learning: Nicht genug Daten' : 'AI Learning: Not enough data',
      description: de
        ? 'Lade Transkripte hoch und schließe Calls mit Outcome ab, damit der Lernprozess starten kann.'
        : 'Upload transcripts and close calls with outcome to kick off learning.',
      classes: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
      iconClass: 'text-amber-500',
    },
    collecting_signal: {
      icon: Database,
      label: de ? 'AI Learning: Sammelt Signale' : 'AI Learning: Collecting signal',
      description: de
        ? 'Genug Transkripte und Outcomes vorhanden — Patterns werden noch nicht stabil generiert.'
        : 'Enough transcripts and outcomes — patterns not yet stable.',
      classes: 'border-primary/30 bg-primary/5 text-foreground',
      iconClass: 'text-primary',
    },
    learning_active: {
      icon: Sparkles,
      label: de ? 'AI Learning: Aktiv' : 'AI Learning: Active',
      description: de
        ? 'Patterns und AI-Script-Blöcke werden aus echten Calls generiert. Der Loop ist geschlossen.'
        : 'Patterns and AI script blocks are being generated from real calls. The loop is closed.',
      classes: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
      iconClass: 'text-emerald-500',
    },
  }[stats.state];

  const Icon = meta.icon;

  return (
    <div className={`rounded-2xl border p-4 ${meta.classes}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-background/40 p-2">
          <Icon className={`h-4 w-4 ${meta.iconClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Brain className="h-3.5 w-3.5 opacity-60" />
            <h3 className="text-[13px] font-semibold tracking-tight">{meta.label}</h3>
          </div>
          <p className="text-[11.5px] mt-0.5 opacity-80">{meta.description}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
            <Metric label={de ? 'Calls' : 'Calls'} value={stats.totalCalls} />
            <Metric
              label={de ? 'Transkript-Rate' : 'Transcript rate'}
              value={`${stats.transcriptRate}%`}
              hint={`${stats.callsWithTranscript}/${stats.totalCalls}`}
            />
            <Metric label={de ? 'Outcomes' : 'Outcomes'} value={stats.callOutcomesRows} />
            <Metric label={de ? 'Analysen' : 'Analyses'} value={stats.callAnalysisRows} />
            <Metric label={de ? 'Pattern Insights' : 'Pattern insights'} value={stats.patternInsights} />
            <Metric label={de ? 'AI Script Blocks' : 'AI script blocks'} value={stats.aiScriptBlocks} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5">
      <p className="text-[9.5px] uppercase tracking-wider opacity-60">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[9.5px] opacity-50 tabular-nums">{hint}</p>}
    </div>
  );
}
